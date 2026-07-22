"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateTaxYearStatement } from "@/lib/tax/tax-year-period";

export type BankStatementInput = {
  accountLabel: string;
  accountNumberMasked?: string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance: number;
  closingBalance: number;
  sourceDocumentId?: string;
};

async function getOwnedDraft(draftId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
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

function parseDate(value?: string) {
  if (!value?.trim()) return null;
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid statement date");
  }
  return date;
}

function validateStatement(
  taxYear: number,
  periodStart: Date | null,
  periodEnd: Date | null,
  currency: string | null | undefined,
) {
  return validateTaxYearStatement({
    taxYear,
    periodStart,
    periodEnd,
    currency,
  });
}

async function consolidateDuplicateBankStatements(draft: {
  id: string;
  userId: string;
}) {
  const statements = await prisma.bankStatement.findMany({
    where: { filingDraftId: draft.id, userId: draft.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      accountLabel: true,
      accountNumberMasked: true,
      currency: true,
      periodStart: true,
      periodEnd: true,
      openingBalance: true,
      closingBalance: true,
      updatedAt: true,
    },
  });

  const keepByAccount = new Map<string, string>();
  const duplicateIds: string[] = [];

  for (const statement of statements) {
    // A replaced statement may have slightly different extracted dates
    // (for example 08/31–09/29 vs 09/01–09/30) while keeping the same
    // account balances. Treat that as the same statement for this filing.
    const key = [
      statement.currency.trim().toUpperCase(),
      statement.openingBalance.toFixed(2),
      statement.closingBalance.toFixed(2),
    ].join("|");

    if (!keepByAccount.has(key)) {
      keepByAccount.set(key, statement.id);
    } else {
      duplicateIds.push(statement.id);
    }
  }

  if (duplicateIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const duplicateId of duplicateIds) {
      const duplicate = statements.find(
        (statement) => statement.id === duplicateId,
      );
      if (!duplicate) continue;

      const key = [
        duplicate.currency.trim().toUpperCase(),
        duplicate.openingBalance.toFixed(2),
        duplicate.closingBalance.toFixed(2),
      ].join("|");
      const keepId = keepByAccount.get(key);
      if (!keepId) continue;

      await tx.bankTransaction.updateMany({
        where: { bankStatementId: duplicateId },
        data: { bankStatementId: keepId },
      });

      await tx.bankStatement.delete({ where: { id: duplicateId } });
    }
  });
}

export async function getBankStatementAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    await consolidateDuplicateBankStatements(draft);
    const statement = await prisma.bankStatement.findFirst({
      where: { filingDraftId: draft.id, userId: draft.userId },
      orderBy: { updatedAt: "desc" },
    });

    if (!statement) {
      return { success: true, statement: null };
    }

    const validation = validateStatement(
      draft.taxYear,
      statement.periodStart,
      statement.periodEnd,
      statement.currency,
    );

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        statement: null,
      };
    }

    return {
      success: true,
      statement: {
        ...statement,
        periodStart: statement.periodStart?.toISOString().slice(0, 10) ?? "",
        periodEnd: statement.periodEnd?.toISOString().slice(0, 10) ?? "",
      },
    };
  } catch (error) {
    console.error("Error fetching bank statement:", error);
    return {
      success: false,
      error: "Failed to fetch bank statement",
      statement: null,
    };
  }
}

export async function saveBankStatementAction(
  draftId: string,
  input: BankStatementInput,
) {
  try {
    const draft = await getOwnedDraft(draftId);
    await consolidateDuplicateBankStatements(draft);

    if (!input.accountLabel.trim()) {
      return { success: false, error: "Account label is required" };
    }

    if (
      !Number.isFinite(input.openingBalance) ||
      !Number.isFinite(input.closingBalance)
    ) {
      return {
        success: false,
        error: "Opening and closing balances must be valid numbers",
      };
    }

    const periodStart = parseDate(input.periodStart);
    const periodEnd = parseDate(input.periodEnd);
    const currency = input.currency?.trim() || "PKR";
    const validation = validateStatement(
      draft.taxYear,
      periodStart,
      periodEnd,
      currency,
    );

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const existing = await prisma.bankStatement.findFirst({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        accountLabel: input.accountLabel.trim(),
      },
      select: { id: true },
    });

    const data = {
      accountLabel: input.accountLabel.trim(),
      accountNumberMasked: input.accountNumberMasked?.trim() || null,
      currency,
      periodStart,
      periodEnd,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
      sourceDocumentId: input.sourceDocumentId || null,
    };

    const statement = existing
      ? await prisma.bankStatement.update({ where: { id: existing.id }, data })
      : await prisma.bankStatement.create({
          data: {
            ...data,
            filingDraftId: draft.id,
            userId: draft.userId,
          },
        });

    await prisma.bankTransaction.updateMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        bankStatementId: null,
      },
      data: { bankStatementId: statement.id },
    });

    return { success: true, statementId: statement.id };
  } catch (error) {
    console.error("Error saving bank statement:", error);
    return { success: false, error: "Failed to save bank statement" };
  }
}
