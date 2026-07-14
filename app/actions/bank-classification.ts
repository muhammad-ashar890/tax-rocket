"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CLASSIFICATION_RULES = [
  {
    keywords: ["salary", "payroll", "wages", "compensation"],
    entryType: "INCOME",
    category: "SALARY",
    confidence: 0.95,
  },
  {
    keywords: ["rent", "k-electric", "electricity", "gas bill", "utility"],
    entryType: "EXPENSE",
    category: "UTILITIES_OR_RENT",
    confidence: 0.9,
  },
  {
    keywords: ["fuel", "petrol", "psos", "shell", "total"],
    entryType: "EXPENSE",
    category: "TRANSPORT",
    confidence: 0.88,
  },
  {
    keywords: ["grocery", "mart", "superstore", "restaurant", "food"],
    entryType: "EXPENSE",
    category: "PERSONAL_EXPENSE",
    confidence: 0.8,
  },
  {
    keywords: ["tax", "withholding", "fbr"],
    entryType: "EXPENSE",
    category: "TAX_PAYMENT",
    confidence: 0.9,
  },
] as const;

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

function classifyDescription(description: string) {
  const normalized = description.toLowerCase();
  const rule = CLASSIFICATION_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => normalized.includes(keyword)),
  );

  if (!rule) {
    return {
      status: "UNREVIEWED",
      entryType: null,
      category: null,
      confidence: 0,
    };
  }

  return {
    status: "SUGGESTED",
    entryType: rule.entryType,
    category: rule.category,
    confidence: rule.confidence,
  };
}

export async function classifyBankTransactionsAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      orderBy: { createdAt: "asc" },
    });

    const suggestions = transactions.map((transaction) => ({
      id: transaction.id,
      ...classifyDescription(transaction.description),
    }));

    await prisma.$transaction(
      suggestions.map((suggestion) =>
        prisma.bankTransaction.update({
          where: { id: suggestion.id },
          data: {
            classificationStatus: suggestion.status,
            suggestedEntryType: suggestion.entryType,
            suggestedCategory: suggestion.category,
          },
        }),
      ),
    );

    return { success: true, suggestions };
  } catch (error) {
    console.error("Error classifying bank transactions:", error);
    return { success: false, error: "Failed to classify bank transactions" };
  }
}

export async function reviewBankTransactionClassificationAction(
  draftId: string,
  transactionId: string,
  decision: "APPROVE" | "REJECT",
) {
  try {
    const draft = await getOwnedDraft(draftId);
    const transaction = await prisma.bankTransaction.findFirst({
      where: {
        id: transactionId,
        filingDraftId: draft.id,
        userId: draft.userId,
      },
    });

    if (!transaction) {
      return { success: false, error: "Bank transaction not found" };
    }

    if (decision === "REJECT") {
      await prisma.$transaction(async (tx) => {
        await tx.ledgerEntry.deleteMany({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
            sourceTransactionId: transaction.id,
          },
        });

        await tx.bankTransaction.update({
          where: { id: transaction.id },
          data: { classificationStatus: "REJECTED" },
        });
      });

      return { success: true, decision };
    }

    if (!transaction.suggestedEntryType || !transaction.suggestedCategory) {
      return { success: false, error: "This transaction has no suggestion to approve" };
    }

    const amount =
      transaction.suggestedEntryType === "INCOME"
        ? transaction.credit
        : transaction.debit;

    if (!amount || amount <= 0) {
      return { success: false, error: "Transaction has no usable amount" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          sourceTransactionId: transaction.id,
        },
      });

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

      await tx.bankTransaction.update({
        where: { id: transaction.id },
        data: { classificationStatus: "APPROVED" },
      });
    });

    return { success: true, decision };
  } catch (error) {
    console.error("Error reviewing bank classification:", error);
    return { success: false, error: "Failed to review bank classification" };
  }
}
