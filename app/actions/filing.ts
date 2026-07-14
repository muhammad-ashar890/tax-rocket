"use server";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FILING_STATUS } from "@/lib/tax/filing-status";

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

export async function createFilingDraftAction(formData: FormData) {
  try {
    const userId = await getCurrentUserId();

    // Parse form data
    const taxYear = parseInt(formData.get("taxYear") as string, 10);
    const filerType = formData.get("filerType") as string;
    const businessStructure = formData.get("businessStructure") as
      | string
      | null;
    const salaryPercentage = formData.get("salaryPercentage") as string | null;

    const incomeSources = formData.getAll("incomeSources").map(String);
    const incomeSourcesJson = JSON.stringify(incomeSources);

    // Upsert avoids the P2002 Unique Constraint error if a draft already exists for this year
    const newDraft = await prisma.filingDraft.upsert({
      where: {
        userId_taxYear: {
          userId: userId,
          taxYear: taxYear,
        },
      },
      update: {
        filerType,
        businessStructure,
        salaryPercentage,
        incomeSources: incomeSourcesJson,
        currentStep: 8,
        status: "IN_PROGRESS",
      },
      create: {
        userId,
        taxYear,
        filerType,
        businessStructure,
        salaryPercentage,
        incomeSources: incomeSourcesJson,
        currentStep: 8,
        status: "IN_PROGRESS",
      },
    });

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/filings");

    return { success: true, draftId: newDraft.id };
  } catch (error) {
    console.error("Error creating filing draft:", error);
    return { success: false, error: "Failed to create filing draft" };
  }
}

export async function approveFilingDraftAction(draftId: string) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);
    const latestPacket = await prisma.filingPacket.findFirst({
      where: {
        filingDraftId: ownedDraftId,
        userId,
      },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (!latestPacket) {
      return {
        success: false,
        error: "Generate a filing packet before approval",
      };
    }

    await prisma.$transaction([
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
      }),
    ]);

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/history");
    revalidatePath("/tax/fbr-connect");

    return { success: true };
  } catch (error) {
    console.error("Error approving filing draft:", error);
    return { success: false, error: "Failed to approve filing" };
  }
}

export async function updateFilingStepAction(
  draftId: string,
  newStep: number,
  status: string = "IN_PROGRESS",
) {
  try {
    // Basic validation to avoid breaking if an old demo draftId is passed
    // that doesn't exist in Prisma (e.g. "draft_xxxxxx")
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const userId = await getCurrentUserId();
    const ownedDraftId = await getOwnedDraftId(draftId, userId);

    await prisma.filingDraft.update({
      where: { id: ownedDraftId },
      data: {
        currentStep: newStep,
        status: status,
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

    // Transform JSON strings back to arrays to match component expectations
    return {
      success: true,
      draft: {
        ...draft,
        incomeSources: JSON.parse(draft.incomeSources),
        readinessCompleted: JSON.parse(draft.readinessChecks),
      },
    };
  } catch (error) {
    return { success: false, error: "Failed to fetch draft" };
  }
}

export async function updateFilingDraftAction(draftId: string, formData: any) {
  try {
    if (draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }

    const dataToUpdate: any = {};

    if (formData.filerType !== undefined)
      dataToUpdate.filerType = formData.filerType;
    if (formData.businessStructure !== undefined)
      dataToUpdate.businessStructure = formData.businessStructure;
    if (formData.salaryPercentage !== undefined)
      dataToUpdate.salaryPercentage = formData.salaryPercentage;

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
