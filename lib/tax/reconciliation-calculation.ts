import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { validateFilingCompleteness } from "@/lib/tax/filing-completeness";

type ReconciliationDatabase = Pick<
  PrismaClient,
  | "filingDraft"
  | "bankAccount"
  | "document"
  | "bankStatement"
  | "bankTransaction"
  | "ledgerEntry"
>;

type ReconciliationCalculationInput = {
  draftId: string;
  userId: string;
};

export type AuthoritativeReconciliationPreview = {
  revision: string;
  accountBalances: Array<{
    bankAccountId: string;
    bankName: string;
    accountLabel: string;
    openingBalance: number;
    closingBalance: number;
  }>;
  openingWealth: number;
  closingWealth: number;
  totalIncome: number;
  totalExpenses: number;
  totalAssets: number;
  totalLiabilities: number;
  otherAdjustments: number;
  gap: number;
};

export type AuthoritativeReconciliationResult =
  | { success: true; preview: AuthoritativeReconciliationPreview }
  | { success: false; blockers: string[] };

function isoDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

/**
 * Calculates Mizan exclusively from persisted, account-complete source rows.
 *
 * Callers may pass a Prisma transaction client so completeness validation,
 * revision checking, calculation, and persistence share one database snapshot.
 * Auto-generated reconciliation entries are excluded because they are derived
 * outputs rather than source wealth movement.
 */
export async function calculateAuthoritativeReconciliation(
  input: ReconciliationCalculationInput,
  database: ReconciliationDatabase = prisma,
): Promise<AuthoritativeReconciliationResult> {
  const completeness = await validateFilingCompleteness(input, database);
  if (!completeness.success) {
    return { success: false, blockers: completeness.blockers };
  }

  const draft = await database.filingDraft.findFirst({
    where: { id: input.draftId, userId: input.userId },
    select: { id: true, userId: true, taxYear: true },
  });
  if (!draft) {
    return { success: false, blockers: ["Filing draft not found"] };
  }

  const [accounts, transactions, ledgerEntries] = await Promise.all([
    database.bankAccount.findMany({
      where: { filingDraftId: draft.id, userId: draft.userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        bankName: true,
        accountLabel: true,
        currency: true,
        statements: {
          where: { filingDraftId: draft.id, userId: draft.userId },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            sourceDocumentId: true,
            openingBalance: true,
            closingBalance: true,
            currency: true,
            periodStart: true,
            periodEnd: true,
          },
        },
      },
    }),
    database.bankTransaction.findMany({
      where: { filingDraftId: draft.id, userId: draft.userId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        bankAccountId: true,
        bankStatementId: true,
        transactionDate: true,
        description: true,
        debit: true,
        credit: true,
        balance: true,
        sourceDocumentId: true,
        classificationStatus: true,
        suggestedEntryType: true,
        suggestedCategory: true,
      },
    }),
    database.ledgerEntry.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        source: { not: "RECONCILIATION_AUTO_ADJUSTMENT" },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        entryDate: true,
        entryType: true,
        category: true,
        description: true,
        amount: true,
        source: true,
        sourceDocumentId: true,
        sourceTransactionId: true,
        bankAccountId: true,
      },
    }),
  ]);

  const accountWithoutExactlyOneStatement = accounts.find(
    (account) => account.statements.length !== 1,
  );
  if (accountWithoutExactlyOneStatement) {
    return {
      success: false,
      blockers: [
        `${accountWithoutExactlyOneStatement.bankName} — ${accountWithoutExactlyOneStatement.accountLabel}: exactly one current statement is required for Mizan`,
      ],
    };
  }

  const accountBalances = accounts.map((account) => {
    const statement = account.statements[0];
    return {
      bankAccountId: account.id,
      bankName: account.bankName,
      accountLabel: account.accountLabel,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
    };
  });

  const openingWealth = accountBalances.reduce(
    (total, account) => total + account.openingBalance,
    0,
  );
  const closingWealth = accountBalances.reduce(
    (total, account) => total + account.closingBalance,
    0,
  );
  const totalIncome = ledgerEntries
    .filter((entry) => entry.entryType === "INCOME")
    .reduce((total, entry) => total + entry.amount, 0);
  const totalExpenses = ledgerEntries
    .filter((entry) => entry.entryType === "EXPENSE")
    .reduce((total, entry) => total + entry.amount, 0);
  const totalAssets = ledgerEntries
    .filter((entry) => entry.entryType === "ASSET")
    .reduce((total, entry) => total + entry.amount, 0);
  const totalLiabilities = ledgerEntries
    .filter((entry) => entry.entryType === "LIABILITY")
    .reduce((total, entry) => total + entry.amount, 0);
  const otherAdjustments = ledgerEntries
    .filter((entry) => entry.entryType === "OTHER")
    .reduce(
      (total, entry) =>
        entry.category === "RECONCILIATION_ADJUSTMENT_INFLOW"
          ? total + entry.amount
          : entry.category === "RECONCILIATION_ADJUSTMENT_OUTFLOW"
            ? total - entry.amount
            : total,
      0,
    );
  const wealthMovement =
    totalIncome +
    totalLiabilities -
    totalExpenses -
    totalAssets +
    otherAdjustments;
  const gap = closingWealth - openingWealth - wealthMovement;

  const revisionPayload = {
    taxYear: draft.taxYear,
    accounts: accounts.map((account) => {
      const statement = account.statements[0];
      return {
        id: account.id,
        bankName: account.bankName,
        accountLabel: account.accountLabel,
        currency: account.currency,
        statement: {
          id: statement.id,
          sourceDocumentId: statement.sourceDocumentId,
          openingBalance: statement.openingBalance,
          closingBalance: statement.closingBalance,
          currency: statement.currency,
          periodStart: isoDate(statement.periodStart),
          periodEnd: isoDate(statement.periodEnd),
        },
      };
    }),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      bankAccountId: transaction.bankAccountId,
      bankStatementId: transaction.bankStatementId,
      transactionDate: isoDate(transaction.transactionDate),
      description: transaction.description,
      debit: transaction.debit,
      credit: transaction.credit,
      balance: transaction.balance,
      sourceDocumentId: transaction.sourceDocumentId,
      classificationStatus: transaction.classificationStatus,
      suggestedEntryType: transaction.suggestedEntryType,
      suggestedCategory: transaction.suggestedCategory,
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: entry.id,
      entryDate: isoDate(entry.entryDate),
      entryType: entry.entryType,
      category: entry.category,
      description: entry.description,
      amount: entry.amount,
      source: entry.source,
      sourceDocumentId: entry.sourceDocumentId,
      sourceTransactionId: entry.sourceTransactionId,
      bankAccountId: entry.bankAccountId,
    })),
  };
  const revision = createHash("sha256")
    .update(JSON.stringify(revisionPayload))
    .digest("hex");

  return {
    success: true,
    preview: {
      revision,
      accountBalances,
      openingWealth,
      closingWealth,
      totalIncome,
      totalExpenses,
      totalAssets,
      totalLiabilities,
      otherAdjustments,
      gap,
    },
  };
}

export type AuthoritativeReconciliationValidation =
  | { success: true; preview: AuthoritativeReconciliationPreview }
  | { success: false; blockers: string[] };

/**
 * Verifies that the persisted reconciliation still represents the current
 * authoritative base calculation. Final tax/approval/packet/FBR actions use
 * this to prevent a stale stored `RESOLVED` flag from bypassing Mizan.
 */
export async function validateAuthoritativeReconciliation(
  input: ReconciliationCalculationInput,
  database: ReconciliationDatabase = prisma,
): Promise<AuthoritativeReconciliationValidation> {
  const calculation = await calculateAuthoritativeReconciliation(
    input,
    database,
  );
  if (!calculation.success) return calculation;

  const [record, autoAdjustments] = await Promise.all([
    database.filingDraft.findFirst({
      where: { id: input.draftId, userId: input.userId },
      select: {
        reconciliationStatus: true,
        reconciliationMethod: true,
        reconciliationGap: true,
        openingWealth: true,
        closingWealth: true,
      },
    }),
    database.ledgerEntry.findMany({
      where: {
        filingDraftId: input.draftId,
        userId: input.userId,
        source: "RECONCILIATION_AUTO_ADJUSTMENT",
      },
      select: { amount: true, category: true },
    }),
  ]);

  if (
    !record ||
    record.reconciliationStatus !== "RESOLVED" ||
    !record.reconciliationMethod
  ) {
    return {
      success: false,
      blockers: ["Resolve wealth reconciliation using the latest Mizan inputs"],
    };
  }

  const preview = calculation.preview;
  const amountsMatch = (
    stored: number | null | undefined,
    current: number,
  ) =>
    stored !== null &&
    stored !== undefined &&
    Math.abs(stored - current) <= 0.01;
  if (
    !amountsMatch(record.openingWealth, preview.openingWealth) ||
    !amountsMatch(record.closingWealth, preview.closingWealth)
  ) {
    return {
      success: false,
      blockers: [
        "Bank balances changed after Mizan was resolved; recalculate reconciliation",
      ],
    };
  }

  const serverGap = Math.abs(preview.gap) <= 0.01 ? 0 : preview.gap;
  if (record.reconciliationMethod === "auto") {
    const expectedAmount = Math.abs(serverGap);
    const expectedCategory =
      serverGap >= 0
        ? "RECONCILIATION_ADJUSTMENT_INFLOW"
        : "RECONCILIATION_ADJUSTMENT_OUTFLOW";
    const adjustmentMatches =
      expectedAmount <= 0.01
        ? autoAdjustments.length === 0
        : autoAdjustments.length === 1 &&
          Math.abs(autoAdjustments[0].amount - expectedAmount) <= 0.01 &&
          autoAdjustments[0].category === expectedCategory;

    if (!amountsMatch(record.reconciliationGap, 0) || !adjustmentMatches) {
      return {
        success: false,
        blockers: [
          "The saved Mizan auto-adjustment is stale; recalculate reconciliation",
        ],
      };
    }
  } else if (record.reconciliationMethod === "manual") {
    if (
      autoAdjustments.length > 0 ||
      !amountsMatch(record.reconciliationGap, serverGap)
    ) {
      return {
        success: false,
        blockers: [
          "The saved manual Mizan result is stale; recalculate reconciliation",
        ],
      };
    }
  } else {
    return {
      success: false,
      blockers: ["Select a valid Mizan reconciliation method"],
    };
  }

  return { success: true, preview };
}
