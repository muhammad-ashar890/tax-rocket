"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateDateWithinTaxYear } from "@/lib/tax/tax-year-period";

const MAX_LEDGER_ENTRIES = 5000;

const LEDGER_ENTRY_TYPES = new Set([
  "INCOME",
  "EXPENSE",
  "ASSET",
  "LIABILITY",
  "OTHER",
]);

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

function parseEntryDate(value: string | undefined, taxYear: number) {
  if (!value?.trim()) return null;

  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid ledger entry date");
  }

  const validation = validateDateWithinTaxYear(taxYear, date);
  if (!validation.valid) throw new TypeError(validation.error);

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
    select: { id: true, userId: true, taxYear: true },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

async function ensureAutoReconciliationEntry(draft: {
  id: string;
  userId: string;
}) {
  const reconciliation = await prisma.filingDraft.findUnique({
    where: { id: draft.id },
    select: {
      reconciliationStatus: true,
      reconciliationMethod: true,
      reconciliationGap: true,
    },
  });

  if (
    reconciliation?.reconciliationStatus !== "RESOLVED" ||
    reconciliation.reconciliationMethod !== "auto" ||
    reconciliation.reconciliationGap !== 0
  ) {
    // Clean up stale auto-adjustments left by an earlier reconciliation after
    // an upstream document/bank/ledger change. They must not contaminate the
    // fresh Mizan preview.
    await prisma.ledgerEntry.deleteMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        source: "RECONCILIATION_AUTO_ADJUSTMENT",
      },
    });
    return;
  }

  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      filingDraftId: draft.id,
      userId: draft.userId,
      source: "RECONCILIATION_AUTO_ADJUSTMENT",
    },
    select: { id: true, amount: true },
  });

  // A previous buggy auto-confirm could leave a zero-value adjustment.
  // Remove it so the real base gap can be reconstructed below.
  if (existing?.amount && existing.amount > 0) return;
  if (existing) {
    await prisma.ledgerEntry.delete({ where: { id: existing.id } });
  }

  const [statements, entries] = await Promise.all([
    prisma.bankStatement.findMany({
      where: { filingDraftId: draft.id, userId: draft.userId },
      select: {
        accountLabel: true,
        accountNumberMasked: true,
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
    new Map<string, (typeof statements)[number]>(
      statements.map((statement) => [
        [
          statement.accountLabel.trim().toUpperCase(),
          statement.accountNumberMasked?.trim() ?? "",
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
  // Include manual OTHER adjustments (excluding auto) for correct gap reconstruction
  const otherAdjustments = entries
    .filter((entry) => entry.entryType === "OTHER")
    .reduce(
      (total, entry) =>
        (entry as any).category === "RECONCILIATION_ADJUSTMENT_INFLOW"
          ? total + entry.amount
          : (entry as any).category === "RECONCILIATION_ADJUSTMENT_OUTFLOW"
            ? total - entry.amount
            : total,
      0,
    );
  const baseGap =
    closingWealth -
    openingWealth -
    (income + liabilities - expenses - assets + otherAdjustments);
  const amount = Math.abs(baseGap);

  if (amount <= 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        filingDraftId: draft.id,
        userId: draft.userId,
        entryType: "OTHER",
        category:
          baseGap >= 0
            ? "RECONCILIATION_ADJUSTMENT_INFLOW"
            : "RECONCILIATION_ADJUSTMENT_OUTFLOW",
        description: "Mizan auto-adjustment — non-taxable Other item",
        amount,
        source: "RECONCILIATION_AUTO_ADJUSTMENT",
      },
    });

    await tx.filingDraft.update({
      where: { id: draft.id },
      data: {
        reconciliationNote: `Other reconciliation adjustment recorded for PKR ${amount.toLocaleString()}. This is non-taxable and requires review before filing.`,
      },
    });
  });
}

async function syncApprovedBankTransactionsToLedgers(draft: {
  id: string;
  userId: string;
}) {
  const [approvedTransactions, salaryCertificates] = await Promise.all([
    prisma.bankTransaction.findMany({
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
    }),
    prisma.document.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        documentType: "salary_certificate",
      },
      select: { id: true },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    // Remove legacy salary entries created from certificate extraction.
    // Salary income is now sourced only from approved bank payroll credits.
    const certificateIds = salaryCertificates.map((document) => document.id);
    if (certificateIds.length > 0) {
      await tx.ledgerEntry.deleteMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          sourceDocumentId: { in: certificateIds },
          category: "SALARY",
        },
      });
    }

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

      const existingLedgerEntries = await tx.ledgerEntry.findMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          OR: [
            { sourceTransactionId: transaction.id },
            {
              sourceTransactionId: null,
              entryType: transaction.suggestedEntryType,
              category: transaction.suggestedCategory,
              description: transaction.description,
              amount: Math.abs(amount),
            },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, sourceTransactionId: true },
      });

      if (existingLedgerEntries.length > 0) {
        const keep = existingLedgerEntries[0];
        await tx.ledgerEntry.update({
          where: { id: keep.id },
          data: {
            source: "BANK_CLASSIFIED",
            sourceDocumentId: transaction.sourceDocumentId,
            sourceTransactionId: transaction.id,
          },
        });

        const duplicateIds = existingLedgerEntries
          .slice(1)
          .map((entry) => entry.id);
        if (duplicateIds.length > 0) {
          await tx.ledgerEntry.deleteMany({
            where: { id: { in: duplicateIds } },
          });
        }
        continue;
      }

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
    // Sync source bank decisions before recreating any derived Mizan row.
    // Otherwise an old auto-adjustment could be calculated before the newly
    // approved bank transaction reaches the ledger.
    await syncApprovedBankTransactionsToLedgers(draft);
    await ensureAutoReconciliationEntry(draft);

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
        sourceDocumentId: entry.sourceDocumentId ?? undefined,
        sourceTransactionId: entry.sourceTransactionId ?? undefined,
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

export async function deleteLedgerEntryAction(
  draftId: string,
  entryId: string,
) {
  try {
    const draft = await getOwnedDraft(draftId);
    const entry = await prisma.ledgerEntry.findFirst({
      where: {
        id: entryId,
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      select: { id: true, source: true, sourceTransactionId: true },
    });

    if (!entry) {
      return { success: false, error: "Ledger entry not found" };
    }

    if (entry.source === "RECONCILIATION_AUTO_ADJUSTMENT") {
      return {
        success: false,
        error: "Mizan auto-adjustment is protected in this workflow",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.delete({ where: { id: entry.id } });

      // If this ledger row came from a bank transaction, mark that source
      // transaction excluded so ledger hydration cannot recreate the row.
      if (entry.sourceTransactionId) {
        await tx.bankTransaction.update({
          where: { id: entry.sourceTransactionId },
          data: {
            classificationStatus: "REJECTED",
            suggestedEntryType: null,
            suggestedCategory: "EXCLUDED",
          },
        });
      }

      // Any ledger change invalidates the previous Mizan adjustment. It will
      // be regenerated as an OTHER entry after reconciliation is recalculated.
      await tx.ledgerEntry.deleteMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          source: "RECONCILIATION_AUTO_ADJUSTMENT",
        },
      });
      await tx.filingDraft.update({
        where: { id: draft.id },
        data: {
          reconciliationStatus: "UNRESOLVED",
          reconciliationMethod: null,
          reconciliationNote: null,
          reconciliationGap: null,
          openingWealth: null,
          closingWealth: null,
        },
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting ledger entry:", error);
    return { success: false, error: "Failed to delete ledger entry" };
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

    const entriesToPersist = entries.filter(
      (entry) => entry.source !== "RECONCILIATION_AUTO_ADJUSTMENT",
    );

    const sourceTransactionIds = entriesToPersist
      .map((entry) => entry.sourceTransactionId)
      .filter((id): id is string => Boolean(id));
    if (new Set(sourceTransactionIds).size !== sourceTransactionIds.length) {
      return {
        success: false,
        error: "A bank transaction cannot appear in more than one ledger row",
      };
    }

    if (sourceTransactionIds.length > 0) {
      const ownedSourceTransactions = await prisma.bankTransaction.count({
        where: {
          id: { in: sourceTransactionIds },
          filingDraftId: draft.id,
          userId: draft.userId,
        },
      });
      if (ownedSourceTransactions !== sourceTransactionIds.length) {
        return {
          success: false,
          error: "One or more linked bank transactions are invalid",
        };
      }
    }

    const entryData = entriesToPersist.map((entry) => {
      const entryType = entry.entryType.toUpperCase();
      if (!LEDGER_ENTRY_TYPES.has(entryType)) {
        throw new TypeError("Invalid ledger entry type");
      }

      return {
        filingDraftId: draft.id,
        userId: draft.userId,
        entryDate: parseEntryDate(entry.date, draft.taxYear),
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

      // Any manual ledger replacement changes the reconciliation inputs.
      // Always invalidate the derived Mizan adjustment, tax result, packet,
      // and FBR handoff, even when the old ledger did not contain an auto row.
      await tx.filingDraft.update({
        where: { id: draft.id },
        data: {
          reconciliationStatus: "UNRESOLVED",
          reconciliationMethod: null,
          reconciliationNote: null,
          openingWealth: null,
          closingWealth: null,
          reconciliationGap: null,
          taxableIncome: null,
          taxWithheld: null,
          taxPayable: null,
          refundDue: null,
          taxCalculationStatus: "NOT_CALCULATED",
          status: "IN_PROGRESS",
        },
      });

      await tx.filingPacket.updateMany({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          status: { not: "SUPERSEDED" },
        },
        data: {
          status: "SUPERSEDED",
          approvalStatus: "SUPERSEDED",
        },
      });

      await tx.fbrConnection.updateMany({
        where: { filingDraftId: draft.id, userId: draft.userId },
        data: {
          status: "NOT_STARTED",
          agentId: null,
          message: null,
          errorMessage: null,
          lastHeartbeat: null,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    return { success: true, count: entryData.length };
  } catch (error) {
    console.error("Error saving ledger entries:", error);
    if (error instanceof TypeError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to save ledger entries" };
  }
}
