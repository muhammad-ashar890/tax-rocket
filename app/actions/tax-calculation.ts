"use server";

// File: app/actions/tax-calculation.ts
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateTaxEstimate } from "@/lib/tax/tax-calculation";
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
    },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

export async function calculateTaxAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
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

    // Phase 1 deliberately estimates only a single supported income head.
    // Never calculate a salary-only or bank-profit-only result for a mixed
    // return: doing so would silently omit the other income head.
    const isSalariedRoute =
      incomeSources.length === 1 && incomeSources[0] === "salary";
    const isBankProfitRoute =
      incomeSources.length === 1 && incomeSources[0] === "bank_profit";

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
      totalIncome,
      totalExpenses,
      bankProfitIncome,
      // Use withholding extracted from the filing documents instead of
      // resetting it to zero during every recalculation.
      taxWithheld,
      isSalariedRoute,
      isBankProfitRoute,
    });

    await prisma.filingDraft.update({
      where: { id: draft.id },
      data: {
        taxableIncome: result.taxableIncome,
        taxWithheld: result.taxWithheld,
        taxPayable: result.taxPayable,
        refundDue: result.refundDue,
        taxCalculationStatus: result.status,
      },
    });

    await createNotification({
      userId: draft.userId,
      type: "FILING_STATUS",
      title: `Tax estimate updated — Tax Year ${draft.taxYear}`,
      message:
        result.status === "ESTIMATE"
          ? `Estimated tax payable: PKR ${(result.taxPayable ?? 0).toLocaleString()} · Refund due: PKR ${(result.refundDue ?? 0).toLocaleString()}.`
          : "Tax calculation needs a route-specific rule set before a final estimate is available.",
      link: `/tax/new?draftId=${draft.id}`,
    });

    return { success: true, result };
  } catch (error) {
    console.error("Error calculating tax:", error);
    return { success: false, error: "Failed to calculate tax" };
  }
}
