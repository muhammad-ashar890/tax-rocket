"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_LEDGER_ENTRIES = 5000;

const LEDGER_ENTRY_TYPES = new Set(["INCOME", "EXPENSE", "ASSET", "LIABILITY"]);

export type LedgerEntryInput = {
  date?: string;
  entryType: string;
  category?: string;
  description?: string;
  amount: string | number;
  source?: string;
  sourceDocumentId?: string;
  sourceTransactionId?: string;
};

function parseAmount(value: string | number) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value.replaceAll(",", "").trim());

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError("Ledger amount must be greater than zero");
  }

  return parsed;
}

function parseEntryDate(value: string | undefined) {
  if (!value?.trim()) return null;

  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid ledger entry date");
  }

  return date;
}

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
    select: { id: true, userId: true },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

async function syncApprovedBankTransactionsToLedgers(draft: {
  id: string;
  userId: string;
}) {
  const approvedTransactions = await prisma.bankTransaction.findMany({
    where: {
      filingDraftId: draft.id,
      userId: draft.userId,
      classificationStatus: "APPROVED",
    },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      debit: true,
      credit: true,
      suggestedEntryType: true,
      suggestedCategory: true,
      sourceDocumentId: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    for (const transaction of approvedTransactions) {
      if (!transaction.suggestedEntryType || !transaction.suggestedCategory) {
        continue;
      }

      const amount =
        transaction.suggestedEntryType === "INCOME" ||
        transaction.suggestedEntryType === "LIABILITY"
          ? transaction.credit
          : transaction.debit;

      if (!amount || amount <= 0) continue;

      const existingLedgerEntry = await tx.ledgerEntry.findFirst({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          sourceTransactionId: transaction.id,
        },
        select: { id: true },
      });

      if (existingLedgerEntry) continue;

      await tx.ledgerEntry.create({
        data: {
          filingDraftId: draft.id,
          userId: draft.userId,
          entryDate: transaction.transactionDate,
          entryType: transaction.suggestedEntryType,
          category: transaction.suggestedCategory,
          description: transaction.description,
          amount: Math.abs(amount),
          source: "BANK_CLASSIFIED",
          sourceDocumentId: transaction.sourceDocumentId,
          sourceTransactionId: transaction.id,
        },
      });
    }
  });
}

export async function getLedgerEntriesAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    await syncApprovedBankTransactionsToLedgers(draft);

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      entries: entries.map((entry) => ({
        id: entry.id,
        date: entry.entryDate?.toISOString().slice(0, 10) ?? "",
        entryType: entry.entryType,
        category: entry.category ?? "",
        description: entry.description,
        amount: entry.amount.toString(),
        source: entry.source,
      })),
    };
  } catch (error) {
    console.error("Error fetching ledger entries:", error);
    return {
      success: false,
      error: "Failed to fetch ledger entries",
      entries: [],
    };
  }
}

export async function replaceLedgerEntriesAction(
  draftId: string,
  entries: LedgerEntryInput[],
) {
  try {
    const draft = await getOwnedDraft(draftId);

    if (entries.length > MAX_LEDGER_ENTRIES) {
      return {
        success: false,
        error: `A maximum of ${MAX_LEDGER_ENTRIES} ledger entries is allowed`,
      };
    }

    const entryData = entries.map((entry) => {
      const entryType = entry.entryType.toUpperCase();
      if (!LEDGER_ENTRY_TYPES.has(entryType)) {
        throw new TypeError("Invalid ledger entry type");
      }

      return {
        filingDraftId: draft.id,
        userId: draft.userId,
        entryDate: parseEntryDate(entry.date),
        entryType,
        category: String(entry.category ?? "").trim() || null,
        description: String(entry.description ?? "").trim(),
        amount: parseAmount(entry.amount),
        source: String(entry.source ?? "MANUAL"),
        sourceDocumentId: entry.sourceDocumentId || null,
        sourceTransactionId: entry.sourceTransactionId || null,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
      });

      if (entryData.length > 0) {
        await tx.ledgerEntry.createMany({ data: entryData });
      }
    });

    return { success: true, count: entryData.length };
  } catch (error) {
    console.error("Error saving ledger entries:", error);
    return { success: false, error: "Failed to save ledger entries" };
  }
}
