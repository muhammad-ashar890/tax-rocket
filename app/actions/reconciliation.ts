"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/app/actions/notifications";

export type ReconciliationMethod = "auto" | "manual";

export type ReconciliationInput = {
  method: ReconciliationMethod;
  note?: string;
  openingWealth: number;
  closingWealth: number;
  gap: number;
};

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
    select: { id: true, userId: true, taxYear: true },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

export async function getReconciliationAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const record = await prisma.filingDraft.findUnique({
      where: { id: draft.id },
      select: {
        reconciliationStatus: true,
        reconciliationMethod: true,
        reconciliationNote: true,
        openingWealth: true,
        closingWealth: true,
        reconciliationGap: true,
      },
    });

    return {
      success: true,
      reconciliation: record,
    };
  } catch (error) {
    console.error("Error fetching reconciliation:", error);
    return { success: false, error: "Failed to fetch reconciliation" };
  }
}

export async function calculateReconciliationPreviewAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [transactions, ledgerEntries] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          balance: { not: null },
        },
        orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
        select: {
          balance: true,
          debit: true,
          credit: true,
        },
      }),
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
    ]);

    if (transactions.length === 0) {
      return {
        success: false,
        error: "Add bank transactions with balances before calculating Mizan",
      };
    }

    const firstTransaction = transactions[0];
    const lastTransaction = transactions[transactions.length - 1];
    const openingWealth =
      (firstTransaction.balance ?? 0) -
      (firstTransaction.credit ?? 0) +
      (firstTransaction.debit ?? 0);
    const closingWealth = lastTransaction.balance ?? 0;
    const totalIncome = ledgerEntries
      .filter((entry) => entry.entryType === "INCOME")
      .reduce((total, entry) => total + entry.amount, 0);
    const totalExpenses = ledgerEntries
      .filter((entry) => entry.entryType === "EXPENSE")
      .reduce((total, entry) => total + entry.amount, 0);
    const gap = closingWealth - openingWealth - (totalIncome - totalExpenses);

    return {
      success: true,
      preview: {
        openingWealth,
        closingWealth,
        totalIncome,
        totalExpenses,
        gap,
      },
    };
  } catch (error) {
    console.error("Error calculating reconciliation preview:", error);
    return {
      success: false,
      error: "Failed to calculate reconciliation preview",
    };
  }
}

export async function saveReconciliationAction(
  draftId: string,
  input: ReconciliationInput,
) {
  try {
    const draft = await getOwnedDraft(draftId);

    if (input.method === "manual" && !input.note?.trim()) {
      return {
        success: false,
        error: "A manual reconciliation note is required",
      };
    }

    await prisma.filingDraft.update({
      where: { id: draft.id },
      data: {
        reconciliationStatus: "RESOLVED",
        reconciliationMethod: input.method,
        reconciliationNote: input.note?.trim() || null,
        openingWealth: input.openingWealth,
        closingWealth: input.closingWealth,
        reconciliationGap: input.gap,
      },
    });

    const gapAbs = Math.abs(input.gap);
    await createNotification({
      userId: draft.userId,
      type: "FILING_STATUS",
      title: `Mizan resolved — Tax Year ${draft.taxYear}`,
      message:
        gapAbs > 0
          ? `Wealth reconciliation completed with a gap of PKR ${gapAbs.toLocaleString()}.`
          : "Wealth reconciliation completed with no gap.",
      link: `/tax/bank-intelligence?draftId=${draft.id}`,
    });

    return { success: true };
  } catch (error) {
    console.error("Error saving reconciliation:", error);
    return { success: false, error: "Failed to save reconciliation" };
  }
}
