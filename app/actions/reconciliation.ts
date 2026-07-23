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

async function calculateBaseGapWithoutAutoAdjustment(draft: {
  id: string;
  userId: string;
}) {
  const [statements, entries] = await Promise.all([
    prisma.bankStatement.findMany({
      where: { filingDraftId: draft.id, userId: draft.userId },
      select: {
        openingBalance: true,
        closingBalance: true,
        currency: true,
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        source: { not: "RECONCILIATION_AUTO_ADJUSTMENT" },
      },
      select: { entryType: true, amount: true },
    }),
  ]);

  const uniqueStatements = Array.from(
    new Map(
      statements.map((statement) => [
        [
          statement.currency.trim().toUpperCase(),
          statement.openingBalance.toFixed(2),
          statement.closingBalance.toFixed(2),
        ].join("|"),
        statement,
      ]),
    ).values(),
  );

  const openingWealth = uniqueStatements.reduce(
    (total, statement) => total + statement.openingBalance,
    0,
  );
  const closingWealth = uniqueStatements.reduce(
    (total, statement) => total + statement.closingBalance,
    0,
  );
  const income = entries
    .filter((entry) => entry.entryType === "INCOME")
    .reduce((total, entry) => total + entry.amount, 0);
  const expenses = entries
    .filter((entry) => entry.entryType === "EXPENSE")
    .reduce((total, entry) => total + entry.amount, 0);
  const assets = entries
    .filter((entry) => entry.entryType === "ASSET")
    .reduce((total, entry) => total + entry.amount, 0);
  const liabilities = entries
    .filter((entry) => entry.entryType === "LIABILITY")
    .reduce((total, entry) => total + entry.amount, 0);

  return (
    closingWealth - openingWealth - (income + liabilities - expenses - assets)
  );
}

export async function getReconciliationAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [record, autoAdjustment] = await Promise.all([
      prisma.filingDraft.findUnique({
        where: { id: draft.id },
        select: {
          reconciliationStatus: true,
          reconciliationMethod: true,
          reconciliationNote: true,
          openingWealth: true,
          closingWealth: true,
          reconciliationGap: true,
        },
      }),
      prisma.ledgerEntry.findFirst({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          source: "RECONCILIATION_AUTO_ADJUSTMENT",
        },
        orderBy: { createdAt: "desc" },
        select: { amount: true },
      }),
    ]);

    const reconciliation =
      record && record.reconciliationMethod === "auto" && autoAdjustment
        ? {
            ...record,
            reconciliationNote: `Other reconciliation adjustment recorded for PKR ${autoAdjustment.amount.toLocaleString()}. This is non-taxable and requires review before filing.`,
          }
        : record;

    return {
      success: true,
      reconciliation,
    };
  } catch (error) {
    console.error("Error fetching reconciliation:", error);
    return { success: false, error: "Failed to fetch reconciliation" };
  }
}

export async function calculateReconciliationPreviewAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [statements, ledgerEntries] = await Promise.all([
      prisma.bankStatement.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
        select: {
          accountLabel: true,
          accountNumberMasked: true,
          openingBalance: true,
          closingBalance: true,
          currency: true,
          periodStart: true,
          periodEnd: true,
        },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
        },
        select: {
          entryType: true,
          category: true,
          amount: true,
        },
      }),
    ]);

    const uniqueStatements = Array.from(
      new Map(
        statements.map((statement) => [
          [
            statement.currency.trim().toUpperCase(),
            statement.openingBalance.toFixed(2),
            statement.closingBalance.toFixed(2),
          ].join("|"),
          statement,
        ]),
      ).values(),
    );

    if (uniqueStatements.length === 0) {
      return {
        success: false,
        error:
          "Save statement opening and closing balances before calculating Mizan",
      };
    }

    const taxYearStart = new Date(Date.UTC(draft.taxYear - 1, 6, 1));
    const taxYearEnd = new Date(Date.UTC(draft.taxYear, 5, 30, 23, 59, 59));
    const invalidStatement = uniqueStatements.find(
      (statement) =>
        statement.currency !== "PKR" ||
        !statement.periodStart ||
        !statement.periodEnd ||
        statement.periodStart < taxYearStart ||
        statement.periodEnd > taxYearEnd,
    );

    if (invalidStatement) {
      return {
        success: false,
        error: `Statement period/currency must match Tax Year ${draft.taxYear} (PKR, July ${draft.taxYear - 1} to June ${draft.taxYear})`,
      };
    }

    const openingWealth = uniqueStatements.reduce(
      (total, statement) => total + statement.openingBalance,
      0,
    );
    const closingWealth = uniqueStatements.reduce(
      (total, statement) => total + statement.closingBalance,
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

    return {
      success: true,
      preview: {
        openingWealth,
        closingWealth,
        totalIncome,
        totalExpenses,
        totalAssets,
        totalLiabilities,
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

    const existingAutoAdjustments = await prisma.ledgerEntry.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        source: "RECONCILIATION_AUTO_ADJUSTMENT",
      },
      select: { id: true, amount: true },
    });

    let adjustmentGap = input.gap;
    let adjustmentAmount = Math.abs(input.gap);

    // Re-confirming an already auto-adjusted filing produces a zero preview
    // gap. Preserve the existing Other entry; if it was lost, reconstruct its
    // amount from the base reconciliation before creating it again.
    if (input.method === "auto" && adjustmentAmount === 0) {
      adjustmentAmount = existingAutoAdjustments.reduce(
        (total, entry) => total + entry.amount,
        0,
      );

      if (adjustmentAmount === 0) {
        adjustmentGap = await calculateBaseGapWithoutAutoAdjustment(draft);
        adjustmentAmount = Math.abs(adjustmentGap);
      }
    }

    const autoAdjustmentNote =
      adjustmentAmount > 0
        ? `Other reconciliation adjustment recorded for PKR ${adjustmentAmount.toLocaleString()}. This is non-taxable and requires review before filing.`
        : "No Other reconciliation adjustment was required.";

    await prisma.$transaction(async (tx) => {
      const shouldReplaceAutoAdjustment =
        input.method === "auto" &&
        (Math.abs(input.gap) > 0 || existingAutoAdjustments.length === 0);

      if (shouldReplaceAutoAdjustment) {
        await tx.ledgerEntry.deleteMany({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
            source: "RECONCILIATION_AUTO_ADJUSTMENT",
          },
        });
      }

      if (
        input.method === "auto" &&
        shouldReplaceAutoAdjustment &&
        adjustmentAmount > 0
      ) {
        await tx.ledgerEntry.create({
          data: {
            filingDraftId: draft.id,
            userId: draft.userId,
            entryType: "OTHER",
            category:
              adjustmentGap >= 0
                ? "RECONCILIATION_ADJUSTMENT_INFLOW"
                : "RECONCILIATION_ADJUSTMENT_OUTFLOW",
            description: "Mizan auto-adjustment — non-taxable Other item",
            amount: adjustmentAmount,
            source: "RECONCILIATION_AUTO_ADJUSTMENT",
          },
        });
      }

      await tx.filingDraft.update({
        where: { id: draft.id },
        data: {
          reconciliationStatus: "RESOLVED",
          reconciliationMethod: input.method,
          reconciliationNote:
            input.method === "auto"
              ? autoAdjustmentNote
              : input.note?.trim() || null,
          openingWealth: input.openingWealth,
          closingWealth: input.closingWealth,
          reconciliationGap: input.method === "auto" ? 0 : input.gap,
        },
      });
    });

    await createNotification({
      userId: draft.userId,
      type: "FILING_STATUS",
      title: `Mizan resolved — Tax Year ${draft.taxYear}`,
      message:
        input.method === "auto"
          ? autoAdjustmentNote
          : Math.abs(input.gap) > 0
            ? `Wealth reconciliation was manually acknowledged with a gap of PKR ${Math.abs(input.gap).toLocaleString()}.`
            : "Wealth reconciliation completed with no gap.",
      link: `/tax/bank-intelligence?draftId=${draft.id}`,
    });

    return { success: true, adjustmentAmount };
  } catch (error) {
    console.error("Error saving reconciliation:", error);
    return { success: false, error: "Failed to save reconciliation" };
  }
}
