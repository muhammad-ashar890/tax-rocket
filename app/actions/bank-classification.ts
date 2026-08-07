"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSession } from "next-auth/next";

import { createNotification } from "@/app/actions/notifications";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateTaxYearStatement } from "@/lib/tax/tax-year-period";

const CLASSIFICATION_RULES = [
  {
    keywords: ["tax", "withholding", "fbr", "fed", "federal excise"],
    entryType: "EXPENSE",
    category: "TAX_PAYMENT",
    confidence: 0.9,
  },
  {
    keywords: ["bank profit", "profit credited", "profit payment", "markup"],
    entryType: "INCOME",
    category: "BANK_PROFIT",
    confidence: 0.88,
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
    keywords: ["rent received", "rental income", "rent credited"],
    entryType: "INCOME",
    category: "PROPERTY_RENT",
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
    keywords: [
      "grocery",
      "groceries",
      "mart",
      "superstore",
      "restaurant",
      "food",
    ],
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
    select: { id: true, userId: true, taxYear: true },
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
  const normalized = normalizeDescription(transaction.description);
  const descriptionSuggestion = classifyDescription(transaction.description);

  if (descriptionSuggestion.status !== "UNREVIEWED") {
    return descriptionSuggestion;
  }

  const hasCredit = (transaction.credit ?? 0) > 0 && !(transaction.debit ?? 0);
  const hasDebit = (transaction.debit ?? 0) > 0 && !(transaction.credit ?? 0);

  if (
    hasCredit &&
    [
      "loan",
      "financing",
      "credit facility",
      "loan proceeds",
      "loan disbursement",
    ].some((keyword) => matchesKeyword(normalized, keyword))
  ) {
    return {
      status: "POTENTIAL_LIABILITY",
      entryType: "LIABILITY",
      category: "LOAN_PROCEEDS",
      confidence: 0.7,
    };
  }

  if (
    hasDebit &&
    [
      "car purchase",
      "vehicle purchase",
      "property purchase",
      "land purchase",
      "equipment purchase",
      "laptop purchase",
      "machinery purchase",
    ].some((keyword) => matchesKeyword(normalized, keyword))
  ) {
    return {
      status: "POTENTIAL_ASSET",
      entryType: "ASSET",
      category: "ASSET_PURCHASE",
      confidence: 0.7,
    };
  }

  // A generic incoming credit is not automatically taxable income. Surface it
  // as a potential-income decision so the user can choose income, internal
  // transfer, or exclusion explicitly.
  if (hasCredit) {
    return {
      status: "POTENTIAL_INCOME",
      entryType: "INCOME",
      category: "POTENTIAL_INCOME",
      confidence: 0.55,
    };
  }

  return descriptionSuggestion;
}

type GeminiClassification = {
  transactionId: string;
  classification:
    | "income"
    | "expense"
    | "asset"
    | "liability"
    | "internal_transfer"
    | "cash_movement"
    | "unknown";
  category?: string;
  confidence?: number;
  reason?: string;
};

function maskSensitiveDescription(description: string) {
  return description.slice(0, 240).replace(/\b\d{8,}\b/g, "[redacted]");
}

function parseGeminiClassifications(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as GeminiClassification[];
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try {
      return JSON.parse(
        cleaned.slice(start, end + 1),
      ) as GeminiClassification[];
    } catch {
      return [];
    }
  }
}

async function classifyAmbiguousTransactionsWithGemini(
  transactions: Array<{
    id: string;
    transactionDate: Date | null;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number | null;
  }>,
) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || transactions.length === 0)
    return new Map<string, GeminiClassification>();

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: modelName,
    });
    const prompt = `You are reviewing ambiguous Pakistani bank transactions for a tax ledger.
Return only a JSON array. Do not invent facts.
For each row choose exactly one classification:
- income: only when the description strongly indicates earned income
- expense: only when the description strongly indicates a personal/business expense
- asset: an identifiable asset purchase
- liability: loan/financing proceeds
- internal_transfer: likely movement between the taxpayer's own accounts
- cash_movement: ATM/cash movement that is not automatically an expense
- unknown: insufficient evidence
Generic credits must not be automatically treated as income unless evidence supports it.
Each item must have this shape:
{"transactionId":"string","classification":"income|expense|asset|liability|internal_transfer|cash_movement|unknown","category":"string","confidence":0.0,"reason":"short explanation"}

Rows:
${JSON.stringify(
  transactions.map((transaction) => ({
    transactionId: transaction.id,
    date: transaction.transactionDate?.toISOString().slice(0, 10) ?? null,
    description: maskSensitiveDescription(transaction.description),
    debit: transaction.debit,
    credit: transaction.credit,
    balance: transaction.balance,
  })),
)}`;

    const result = await model.generateContent([{ text: prompt }]);
    const parsed = parseGeminiClassifications(result.response.text());
    return new Map(
      parsed
        .filter((item) => item && typeof item.transactionId === "string")
        .map((item) => [item.transactionId, item]),
    );
  } catch (error) {
    console.error("Gemini bank classification fallback failed:", error);
    return new Map<string, GeminiClassification>();
  }
}

function applyGeminiClassification(
  suggestion: GeminiClassification | undefined,
) {
  if (!suggestion || suggestion.classification === "unknown") {
    return {
      status: "UNREVIEWED",
      entryType: null,
      category: null,
      confidence: 0,
    };
  }

  const category = suggestion.category?.trim().toUpperCase() || "AI_REVIEW";
  const confidence = Math.max(0, Math.min(1, suggestion.confidence ?? 0.5));

  if (suggestion.classification === "income") {
    return {
      status: "POTENTIAL_INCOME",
      entryType: "INCOME",
      category,
      confidence,
    };
  }
  if (suggestion.classification === "asset") {
    return {
      status: "POTENTIAL_ASSET",
      entryType: "ASSET",
      category,
      confidence,
    };
  }
  if (suggestion.classification === "liability") {
    return {
      status: "POTENTIAL_LIABILITY",
      entryType: "LIABILITY",
      category,
      confidence,
    };
  }
  if (suggestion.classification === "internal_transfer") {
    return {
      status: "POTENTIAL_TRANSFER",
      entryType: null,
      category: "INTERNAL_TRANSFER",
      confidence,
    };
  }
  if (suggestion.classification === "cash_movement") {
    return {
      status: "POTENTIAL_CASH_MOVEMENT",
      entryType: null,
      category: "CASH_MOVEMENT",
      confidence,
    };
  }

  return {
    status: "UNREVIEWED",
    entryType: null,
    category: null,
    confidence: 0,
  };
}

export type ClassificationStatementInput = Readonly<{
  accountLabel: string;
  openingBalance: number;
  closingBalance: number;
  periodStart: string;
  periodEnd: string;
}>;

export async function classifyBankTransactionsAction(
  draftId: string,
  statementInput?: ClassificationStatementInput,
) {
  try {
    const draft = await getOwnedDraft(draftId);
    const statement = await prisma.bankStatement.findFirst({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      select: {
        accountLabel: true,
        currency: true,
        openingBalance: true,
        closingBalance: true,
        periodStart: true,
        periodEnd: true,
      },
    });

    if (!statement) {
      return {
        success: false,
        error: "Save statement balances before classifying transactions",
      };
    }

    const statementValidation = validateTaxYearStatement({
      taxYear: draft.taxYear,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      currency: statement.currency,
    });

    if (!statementValidation.valid) {
      return { success: false, error: statementValidation.error };
    }

    // The server cannot rely only on the button's disabled state: a client
    // may call this action directly or may have stale browser JavaScript.
    // When the current form values are provided, require them to match the
    // persisted statement before classifying.
    if (statementInput) {
      const persistedStart =
        statement.periodStart?.toISOString().slice(0, 10) ?? "";
      const persistedEnd =
        statement.periodEnd?.toISOString().slice(0, 10) ?? "";
      const valuesMatch =
        statement.accountLabel === statementInput.accountLabel.trim() &&
        statement.openingBalance === statementInput.openingBalance &&
        statement.closingBalance === statementInput.closingBalance &&
        persistedStart === statementInput.periodStart &&
        persistedEnd === statementInput.periodEnd;

      if (!valuesMatch) {
        return {
          success: false,
          error: "Save statement balances before classifying transactions",
        };
      }
    }

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      orderBy: { createdAt: "asc" },
    });

    const finalStatuses = new Set([
      "APPROVED",
      "REJECTED",
      "TRANSFER",
      "CASH_MOVEMENT",
    ]);
    const ruleSuggestions = transactions.map((transaction) => ({
      transaction,
      suggestion: finalStatuses.has(transaction.classificationStatus)
        ? {
            status: transaction.classificationStatus,
            entryType: transaction.suggestedEntryType,
            category: transaction.suggestedCategory,
            confidence: 1,
          }
        : classifyTransaction(transaction),
    }));

    const ambiguous = ruleSuggestions
      .filter(
        (item) =>
          item.suggestion.status === "UNREVIEWED" ||
          item.suggestion.status === "POTENTIAL_INCOME",
      )
      .map((item) => item.transaction);
    const aiSuggestions =
      await classifyAmbiguousTransactionsWithGemini(ambiguous);

    const suggestions = ruleSuggestions.map(({ transaction, suggestion }) => {
      const useAiFallback =
        suggestion.status === "UNREVIEWED" ||
        suggestion.status === "POTENTIAL_INCOME";
      const aiResult = useAiFallback
        ? aiSuggestions.get(transaction.id)
        : undefined;
      const aiSuggestion =
        aiResult && aiResult.classification !== "unknown"
          ? applyGeminiClassification(aiResult)
          : suggestion;

      return { id: transaction.id, ...aiSuggestion };
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

    const reviewStatuses = new Set([
      "UNREVIEWED",
      "POTENTIAL_INCOME",
      "POTENTIAL_ASSET",
      "POTENTIAL_LIABILITY",
      "POTENTIAL_TRANSFER",
      "POTENTIAL_CASH_MOVEMENT",
    ]);
    const riskCount = suggestions.filter((suggestion) =>
      reviewStatuses.has(suggestion.status),
    ).length;

    if (riskCount > 0) {
      await createNotification({
        userId: draft.userId,
        type: "RISK_FLAG",
        title: `${riskCount} bank transaction(s) need review`,
        message:
          "Classification found transactions that need an explicit income, asset, liability, transfer or cash decision.",
        link: `/tax/new?draftId=${draft.id}`,
      });
    }

    return { success: true, suggestions };
  } catch (error) {
    console.error("Error classifying bank transactions:", error);
    return { success: false, error: "Failed to classify bank transactions" };
  }
}

export async function autoReviewSafeBankTransactionsAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const safeExpenseCategories = [
      "UTILITIES_OR_RENT",
      "PERSONAL_EXPENSE",
      "TRANSPORT",
      "BANK_CHARGES",
    ];
    const safeTransactions = await prisma.bankTransaction.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        classificationStatus: "SUGGESTED",
        suggestedEntryType: { not: null },
        suggestedCategory: { not: null },
      },
      select: { id: true, suggestedEntryType: true, suggestedCategory: true },
    });

    const autoApproveIds = safeTransactions
      .filter(
        (transaction) =>
          (transaction.suggestedEntryType === "EXPENSE" &&
            safeExpenseCategories.includes(
              transaction.suggestedCategory ?? "",
            )) ||
          (transaction.suggestedEntryType === "INCOME" &&
            transaction.suggestedCategory === "SALARY"),
      )
      .map((transaction) => transaction.id);
    const affectedIds = autoApproveIds;

    await prisma.$transaction(async (tx) => {
      if (affectedIds.length > 0) {
        await tx.ledgerEntry.deleteMany({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
            sourceTransactionId: { in: affectedIds },
          },
        });
      }
      if (autoApproveIds.length > 0) {
        await tx.bankTransaction.updateMany({
          where: { id: { in: autoApproveIds } },
          data: { classificationStatus: "APPROVED" },
        });
      }
    });

    return {
      success: true,
      approvedCount: autoApproveIds.length,
    };
  } catch (error) {
    console.error("Error auto-reviewing safe bank transactions:", error);
    return { success: false, error: "Failed to auto-review safe transactions" };
  }
}

export async function undoBankTransactionClassificationAction(
  draftId: string,
  transactionId: string,
) {
  try {
    const draft = await getOwnedDraft(draftId);
    const transaction = await prisma.bankTransaction.findFirst({
      where: {
        id: transactionId,
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      select: { id: true, suggestedEntryType: true, suggestedCategory: true },
    });
    if (!transaction)
      return { success: false, error: "Bank transaction not found" };

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
          classificationStatus:
            transaction.suggestedEntryType && transaction.suggestedCategory
              ? "SUGGESTED"
              : "UNREVIEWED",
        },
      });
    });
    return { success: true };
  } catch (error) {
    console.error("Error undoing bank classification:", error);
    return { success: false, error: "Failed to undo bank classification" };
  }
}

export async function manuallyClassifyBankTransactionAction(
  draftId: string,
  transactionId: string,
  entryType: "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY" | "EXCLUDE",
  category: string,
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
    if (!transaction)
      return { success: false, error: "Bank transaction not found" };

    if (entryType === "EXCLUDE") {
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
            classificationStatus: "REJECTED",
            suggestedEntryType: null,
            suggestedCategory: category || "EXCLUDED",
          },
        });
      });
      return { success: true };
    }

    const amount =
      entryType === "INCOME" || entryType === "LIABILITY"
        ? transaction.credit
        : transaction.debit;
    if (!amount || amount <= 0) {
      return {
        success: false,
        error: "Choose a transaction type matching the debit/credit amount",
      };
    }
    if (!category.trim())
      return { success: false, error: "Category is required" };

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
          entryType,
          category: category.trim(),
          description: transaction.description,
          amount: Math.abs(amount),
          source: "BANK_CLASSIFIED",
          sourceDocumentId: transaction.sourceDocumentId,
          sourceTransactionId: transaction.id,
        },
      });
      await tx.bankTransaction.update({
        where: { id: transaction.id },
        data: {
          classificationStatus: "APPROVED",
          suggestedEntryType: entryType,
          suggestedCategory: category.trim(),
        },
      });
    });
    return { success: true };
  } catch (error) {
    console.error("Error manually classifying bank transaction:", error);
    return { success: false, error: "Failed to save manual classification" };
  }
}

export async function reviewBankTransactionClassificationAction(
  draftId: string,
  transactionId: string,
  decision: "APPROVE" | "REJECT" | "TRANSFER" | "CASH_MOVEMENT",
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

    if (decision === "CASH_MOVEMENT") {
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
            classificationStatus: "CASH_MOVEMENT",
            suggestedEntryType: null,
            suggestedCategory: "CASH_MOVEMENT",
          },
        });
      });
      return { success: true, decision };
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
      transaction.suggestedEntryType === "INCOME" ||
      transaction.suggestedEntryType === "LIABILITY"
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
