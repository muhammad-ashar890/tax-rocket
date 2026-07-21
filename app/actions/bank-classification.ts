"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CLASSIFICATION_RULES = [
  {
    keywords: ["tax", "withholding", "fbr", "fed", "federal excise"],
    entryType: "EXPENSE",
    category: "TAX_PAYMENT",
    confidence: 0.9,
  },
  {
    keywords: [
      "bank charge",
      "bank charges",
      "bank fee",
      "bank fees",
      "service charge",
      "annual fee",
      "account maintenance",
      "maintenance fee",
    ],
    entryType: "EXPENSE",
    category: "BANK_CHARGES",
    confidence: 0.92,
  },
  {
    keywords: [
      "rent",
      "k-electric",
      "k electric",
      "electricity",
      "gas bill",
      "utility",
      " ke ",
    ],
    entryType: "EXPENSE",
    category: "UTILITIES_OR_RENT",
    confidence: 0.9,
  },
  {
    keywords: ["fuel", "petrol", "pso", "psos", "shell", "total"],
    entryType: "EXPENSE",
    category: "TRANSPORT",
    confidence: 0.88,
  },
  {
    keywords: ["salary", "payroll", "wages", "compensation"],
    entryType: "INCOME",
    category: "SALARY",
    confidence: 0.95,
  },
  {
    keywords: ["grocery", "mart", "superstore", "restaurant", "food"],
    entryType: "EXPENSE",
    category: "PERSONAL_EXPENSE",
    confidence: 0.8,
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

function normalizeDescription(description: string) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(normalized: string, keyword: string) {
  const normalizedKeyword = normalizeDescription(keyword);
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.length <= 2) {
    return normalized.split(" ").includes(normalizedKeyword);
  }

  return normalized.includes(normalizedKeyword);
}

function classifyDescription(description: string) {
  const normalized = normalizeDescription(description);

  // ATM withdrawals are cash movements, not automatically expenses.
  // Leave them for explicit review instead of letting a merchant name such
  // as Shell trigger the transport rule.
  if (
    normalized.includes("cash withdrawal") ||
    normalized.includes("atm cash") ||
    normalized.includes("visa atm")
  ) {
    return {
      status: "UNREVIEWED",
      entryType: null,
      category: null,
      confidence: 0,
    };
  }

  const rule = CLASSIFICATION_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => matchesKeyword(normalized, keyword)),
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

function classifyTransaction(transaction: {
  description: string;
  debit: number | null;
  credit: number | null;
}) {
  const descriptionSuggestion = classifyDescription(transaction.description);

  if (descriptionSuggestion.status !== "UNREVIEWED") {
    return descriptionSuggestion;
  }

  // A generic incoming credit is not automatically taxable income. Surface it
  // as a potential-income decision so the user can choose income, internal
  // transfer, or exclusion explicitly.
  if ((transaction.credit ?? 0) > 0 && !(transaction.debit ?? 0)) {
    return {
      status: "POTENTIAL_INCOME",
      entryType: "INCOME",
      category: "POTENTIAL_INCOME",
      confidence: 0.55,
    };
  }

  return descriptionSuggestion;
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

    const finalStatuses = new Set(["APPROVED", "REJECTED", "TRANSFER"]);
    const suggestions = transactions.map((transaction) => {
      if (finalStatuses.has(transaction.classificationStatus)) {
        return {
          id: transaction.id,
          status: transaction.classificationStatus,
          entryType: transaction.suggestedEntryType,
          category: transaction.suggestedCategory,
          confidence: 1,
        };
      }

      return {
        id: transaction.id,
        ...classifyTransaction(transaction),
      };
    });

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
  decision: "APPROVE" | "REJECT" | "TRANSFER",
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

    if (decision === "TRANSFER") {
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
          data: {
            classificationStatus: "TRANSFER",
            suggestedEntryType: null,
            suggestedCategory: "INTERNAL_TRANSFER",
          },
        });
      });

      return { success: true, decision };
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
      return {
        success: false,
        error: "This transaction has no suggestion to approve",
      };
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
