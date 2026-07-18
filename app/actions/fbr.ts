"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/app/actions/notifications";

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
    select: { id: true, userId: true },
  });

  if (!draft) throw new Error("Filing draft not found");

  return draft;
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
    const latestPacket = await prisma.filingPacket.findFirst({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
        approvalStatus: "APPROVED",
      },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });

    if (!latestPacket) {
      return {
        success: false,
        error: "Approve the latest filing packet before connecting to FBR",
      };
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
