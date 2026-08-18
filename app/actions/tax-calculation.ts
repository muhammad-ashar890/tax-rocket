"use server";

// File: app/actions/tax-calculation.ts
import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateTaxEstimate } from "@/lib/tax/tax-calculation";
import {
  TY2026_RULE_SET_VERSION,
  parseManualTaxpayerListStatus,
} from "@/lib/tax/tax-data-model";
import type { TaxpayerListStatus } from "@/lib/tax/tax-data-model";
import { validateAuthoritativeReconciliation } from "@/lib/tax/reconciliation-calculation";
import { createNotification } from "@/app/actions/notifications";

function parseExtractedNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMappedSalaryWithholding(extractedData: string | null) {
  if (!extractedData) return null;
  try {
    const payload = JSON.parse(extractedData) as {
      fields?: Array<{ label?: unknown; value?: unknown }>;
    };
    const field = payload.fields?.find((item) => {
      const label = String(item.label ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      return (
        label.includes("tax_deducted") ||
        label.includes("tax_withheld") ||
        label.includes("income_tax_deducted")
      );
    });
    return parseExtractedNumber(field?.value);
  } catch {
    return null;
  }
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
    select: {
      id: true,
      userId: true,
      taxYear: true,
      filerType: true,
      incomeSources: true,
      salaryPercentage: true,
      taxWithheld: true,
      incomeSelections: {
        where: { status: "SELECTED" },
        select: { source: true, subcategory: true },
      },
    },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

export async function calculateTaxAction(
  draftId: string,
  requestedFilerStatus: TaxpayerListStatus | string,
) {
  try {
    const filerStatus = parseManualTaxpayerListStatus(requestedFilerStatus);
    if (!filerStatus) {
      return {
        success: false,
        error: "Choose ATL or Non-ATL before calculating tax",
      };
    }

    const draft = await getOwnedDraft(draftId);
    const reconciliation = await validateAuthoritativeReconciliation({
      draftId: draft.id,
      userId: draft.userId,
    });
    if ("blockers" in reconciliation) {
      return {
        success: false,
        error: reconciliation.blockers.join(" · "),
      };
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      select: {
        entryType: true,
        category: true,
        amount: true,
      },
    });

    const totalIncome = entries
      .filter((entry) => entry.entryType === "INCOME")
      .reduce((total, entry) => total + entry.amount, 0);
    const totalExpenses = entries
      .filter((entry) => entry.entryType === "EXPENSE")
      .reduce((total, entry) => total + entry.amount, 0);
    const bankProfitIncome = entries
      .filter(
        (entry) =>
          entry.entryType === "INCOME" &&
          entry.category
            ?.toUpperCase()
            .replaceAll(" ", "_")
            .replaceAll("-", "_") === "BANK_PROFIT",
      )
      .reduce((total, entry) => total + entry.amount, 0);

    let incomeSources: string[] = [];
    try {
      const parsedIncomeSources = JSON.parse(draft.incomeSources);
      incomeSources = Array.isArray(parsedIncomeSources)
        ? parsedIncomeSources.map(String)
        : [];
    } catch {
      return {
        success: false,
        error: "Filing income sources are invalid; please review setup",
      };
    }

    // Phase 2 persists the exact PDF subcategory. Keep the pilot calculator
    // limited to the specific routes it actually implements; selecting a
    // different or additional subcategory must return NEEDS_RULES rather than
    // silently applying a bank-deposit/rental/salary formula to the wrong row.
    const selectedSubcategories = new Map<string, Set<string>>();
    for (const selection of draft.incomeSelections) {
      const sourceSelections =
        selectedSubcategories.get(selection.source) ?? new Set<string>();
      sourceSelections.add(selection.subcategory);
      selectedSubcategories.set(selection.source, sourceSelections);
    }
    const hasOnlySubcategories = (
      source: string,
      allowed: readonly string[],
    ) => {
      const selected = selectedSubcategories.get(source) ?? new Set<string>();
      return (
        selected.size > 0 &&
        Array.from(selected).every((subcategory) =>
          allowed.includes(subcategory),
        )
      );
    };

    const isSalariedRoute =
      incomeSources.length === 1 &&
      incomeSources[0] === "salary" &&
      hasOnlySubcategories("salary", ["salary", "salary-surcharge"]);
    const isBankProfitRoute =
      incomeSources.length === 1 &&
      incomeSources[0] === "bank_profit" &&
      hasOnlySubcategories("bank_profit", [
        "bank-or-financial-institution-deposit",
      ]);
    const isPensionRoute =
      incomeSources.length === 1 &&
      incomeSources[0] === "pension" &&
      hasOnlySubcategories("pension", ["pension-up-to-10m"]);
    const isRentalRoute =
      incomeSources.length === 1 &&
      incomeSources[0] === "property_rent" &&
      hasOnlySubcategories("property_rent", ["individual-aop"]);

    let taxWithheld = draft.taxWithheld ?? 0;
    if (taxWithheld === 0 && isSalariedRoute) {
      const salaryCertificate = await prisma.document.findFirst({
        where: {
          filingDraftId: draft.id,
          userId: draft.userId,
          documentType: "salary_certificate",
          extractionStatus: "MAPPED",
        },
        select: { extractedData: true },
      });
      taxWithheld =
        extractMappedSalaryWithholding(
          salaryCertificate?.extractedData ?? null,
        ) ?? 0;
    }

    const result = calculateTaxEstimate({
      taxYear: draft.taxYear,
      filerStatus,
      totalIncome,
      totalExpenses,
      bankProfitIncome,
      // Use withholding extracted from the filing documents instead of
      // resetting it to zero during every recalculation.
      taxWithheld,
      isSalariedRoute,
      isPensionRoute,
      isRentalRoute,
      isBankProfitRoute,
    });

    const calculatedAt = new Date();
    const calculationRevision = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.filingDraft.update({
        where: { id: draft.id },
        data: {
          status: "IN_PROGRESS",
          taxableIncome: result.taxableIncome,
          taxWithheld: result.taxWithheld,
          taxPayable: result.taxPayable,
          refundDue: result.refundDue,
          taxCalculationStatus: result.status,
          taxpayerListStatus: filerStatus,
          taxpayerListStatusSource: "MANUAL",
          taxpayerListStatusCheckedAt: calculatedAt,
          taxRuleSetVersion: TY2026_RULE_SET_VERSION,
          taxCalculationRevision: calculationRevision,
          packetApprovalConfirmed: false,
          packetApprovalAt: null,
          packetApprovalByUserId: null,
        },
      });

      // A calculation under a selected filer status is a new authoritative
      // result. Any packet/PDF/approval generated for an older result must not
      // survive an ATL/Non-ATL switch or recalculation.
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

    await createNotification({
      userId: draft.userId,
      type: "FILING_STATUS",
      title: `${filerStatus} tax estimate updated — Tax Year ${draft.taxYear}`,
      message:
        result.status === "ESTIMATE"
          ? `${filerStatus} estimate · Tax payable: PKR ${(result.taxPayable ?? 0).toLocaleString()} · Refund due: PKR ${(result.refundDue ?? 0).toLocaleString()}.`
          : "Tax calculation needs a route-specific rule set before a final estimate is available.",
      link: `/tax/new?draftId=${draft.id}`,
    });

    return {
      success: true,
      result,
      filerStatus,
      calculationRevision,
    };
  } catch (error) {
    console.error("Error calculating tax:", error);
    return { success: false, error: "Failed to calculate tax" };
  }
}
