"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type BankAccountInput = {
  bankName: string;
  accountLabel: string;
  accountNumberMasked?: string;
  currency?: string;
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
    select: { id: true, userId: true },
  });
  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

export async function saveBankAccountsAction(
  draftId: string,
  accounts: BankAccountInput[],
) {
  try {
    const draft = await getOwnedDraft(draftId);
    if (accounts.length === 0) {
      return { success: false, error: "Add at least one bank account" };
    }

    const normalized = accounts.map((account) => ({
      bankName: account.bankName.trim(),
      accountLabel: account.accountLabel.trim(),
      accountNumberMasked: account.accountNumberMasked?.trim() || null,
      currency: account.currency?.trim().toUpperCase() || "PKR",
    }));

    if (
      normalized.some((account) => !account.bankName || !account.accountLabel)
    ) {
      return {
        success: false,
        error: "Bank name and account label are required",
      };
    }

    const labels = normalized.map((account) =>
      account.accountLabel.toLowerCase(),
    );
    if (new Set(labels).size !== labels.length) {
      return {
        success: false,
        error: "Each bank account needs a unique label",
      };
    }

    const saved = await prisma.$transaction(async (tx) =>
      Promise.all(
        normalized.map((account) =>
          tx.bankAccount.upsert({
            where: {
              filingDraftId_accountLabel: {
                filingDraftId: draft.id,
                accountLabel: account.accountLabel,
              },
            },
            update: account,
            create: {
              ...account,
              filingDraftId: draft.id,
              userId: draft.userId,
            },
            select: {
              id: true,
              bankName: true,
              accountLabel: true,
              accountNumberMasked: true,
              currency: true,
            },
          }),
        ),
      ),
    );

    return { success: true, accounts: saved };
  } catch (error) {
    console.error("Error saving bank accounts:", error);
    return { success: false, error: "Failed to save bank accounts" };
  }
}

export async function getBankAccountsAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const accounts = await prisma.bankAccount.findMany({
      where: { filingDraftId: draft.id, userId: draft.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        bankName: true,
        accountLabel: true,
        accountNumberMasked: true,
        currency: true,
      },
    });
    return { success: true, accounts };
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return {
      success: false,
      error: "Failed to fetch bank accounts",
      accounts: [],
    };
  }
}
