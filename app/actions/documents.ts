"use server";

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_FILE_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".csv",
  ".xls",
  ".xlsx",
]);

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName);
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeName.slice(-100) || "document";
}

export type DocumentLibraryItem = {
  id: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: string;
  extractionProvider: string | null;
  extractedAt: string | null;
  createdAt: string;
  taxYear: number | null;
};

export async function getUserDocumentsAction() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
      return { success: false, error: "Unauthorized", documents: [] };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: "User profile not found", documents: [] };
    }

    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        documentType: { not: "PROFILE_AVATAR" },
      },
      orderBy: { createdAt: "desc" },
      include: {
        filingDraft: {
          select: { taxYear: true },
        },
      },
    });

    const result: DocumentLibraryItem[] = documents.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      extractionStatus: document.extractionStatus,
      extractionProvider: document.extractionProvider,
      extractedAt: document.extractedAt ? String(document.extractedAt) : null,
      createdAt: document.createdAt.toISOString(),
      taxYear: document.filingDraft?.taxYear ?? null,
    }));

    return { success: true, documents: result };
  } catch (error) {
    console.error("Error fetching user documents:", error);
    return {
      success: false,
      error: "Failed to fetch documents",
      documents: [],
    };
  }
}

export async function uploadFilingDocumentAction(formData: FormData) {
  let storedPath: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
      return { success: false, error: "Unauthorized" };
    }

    const draftId = String(formData.get("draftId") ?? "");
    const documentType = String(formData.get("documentType") ?? "");
    const file = formData.get("file");

    if (!draftId || !documentType || !(file instanceof File)) {
      return { success: false, error: "Missing document data" };
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "File must be greater than 0 bytes and smaller than 10 MB",
      };
    }

    const extension = path.extname(file.name).toLowerCase();
    const hasSupportedType = ALLOWED_MIME_TYPES.has(file.type);
    const hasSupportedExtension = ALLOWED_FILE_EXTENSIONS.has(extension);

    if (!hasSupportedType && !hasSupportedExtension) {
      return {
        success: false,
        error: "Supported files: PDF, JPG, PNG, CSV, XLS, and XLSX",
      };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: "User profile not found" };
    }

    const draft = await prisma.filingDraft.findFirst({
      where: {
        id: draftId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!draft) {
      return { success: false, error: "Filing draft not found" };
    }

    const sameFileInAnotherSlot = await prisma.document.findFirst({
      where: {
        filingDraftId: draft.id,
        userId: user.id,
        fileName: file.name,
        documentType: { not: documentType },
      },
      select: { documentType: true },
    });

    if (sameFileInAnotherSlot) {
      return {
        success: false,
        error: `This file is already assigned to ${sameFileInAnotherSlot.documentType}. Upload the correct document for this slot.`,
      };
    }

    const uploadDirectory = path.join(process.cwd(), "uploads");
    await mkdir(uploadDirectory, { recursive: true });

    const storedFileName = `${randomUUID()}-${sanitizeFileName(file.name)}`;
    storedPath = path.join(uploadDirectory, storedFileName);
    await writeFile(storedPath, Buffer.from(await file.arrayBuffer()));

    const previousDocument = await prisma.document.findFirst({
      where: {
        filingDraftId: draft.id,
        userId: user.id,
        documentType,
      },
      orderBy: { createdAt: "desc" },
    });

    const document = await prisma.document.create({
      data: {
        filingDraftId: draft.id,
        userId: user.id,
        documentType,
        fileName: file.name,
        fileUrl: storedFileName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        extractionStatus: "PENDING",
      },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        extractionStatus: true,
      },
    });

    if (previousDocument) {
      await prisma.document.delete({ where: { id: previousDocument.id } });
      await unlink(path.join(uploadDirectory, previousDocument.fileUrl)).catch(
        () => undefined,
      );
    }

    return { success: true, document };
  } catch (error) {
    if (storedPath) {
      await unlink(storedPath).catch(() => undefined);
    }

    console.error("Error uploading filing document:", error);
    return { success: false, error: "Failed to upload document" };
  }
}
