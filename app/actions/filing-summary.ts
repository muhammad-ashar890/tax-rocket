"use server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequiredTaxDocumentTypesForCurrentFlow } from "@/lib/tax/document-requirements";

async function getOwnedDraft(draftId: string) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) throw new Error("User profile not found");

  const draft = await prisma.filingDraft.findFirst({
    where: { id: draftId, userId: user.id },
    select: { id: true, userId: true, incomeSources: true },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

export async function getFilingSummaryAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [entries, documents, currentDraft] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
        select: {
          entryType: true,
          amount: true,
        },
      }),
      prisma.document.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
        orderBy: { createdAt: "desc" },
        select: { documentType: true, extractionStatus: true },
      }),
      prisma.filingDraft.findUnique({
        where: { id: draft.id },
        select: {
          reconciliationStatus: true,
          reconciliationGap: true,
          taxableIncome: true,
          taxWithheld: true,
          taxPayable: true,
          refundDue: true,
          taxCalculationStatus: true,
        },
      }),
    ]);

    let incomeSources: string[] = [];
    try {
      const parsed = JSON.parse(draft.incomeSources);
      incomeSources = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      incomeSources = [];
    }

    const requiredDocumentTypes = new Set(
      getRequiredTaxDocumentTypesForCurrentFlow({
        incomeSources: incomeSources as any,
      }),
    );
    const latestRequiredDocuments = Array.from(
      new Map(
        documents
          .filter((document) =>
            requiredDocumentTypes.has(document.documentType),
          )
          .map((document) => [document.documentType, document]),
      ).values(),
    );

    const totals = entries.reduce(
      (result, entry) => {
        if (entry.entryType === "INCOME") result.income += entry.amount;
        if (entry.entryType === "EXPENSE") result.expenses += entry.amount;
        if (entry.entryType === "ASSET") result.assets += entry.amount;
        if (entry.entryType === "LIABILITY") result.liabilities += entry.amount;
        return result;
      },
      { income: 0, expenses: 0, assets: 0, liabilities: 0 },
    );

    return {
      success: true,
      summary: {
        ...totals,
        ledgerEntryCount: entries.length,
        documentCount: latestRequiredDocuments.length,
        pendingDocumentCount: latestRequiredDocuments.filter(
          (document) => document.extractionStatus === "PENDING",
        ).length,
        reconciliationStatus:
          currentDraft?.reconciliationStatus ?? "UNRESOLVED",
        reconciliationGap: currentDraft?.reconciliationGap ?? null,
        taxableIncome: currentDraft?.taxableIncome ?? null,
        taxWithheld: currentDraft?.taxWithheld ?? null,
        taxPayable: currentDraft?.taxPayable ?? null,
        refundDue: currentDraft?.refundDue ?? null,
        taxCalculationStatus:
          currentDraft?.taxCalculationStatus ?? "NOT_CALCULATED",
      },
    };
  } catch (error) {
    console.error("Error fetching filing summary:", error);
    return { success: false, error: "Failed to fetch filing summary" };
  }
}
