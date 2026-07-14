"use server";

import { createHash } from "crypto";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function getLatestFilingPacketAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const packet = await prisma.filingPacket.findFirst({
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        packetHash: true,
        status: true,
        taxPayable: true,
        refundDue: true,
        createdAt: true,
      },
    });

    return { success: true, packet };
  } catch (error) {
    console.error("Error fetching filing packet:", error);
    return { success: false, error: "Failed to fetch filing packet" };
  }
}

export async function generateFilingPacketAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const [draftData, documents, ledgerEntries, latestPacket] =
      await Promise.all([
        prisma.filingDraft.findUnique({
          where: { id: draft.id },
          select: {
            taxYear: true,
            status: true,
            filerType: true,
            businessStructure: true,
            incomeSources: true,
            readinessChecks: true,
            openingWealth: true,
            closingWealth: true,
            reconciliationGap: true,
            reconciliationStatus: true,
            reconciliationMethod: true,
            reconciliationNote: true,
            taxPayable: true,
            refundDue: true,
          },
        }),
        prisma.document.findMany({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
          },
          select: {
            documentType: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            extractionStatus: true,
          },
        }),
        prisma.ledgerEntry.findMany({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
          },
          orderBy: { createdAt: "asc" },
          select: {
            entryDate: true,
            entryType: true,
            category: true,
            description: true,
            amount: true,
            source: true,
          },
        }),
        prisma.filingPacket.findFirst({
          where: {
            filingDraftId: draft.id,
            userId: draft.userId,
          },
          orderBy: { version: "desc" },
          select: { version: true },
        }),
      ]);

    if (!draftData) {
      return { success: false, error: "Filing draft not found" };
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      filing: {
        ...draftData,
        incomeSources: JSON.parse(draftData.incomeSources),
        readinessChecks: JSON.parse(draftData.readinessChecks),
      },
      documents,
      ledgerEntries,
    };

    const snapshotJson = JSON.stringify(snapshot);
    const packetHash = createHash("sha256").update(snapshotJson).digest("hex");
    const version = (latestPacket?.version ?? 0) + 1;

    const packet = await prisma.filingPacket.create({
      data: {
        filingDraftId: draft.id,
        userId: draft.userId,
        version,
        packetHash,
        snapshotJson,
        status: "GENERATED",
        taxPayable: draftData.taxPayable ?? 0,
        refundDue: draftData.refundDue ?? 0,
      },
      select: {
        id: true,
        version: true,
        packetHash: true,
        status: true,
        taxPayable: true,
        refundDue: true,
        createdAt: true,
      },
    });

    return { success: true, packet };
  } catch (error) {
    console.error("Error generating filing packet:", error);
    return { success: false, error: "Failed to generate filing packet" };
  }
}
