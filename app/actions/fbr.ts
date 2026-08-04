"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequiredTaxDocumentTypesForCurrentFlow } from "@/lib/tax/document-requirements";
import { createNotification } from "@/app/actions/notifications";
import {
  getFbrConnectionBlockers,
  getCurrentApprovalState,
} from "@/lib/tax/filing-status";

export type FbrConnectionView = {
  id: string;
  status: string;
  agentId: string | null;
  message: string | null;
  errorMessage: string | null;
  lastHeartbeat: string | null;
  startedAt: string | null;
  completedAt: string | null;
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
    select: { id: true, userId: true, incomeSources: true },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
}

async function getLatestRequiredDocumentStatuses(draft: {
  id: string;
  userId: string;
  incomeSources: string;
}) {
  let incomeSources: string[] = [];
  try {
    const parsed = JSON.parse(draft.incomeSources);
    incomeSources = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    incomeSources = [];
  }

  const requiredTypes = new Set(
    getRequiredTaxDocumentTypesForCurrentFlow({
      incomeSources: incomeSources as any,
    }),
  );
  const documents = await prisma.document.findMany({
    where: {
      filingDraftId: draft.id,
      userId: draft.userId,
      documentType: { in: Array.from(requiredTypes) },
    },
    orderBy: { createdAt: "desc" },
    select: { documentType: true, extractionStatus: true },
  });

  return Array.from(
    new Map(
      documents.map((document) => [document.documentType, document]),
    ).values(),
  ).map(({ extractionStatus }) => ({ extractionStatus }));
}

function serializeConnection(connection: {
  id: string;
  status: string;
  agentId: string | null;
  message: string | null;
  errorMessage: string | null;
  lastHeartbeat: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}): FbrConnectionView {
  return {
    id: connection.id,
    status: connection.status,
    agentId: connection.agentId,
    message: connection.message,
    errorMessage: connection.errorMessage,
    lastHeartbeat: connection.lastHeartbeat?.toISOString() ?? null,
    startedAt: connection.startedAt?.toISOString() ?? null,
    completedAt: connection.completedAt?.toISOString() ?? null,
  };
}

export async function getFbrConnectionAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const connection = await prisma.fbrConnection.findUnique({
      where: { filingDraftId: draft.id },
    });

    return {
      success: true,
      connection: connection ? serializeConnection(connection) : null,
    };
  } catch (error) {
    console.error("Error fetching FBR connection:", error);
    return { success: false, error: "Failed to fetch FBR connection" };
  }
}

export async function startFbrConnectionAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [draftState, documents, transactions, latestPacket] =
      await Promise.all([
        prisma.filingDraft.findUnique({
          where: { id: draft.id },
          select: {
            status: true,
            packetApprovalConfirmed: true,
            taxCalculationStatus: true,
            reconciliationStatus: true,
            reconciliationGap: true,
          },
        }),
        getLatestRequiredDocumentStatuses(draft),
        prisma.bankTransaction.findMany({
          where: { filingDraftId: draft.id, userId: draft.userId },
          select: { classificationStatus: true },
        }),
        prisma.filingPacket.findFirst({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
            status: { not: "SUPERSEDED" },
            approvalStatus: "APPROVED",
          },
          orderBy: { version: "desc" },
          select: { id: true, version: true },
        }),
      ]);

    // Centralized gate — single source of truth
    const blockers = draftState
      ? getFbrConnectionBlockers({
          draft: {
            status: draftState.status,
            packetApprovalConfirmed: draftState.packetApprovalConfirmed,
            taxCalculationStatus: draftState.taxCalculationStatus,
            reconciliationStatus: draftState.reconciliationStatus,
            reconciliationGap: draftState.reconciliationGap,
          },
          documents: documents as any,
          transactions: transactions as any,
          latestPacket: latestPacket
            ? { approvalStatus: "APPROVED", version: latestPacket.version }
            : null,
        })
      : ["Filing draft not found"];

    // Extra guard: if packet itself missing (not just not approved) show same message as before
    if (!latestPacket && draftState) {
      const missingPacketMsg = "Generate and approve the latest filing packet";
      if (!blockers.includes(missingPacketMsg)) {
        blockers.push(missingPacketMsg);
      }
    }

    if (blockers.length > 0) {
      return { success: false, error: blockers.join(" · ") };
    }

    const now = new Date();
    const connection = await prisma.fbrConnection.upsert({
      where: { filingDraftId: draft.id },
      update: {
        status: "WAITING_FOR_AGENT",
        agentId: null,
        message: `Waiting for the local Trusted Desktop Agent for packet v${latestPacket.version}.`,
        errorMessage: null,
        startedAt: now,
        completedAt: null,
      },
      create: {
        filingDraftId: draft.id,
        userId: draft.userId,
        status: "WAITING_FOR_AGENT",
        message: `Waiting for the local Trusted Desktop Agent for packet v${latestPacket.version}.`,
        startedAt: now,
      },
    });

    await createNotification({
      userId: draft.userId,
      type: "FBR_STATUS",
      title: "FBR connection started",
      message: `Waiting for the local Trusted Desktop Agent for packet v${latestPacket.version}.`,
      link: `/tax/fbr-connect?draftId=${draft.id}`,
    });

    return { success: true, connection: serializeConnection(connection) };
  } catch (error) {
    console.error("Error starting FBR connection:", error);
    return { success: false, error: "Failed to start FBR connection" };
  }
}
