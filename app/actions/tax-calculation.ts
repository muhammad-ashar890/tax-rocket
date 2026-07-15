"use server";

// File: app/actions/tax-calculation.ts
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateTaxEstimate } from "@/lib/tax/tax-calculation";

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

    const incomeSources = JSON.parse(draft.incomeSources) as string[];
    const isSalariedRoute =
      draft.salaryPercentage === "over_50" ||
      (incomeSources.includes("salary") && incomeSources.length === 1);
    const isBankProfitRoute = incomeSources.includes("bank_profit");

    const result = calculateTaxEstimate({
      taxYear: draft.taxYear,
      totalIncome,
      totalExpenses,
      bankProfitIncome,
      taxWithheld: 0,
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

    return { success: true, result };
  } catch (error) {
    console.error("Error calculating tax:", error);
    return { success: false, error: "Failed to calculate tax" };
  }
}
