"use server";

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

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

async function hasValidFileSignature(file: File, extension: string) {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const startsWith = (...bytes: number[]) =>
    bytes.every((byte, index) => header[index] === byte);

  if (extension === ".pdf") {
    return new TextDecoder().decode(header.slice(0, 5)) === "%PDF-";
  }
  if (extension === ".png") {
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return startsWith(0xff, 0xd8, 0xff);
  }
  if (extension === ".xlsx") {
    return startsWith(0x50, 0x4b, 0x03, 0x04);
  }
  if (extension === ".xls") {
    return startsWith(0xd0, 0xcf, 0x11, 0xe0);
  }
  if (extension === ".csv") {
    return !header.includes(0);
  }
  return false;
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
    const requestedDocumentType = String(formData.get("documentType") ?? "");
    const bankAccountId = requestedDocumentType.startsWith("bank_statement:")
      ? requestedDocumentType.slice("bank_statement:".length)
      : String(formData.get("bankAccountId") ?? "") || null;
    const documentType = requestedDocumentType.startsWith("bank_statement:")
      ? "bank_statement"
      : requestedDocumentType;
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

    // Do not trust only a user-controlled filename or MIME type. Validate the
    // file signature before writing sensitive tax documents to disk.
    if (!(await hasValidFileSignature(file, extension))) {
      return {
        success: false,
        error: "The file content does not match its file type",
      };
    }

    // Per-slot file type validation — CNIC/Salary etc should not be CSV, Bank Statement can be CSV
    const isCsvLike = [".csv", ".xls", ".xlsx"].includes(extension);
    const isBankSlot = documentType === "bank_statement";
    const isCnicOrSalarySlot = [
      "cnic",
      "salary_certificate",
      "bank_certificate",
      "pension_statement",
      "rent_agreement",
      "dividend_certificate",
    ].includes(documentType);

    if (isCsvLike && !isBankSlot) {
      return {
        success: false,
        error: `CSV/XLS/XLSX files are only allowed for Bank Statement. For ${documentType}, please upload PDF, JPG, or PNG. You uploaded a ${extension.toUpperCase()} file in a ${documentType} slot.`,
      };
    }

    // Optional: warn if file name suggests wrong type (e.g., uploading bank statement file in CNIC slot)
    const lowerName = file.name.toLowerCase();
    if (
      documentType === "cnic" &&
      (lowerName.includes("bank") ||
        lowerName.includes("statement") ||
        lowerName.includes("salary"))
    ) {
      return {
        success: false,
        error: `This file name suggests it is a ${lowerName.includes("bank") ? "bank statement" : "salary certificate"}, not a CNIC. Please upload the correct CNIC file for CNIC slot.`,
      };
    }
    if (
      documentType === "bank_statement" &&
      lowerName.includes("cnic") &&
      !lowerName.includes("bank")
    ) {
      return {
        success: false,
        error: `This file name suggests it is a CNIC, not a Bank Statement. Please upload the correct Bank Statement file.`,
      };
    }
    if (
      documentType === "salary_certificate" &&
      lowerName.includes("cnic") &&
      !lowerName.includes("salary")
    ) {
      return {
        success: false,
        error: `This file name suggests it is a CNIC, not a Salary Certificate. Please upload the correct Salary Certificate.`,
      };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: "User profile not found" };
    }

    const uploadLimit = consumeRateLimit(
      `upload:${user.id}`,
      30,
      10 * 60 * 1000,
    );
    if (!uploadLimit.allowed) {
      return {
        success: false,
        error: `Too many uploads. Try again in ${uploadLimit.retryAfterSeconds} seconds.`,
      };
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

    if (bankAccountId) {
      const bankAccount = await prisma.bankAccount.findFirst({
        where: { id: bankAccountId, filingDraftId: draft.id, userId: user.id },
        select: { id: true },
      });
      if (!bankAccount) {
        return {
          success: false,
          error: "Bank account not found for this filing",
        };
      }
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
        ...(bankAccountId ? { bankAccountId } : {}),
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
        bankAccountId,
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

    // Critical fix: when re-uploading a document, clean up old linked data
    // Otherwise ledger keeps old entries and new doc never appears
    if (previousDocument) {
      // Always delete ledger entries directly linked to previous doc (e.g., salary from salary cert)
      await prisma.ledgerEntry.deleteMany({
        where: {
          filingDraftId: draft.id,
          userId: user.id,
          sourceDocumentId: previousDocument.id,
        },
      });

      // If re-uploading bank_statement (or previous was bank_statement), also clean bank statements & transactions
      if (
        previousDocument.documentType === "bank_statement" ||
        documentType === "bank_statement"
      ) {
        const oldStatements = await prisma.bankStatement.findMany({
          where: {
            filingDraftId: draft.id,
            userId: user.id,
            OR: [
              { sourceDocumentId: previousDocument.id },
              { filingDraftId: draft.id }, // fallback: clean all statements for this draft to avoid stale data
            ],
          },
          select: { id: true },
        });

        const oldStatementIds = oldStatements.map((s) => s.id);

        const oldTransactions = await prisma.bankTransaction.findMany({
          where: {
            filingDraftId: draft.id,
            userId: user.id,
            OR: [
              { sourceDocumentId: previousDocument.id },
              ...(oldStatementIds.length > 0
                ? [{ bankStatementId: { in: oldStatementIds } }]
                : []),
            ],
          },
          select: { id: true },
        });

        const oldTransactionIds = oldTransactions.map((t) => t.id);

        if (oldTransactionIds.length > 0) {
          await prisma.ledgerEntry.deleteMany({
            where: {
              filingDraftId: draft.id,
              userId: user.id,
              sourceTransactionId: { in: oldTransactionIds },
            },
          });
        }

        // Delete bank transactions from document extraction (keep MANUAL ones unless they belong to old statements)
        await prisma.bankTransaction.deleteMany({
          where: {
            filingDraftId: draft.id,
            userId: user.id,
            OR: [
              { sourceDocumentId: previousDocument.id },
              ...(oldStatementIds.length > 0
                ? [{ bankStatementId: { in: oldStatementIds } }]
                : []),
              { source: "DOCUMENT_EXTRACTION" },
            ],
          },
        });

        if (oldStatementIds.length > 0) {
          await prisma.bankStatement.deleteMany({
            where: { id: { in: oldStatementIds } },
          });
        }

        // Reset reconciliation since bank data changed
        await prisma.ledgerEntry.deleteMany({
          where: {
            filingDraftId: draft.id,
            userId: user.id,
            source: "RECONCILIATION_AUTO_ADJUSTMENT",
          },
        });
        await prisma.filingDraft.update({
          where: { id: draft.id },
          data: {
            reconciliationStatus: "UNRESOLVED",
            reconciliationMethod: null,
            reconciliationNote: null,
            openingWealth: null,
            closingWealth: null,
            reconciliationGap: null,
          },
        });
      }

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
