"use server";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import { createNotification } from "@/app/actions/notifications";
import { generateFilingPacketAction } from "@/app/actions/packet";
import { authOptions } from "@/lib/auth";
import { FILING_STATUS } from "@/lib/tax/filing-status";
import { prisma } from "@/lib/prisma";

async function getCurrentUserId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: session.user?.name ?? null,
      image: session.user?.image ?? null,
    },
    create: {
      email,
      name: session.user?.name ?? null,
      image: session.user?.image ?? null,
    },
    select: { id: true },
  });

  return user.id;
}

async function getOwnedDraftId(draftId: string, userId: string) {
  const draft = await prisma.filingDraft.findFirst({
    where: { id: draftId, userId },
    select: { id: true },
  });

  if (!draft) {
    throw new Error("Filing draft not found");
  }

  return draft.id;
}

type ParsedFilingDraftInput = {
  taxYear: number;
  filerType: string | null;
  businessStructure: string | null;
  salaryPercentage: string | null;
  incomeSources: string[];
  readinessCompleted: string[];
};

function parseFilingDraftInput(formData: FormData) {
  const taxYear = Number(formData.get("taxYear"));

  if (!Number.isInteger(taxYear) || taxYear < 2000) {
    return { error: "Select a valid tax year" } as const;
  }

  const filerTypeValue = String(formData.get("filerType") ?? "").trim();
  const businessStructureValue = String(
    formData.get("businessStructure") ?? "",
  ).trim();
  const salaryPercentageValue = String(
    formData.get("salaryPercentage") ?? "",
  ).trim();

  const parsed: ParsedFilingDraftInput = {
    taxYear,
    filerType: filerTypeValue || null,
    businessStructure: businessStructureValue || null,
    salaryPercentage: salaryPercentageValue || null,
    incomeSources: formData.getAll("incomeSources").map(String),
    readinessCompleted: formData.getAll("readinessCompleted").map(String),
  };

  return { value: parsed } as const;
}

function getDocumentsStepIndex(input: ParsedFilingDraftInput) {
  let setupStepCount = 1; // Who is filing?
  const needsIncomeSourceSelection =
    input.filerType === "myself" ||
    (input.filerType === "my_business" &&
      input.businessStructure === "sole_proprietor");

  if (input.filerType === "my_business") setupStepCount += 1;
  if (needsIncomeSourceSelection) setupStepCount += 1;

  if (
    needsIncomeSourceSelection &&
    input.incomeSources.includes("salary") &&
    input.incomeSources.length >= 2
  ) {
    setupStepCount += 1;
  }

  // Tax year + readiness + review/create.
  return setupStepCount + 3;
}

function getRequestedStep(formData: FormData) {
  const requestedStep = Number(formData.get("currentStep"));
  return Number.isInteger(requestedStep) && requestedStep >= 0
    ? requestedStep
    : 0;
}

async function upsertFilingDraft(
  userId: string,
  input: ParsedFilingDraftInput,
  currentStep: number,
) {
  return prisma.filingDraft.upsert({
    where: {
      userId_taxYear: {
        userId,
        taxYear: input.taxYear,
      },
    },
    update: {
      filerType: input.filerType,
      businessStructure: input.businessStructure,
      salaryPercentage: input.salaryPercentage,
      incomeSources: JSON.stringify(input.incomeSources),
      readinessChecks: JSON.stringify(input.readinessCompleted),
      currentStep,
      status: "IN_PROGRESS",
    },
    create: {
      userId,
      taxYear: input.taxYear,
      filerType: input.filerType,
      businessStructure: input.businessStructure,
      salaryPercentage: input.salaryPercentage,
      incomeSources: JSON.stringify(input.incomeSources),
      readinessChecks: JSON.stringify(input.readinessCompleted),
      currentStep,
      status: "IN_PROGRESS",
    },
  });
}

export async function getActiveFilingOptionsAction() {
  try {
    const userId = await getCurrentUserId();
    const drafts = await prisma.filingDraft.findMany({
      where: {
        userId,
        // Do not trust APPROVED_FOR_FILING alone here: an old/stale status
        // can exist while the current wizard still needs rules or Mizan.
        status: { not: "FILED" },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        taxYear: true,
        status: true,
        updatedAt: true,
        packetApprovalConfirmed: true,
        taxCalculationStatus: true,
        reconciliationStatus: true,
        reconciliationGap: true,
        filingPackets: {
          where: { status: { not: "SUPERSEDED" } },
          orderBy: { version: "desc" },
          take: 1,
          select: { approvalStatus: true },
        },
      },
    });

    const activeDrafts = drafts.filter((draft) => {
      const latestPacket = draft.filingPackets[0];
      const isCurrentlyApproved =
        draft.status === "APPROVED_FOR_FILING" &&
        draft.packetApprovalConfirmed &&
        draft.taxCalculationStatus === "ESTIMATE" &&
        draft.reconciliationStatus === "RESOLVED" &&
        Math.abs(draft.reconciliationGap ?? 0) <= 0.01 &&
        latestPacket?.approvalStatus === "APPROVED";

      return !isCurrentlyApproved;
    });

    return {
      success: true,
      filings: activeDrafts.map(({ filingPackets: _packets, ...draft }) => ({
        ...draft,
        updatedAt: draft.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Error fetching active filing options:", error);
    return {
      success: false,
      error: "Failed to fetch active filings",
      filings: [],
    };
  }
}

export async function createFilingDraftAction(formData: FormData) {
  try {
    const parsedResult = parseFilingDraftInput(formData);
    if ("error" in parsedResult) {
      return { success: false, error: parsedResult.error };
    }

    const input = parsedResult.value;
    if (!input.filerType) {
      return { success: false, error: "Select who is filing" };
    }

    if (input.filerType === "my_business" && !input.businessStructure) {
      return { success: false, error: "Select a business structure" };
    }

    const needsIncomeSourceSelection =
      input.filerType === "myself" ||
      (input.filerType === "my_business" &&
        input.businessStructure === "sole_proprietor");

    if (needsIncomeSourceSelection && input.incomeSources.length === 0) {
      return { success: false, error: "Select at least one income source" };
    }

    if (
      needsIncomeSourceSelection &&
      input.incomeSources.includes("salary") &&
      input.incomeSources.length >= 2 &&
      !input.salaryPercentage
    ) {
      return { success: false, error: "Specify the salary share" };
    }

    const userId = await getCurrentUserId();
    const documentsStepIndex = getDocumentsStepIndex(input);
    const draft = await upsertFilingDraft(userId, input, documentsStepIndex);

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/filings");

    return { success: true, draftId: draft.id };
  } catch (error) {
    console.error("Error creating filing draft:", error);
    return { success: false, error: "Failed to create filing draft" };
  }
}

export async function saveFilingDraftAction(formData: FormData) {
  try {
    const parsedResult = parseFilingDraftInput(formData);
    if ("error" in parsedResult) {
      return { success: false, error: parsedResult.error };
    }

    const userId = await getCurrentUserId();
    const draft = await upsertFilingDraft(
      userId,
      parsedResult.value,
      getRequestedStep(formData),
    );

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/filings");

    return { success: true, draftId: draft.id };
  } catch (error) {
    console.error("Error saving filing draft:", error);
    return { success: false, error: "Failed to save filing draft" };
  }
}

export async function confirmFilingForPacketAction(
  draftId: string,
  confirmed: boolean,
) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);

    const [draft, activePacket, user] = await Promise.all([
      prisma.filingDraft.findUnique({
        where: { id: ownedDraftId },
        select: {
          taxCalculationStatus: true,
          reconciliationStatus: true,
          reconciliationGap: true,
          packetApprovalConfirmed: true,
        },
      }),
      prisma.filingPacket.findFirst({
        where: {
          filingDraftId: ownedDraftId,
          userId,
          status: { not: "SUPERSEDED" },
        },
        orderBy: { version: "desc" },
        select: { id: true, approvalStatus: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { practicePreferences: true },
      }),
    ]);

    if (!draft) {
      return { success: false, error: "Filing draft not found" };
    }

    if (confirmed) {
      const [documents, transactions] = await Promise.all([
        prisma.document.findMany({
          where: { filingDraftId: ownedDraftId, userId },
          select: { extractionStatus: true },
        }),
        prisma.bankTransaction.findMany({
          where: { filingDraftId: ownedDraftId, userId },
          select: { classificationStatus: true },
        }),
      ]);

      const blockers: string[] = [];
      if (
        documents.some(
          (document) =>
            !["COMPLETED", "MAPPED"].includes(document.extractionStatus),
        )
      ) {
        blockers.push("Review all uploaded document extractions");
      }
      if (
        transactions.some(
          (transaction) =>
            !["APPROVED", "REJECTED", "TRANSFER", "CASH_MOVEMENT"].includes(
              transaction.classificationStatus,
            ),
        )
      ) {
        blockers.push("Classify and review all bank transactions");
      }
      if (draft.taxCalculationStatus !== "ESTIMATE") {
        blockers.push("Complete a supported tax calculation");
      }
      if (
        draft.reconciliationStatus !== "RESOLVED" ||
        Math.abs(draft.reconciliationGap ?? 0) > 0.01
      ) {
        blockers.push("Resolve the remaining Mizan gap");
      }

      if (blockers.length > 0) {
        return { success: false, error: blockers.join(" · ") };
      }
    }

    if (!confirmed && activePacket?.approvalStatus === "APPROVED") {
      return {
        success: false,
        error:
          "Approval is locked for the generated packet. Update filing data to create a new version.",
      };
    }

    await prisma.filingDraft.update({
      where: { id: ownedDraftId },
      data: {
        packetApprovalConfirmed: confirmed,
        packetApprovalAt: confirmed ? new Date() : null,
        packetApprovalByUserId: confirmed ? userId : null,
      },
    });

    // Safe automation: explicit user approval is still required first. This
    // setting only removes the extra Generate Packet click after approval; it
    // can never bypass the approval and validation gates above.
    let autoGeneratedPacket: Awaited<
      ReturnType<typeof generateFilingPacketAction>
    >["packet"];
    if (
      confirmed &&
      (!activePacket || activePacket.approvalStatus !== "APPROVED") &&
      user &&
      (() => {
        try {
          const practice = JSON.parse(user.practicePreferences) as Record<
            string,
            unknown
          >;
          return practice.autoGeneratePackets === true;
        } catch {
          return false;
        }
      })()
    ) {
      const packetResult = await generateFilingPacketAction(ownedDraftId);
      if (!packetResult.success) {
        return {
          success: false,
          error:
            packetResult.error ??
            "Approval saved, but packet generation failed",
        };
      }
      autoGeneratedPacket = packetResult.packet;
    }

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/history");
    revalidatePath("/tax/new");

    return { success: true, packet: autoGeneratedPacket };
  } catch (error) {
    console.error("Error confirming filing for packet:", error);
    return { success: false, error: "Failed to save packet approval" };
  }
}

export async function approveFilingDraftAction(draftId: string) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);
    const [draft, latestPacket, documents, transactions] = await Promise.all([
      prisma.filingDraft.findUnique({
        where: { id: ownedDraftId },
        select: {
          taxYear: true,
          packetApprovalConfirmed: true,
          taxCalculationStatus: true,
          reconciliationStatus: true,
          reconciliationGap: true,
        },
      }),
      prisma.filingPacket.findFirst({
        where: {
          filingDraftId: ownedDraftId,
          userId,
          status: { not: "SUPERSEDED" },
        },
        orderBy: { version: "desc" },
        select: { id: true },
      }),
      prisma.document.findMany({
        where: { filingDraftId: ownedDraftId, userId },
        select: { extractionStatus: true },
      }),
      prisma.bankTransaction.findMany({
        where: { filingDraftId: ownedDraftId, userId },
        select: { classificationStatus: true },
      }),
    ]);

    if (!draft || !latestPacket) {
      return {
        success: false,
        error: "A current filing packet is not available for approval",
      };
    }

    const blockers: string[] = [];
    if (!draft.packetApprovalConfirmed) {
      blockers.push("Approve the current filing data from the filing wizard");
    }
    if (draft.taxCalculationStatus !== "ESTIMATE") {
      blockers.push("Complete a supported tax calculation");
    }
    if (
      draft.reconciliationStatus !== "RESOLVED" ||
      Math.abs(draft.reconciliationGap ?? 0) > 0.01
    ) {
      blockers.push("Resolve the remaining Mizan gap");
    }
    if (
      documents.some(
        (document) =>
          !["COMPLETED", "MAPPED"].includes(document.extractionStatus),
      )
    ) {
      blockers.push("Review all uploaded document extractions");
    }
    if (
      transactions.some(
        (transaction) =>
          !["APPROVED", "REJECTED", "TRANSFER", "CASH_MOVEMENT"].includes(
            transaction.classificationStatus,
          ),
      )
    ) {
      blockers.push("Classify and review all bank transactions");
    }

    if (blockers.length > 0) {
      return { success: false, error: blockers.join(" · ") };
    }

    const [, updatedDraft] = await prisma.$transaction([
      prisma.filingPacket.update({
        where: { id: latestPacket.id },
        data: {
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedByUserId: userId,
        },
      }),
      prisma.filingDraft.update({
        where: { id: ownedDraftId },
        data: { status: FILING_STATUS.APPROVED_FOR_FILING },
        select: { taxYear: true },
      }),
    ]);

    await createNotification({
      userId,
      type: "FILING_STATUS",
      title: `Filing approved — Tax Year ${updatedDraft.taxYear}`,
      message: "Your filing packet is approved and ready for FBR Connect.",
      link: `/tax/fbr-connect?draftId=${ownedDraftId}`,
    });

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/history");
    revalidatePath("/tax/fbr-connect");

    return { success: true };
  } catch (error) {
    console.error("Error approving filing draft:", error);
    return { success: false, error: "Failed to approve filing" };
  }
}

export async function invalidateFilingPipelineAction(
  draftId: string,
  resetStep: number,
  preserveReconciliation = false,
) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);

    await prisma.$transaction(async (tx) => {
      await tx.filingDraft.update({
        where: { id: ownedDraftId },
        data: {
          currentStep: resetStep,
          status: "IN_PROGRESS",
          ...(preserveReconciliation
            ? {}
            : {
                reconciliationStatus: "UNRESOLVED",
                reconciliationMethod: null,
                reconciliationNote: null,
                openingWealth: null,
                closingWealth: null,
                reconciliationGap: null,
              }),
          taxableIncome: null,
          taxWithheld: null,
          taxPayable: null,
          refundDue: null,
          taxCalculationStatus: "NOT_CALCULATED",
          packetApprovalConfirmed: false,
          packetApprovalAt: null,
          packetApprovalByUserId: null,
        },
      });

      await tx.filingPacket.updateMany({
        where: {
          filingDraftId: ownedDraftId,
          userId,
          status: { not: "SUPERSEDED" },
        },
        data: {
          status: "SUPERSEDED",
          approvalStatus: "SUPERSEDED",
        },
      });

      await tx.fbrConnection.updateMany({
        where: { filingDraftId: ownedDraftId, userId },
        data: {
          status: "NOT_STARTED",
          agentId: null,
          message: null,
          errorMessage: null,
          lastHeartbeat: null,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/history");
    revalidatePath("/tax/fbr-connect");

    return { success: true };
  } catch (error) {
    console.error("Error invalidating filing pipeline:", error);
    return { success: false, error: "Failed to reset downstream filing steps" };
  }
}

export async function updateFilingStepAction(
  draftId: string,
  newStep: number,
  status = "IN_PROGRESS",
) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);

    await prisma.filingDraft.update({
      where: { id: ownedDraftId },
      data: {
        currentStep: newStep,
        status,
      },
    });

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/filings");

    return { success: true };
  } catch (error) {
    console.error("Error updating filing step:", error);
    return { success: false, error: "Failed to update step" };
  }
}

export async function getFilingDraftAction(draftId: string) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const draft = await prisma.filingDraft.findFirst({
      where: { id: draftId, userId },
    });

    if (!draft) return { success: false, error: "Not found" };

    return {
      success: true,
      draft: {
        ...draft,
        incomeSources: JSON.parse(draft.incomeSources),
        readinessCompleted: JSON.parse(draft.readinessChecks),
      },
    };
  } catch (error) {
    console.error("Error fetching filing draft:", error);
    return { success: false, error: "Failed to fetch draft" };
  }
}

export type FilingDraftUpdateInput = Readonly<{
  taxYear?: number;
  filerType?: string | null;
  businessStructure?: string | null;
  salaryPercentage?: string | null;
  incomeSources?: string[];
  readinessCompleted?: string[];
}>;

export async function updateFilingDraftAction(
  draftId: string,
  formData: FilingDraftUpdateInput,
) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const dataToUpdate: {
      taxYear?: number;
      filerType?: string | null;
      businessStructure?: string | null;
      salaryPercentage?: string | null;
      incomeSources?: string;
      readinessChecks?: string;
    } = {};

    if (formData.taxYear !== undefined) {
      if (!Number.isInteger(formData.taxYear) || formData.taxYear < 2000) {
        return { success: false, error: "Select a valid tax year" };
      }
      dataToUpdate.taxYear = formData.taxYear;
    }

    if (formData.filerType !== undefined) {
      dataToUpdate.filerType = formData.filerType || null;
    }
    if (formData.businessStructure !== undefined) {
      dataToUpdate.businessStructure = formData.businessStructure || null;
    }
    if (formData.salaryPercentage !== undefined) {
      dataToUpdate.salaryPercentage = formData.salaryPercentage || null;
    }
    if (formData.incomeSources !== undefined) {
      dataToUpdate.incomeSources = JSON.stringify(formData.incomeSources);
    }
    if (formData.readinessCompleted !== undefined) {
      dataToUpdate.readinessChecks = JSON.stringify(
        formData.readinessCompleted,
      );
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);

    await prisma.filingDraft.update({
      where: { id: ownedDraftId },
      data: dataToUpdate,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating draft:", error);
    return { success: false, error: "Failed to update draft" };
  }
}
