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

export async function getBankStatementAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
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
