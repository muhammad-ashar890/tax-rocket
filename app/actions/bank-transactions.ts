"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TRANSACTION_ROWS = 5000;

export type BankTransactionInput = {
  date?: string;
  description?: string;
  debit?: string | number;
  credit?: string | number;
  balance?: string | number;
  source?: string;
};

function parseAmount(value: string | number | undefined) {
  if (value === undefined || value === "") return null;

  const parsed =
    typeof value === "number" ? value : Number(value.replaceAll(",", "").trim());

  if (!Number.isFinite(parsed)) {
    throw new TypeError("Invalid transaction amount");
  }

  return parsed;
}

function parseTransactionDate(value: string | undefined) {
  if (!value?.trim()) return null;

  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid transaction date");
  }

  return date;
}

async function getOwnedDraft(draftId: string) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User profile not found");
  }

  const draft = await prisma.filingDraft.findFirst({
    where: {
      id: draftId,
      userId: user.id,
    },
    select: { id: true, userId: true },
  });

  if (!draft) {
    throw new Error("Filing draft not found");
  }

  return draft;
}

export async function getBankTransactionsAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [transactions, statementDocument] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.document.findFirst({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          documentType: "bank_statement",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
        },
      }),
    ]);

    return {
      success: true,
      statementDocument: statementDocument
        ? {
            id: statementDocument.id,
            fileName: statementDocument.fileName,
          }
        : null,
      rows: transactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.transactionDate
          ? transaction.transactionDate.toISOString().slice(0, 10)
          : "",
        description: transaction.description,
        debit: transaction.debit?.toString() ?? "",
        credit: transaction.credit?.toString() ?? "",
        balance: transaction.balance?.toString() ?? "",
        source: transaction.source,
      })),
    };
  } catch (error) {
    console.error("Error fetching bank transactions:", error);
    return {
      success: false,
      error: "Failed to fetch bank transactions",
      statementDocument: null,
      rows: [],
    };
  }
}

export async function replaceBankTransactionsAction(
  draftId: string,
  rows: BankTransactionInput[],
) {
  try {
    const draft = await getOwnedDraft(draftId);

    if (rows.length > MAX_TRANSACTION_ROWS) {
      return {
        success: false,
        error: `A maximum of ${MAX_TRANSACTION_ROWS} transaction rows is allowed`,
      };
    }

    const transactionData = rows.map((row) => ({
      filingDraftId: draft.id,
      userId: draft.userId,
      transactionDate: parseTransactionDate(row.date),
      description: String(row.description ?? "").trim(),
      debit: parseAmount(row.debit),
      credit: parseAmount(row.credit),
      balance: parseAmount(row.balance),
      source: String(row.source ?? "MANUAL"),
    }));

    await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.deleteMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
      });

      if (transactionData.length > 0) {
        await tx.bankTransaction.createMany({ data: transactionData });
      }
    });

    return { success: true, count: transactionData.length };
  } catch (error) {
    console.error("Error saving bank transactions:", error);
    return { success: false, error: "Failed to save bank transactions" };
  }
}
