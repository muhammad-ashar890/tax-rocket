"use server";

import { readFile } from "fs/promises";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateTaxYearStatement } from "@/lib/tax/tax-year-period";

const GEMINI_SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const EXTRACTION_PROMPT = `You are extracting structured data from a Pakistani tax document.
Return only valid JSON. Do not include markdown fences or commentary.
Use this exact shape:
{
  "documentType": "string",
  "fields": [
    {
      "label": "string",
      "value": "string or number or null",
      "confidence": "number between 0 and 1"
    }
  ],
  "notes": ["string"]
}
Do not invent values. Use null when a field is not visible. Keep dates and currency amounts exactly as shown in the document.`;

type DocumentSlotRule = {
  label: string;
  aliases: string[];
  fieldSignals: string[];
  minimumSignals: number;
};

const DOCUMENT_SLOT_RULES: Record<string, DocumentSlotRule> = {
  cnic: {
    label: "CNIC copy",
    aliases: ["cnic", "identity card", "national identity card"],
    fieldSignals: ["cnic", "identity number", "father name", "date of birth"],
    minimumSignals: 2,
  },
  bank_statement: {
    label: "bank statement",
    aliases: ["bank statement", "account statement"],
    fieldSignals: [
      "bank name",
      "account title",
      "account number",
      "iban",
      "opening balance",
      "closing balance",
      "transaction",
    ],
    minimumSignals: 2,
  },
  salary_certificate: {
    label: "salary certificate",
    aliases: ["salary certificate", "salary slip", "pay slip", "payslip"],
    fieldSignals: ["salary", "gross salary", "tax deducted", "employer"],
    minimumSignals: 2,
  },
  bank_certificate: {
    label: "bank profit certificate",
    aliases: ["bank profit certificate", "profit certificate", "profit statement"],
    fieldSignals: ["bank profit", "profit", "profit rate", "tax deducted"],
    minimumSignals: 2,
  },
  pension_statement: {
    label: "pension statement",
    aliases: ["pension statement", "pension certificate"],
    fieldSignals: ["pension", "pensioner", "monthly pension"],
    minimumSignals: 1,
  },
  rent_agreement: {
    label: "rent agreement or receipts",
    aliases: ["rent agreement", "rental receipt", "lease agreement"],
    fieldSignals: ["rent", "landlord", "tenant", "property"],
    minimumSignals: 2,
  },
  invoice_summary: {
    label: "invoices or service income summary",
    aliases: ["invoice", "service income summary", "freelance invoice"],
    fieldSignals: ["invoice", "client", "service", "quantity"],
    minimumSignals: 2,
  },
  dividend_certificate: {
    label: "dividend certificate",
    aliases: ["dividend certificate", "dividend statement"],
    fieldSignals: ["dividend", "shares", "withholding"],
    minimumSignals: 2,
  },
  cgt_statement: {
    label: "capital gains statement",
    aliases: ["capital gains statement", "cgt statement"],
    fieldSignals: ["capital gain", "sale price", "purchase price", "shares"],
    minimumSignals: 2,
  },
  business_books: {
    label: "business books or sales records",
    aliases: ["business books", "sales records", "business record"],
    fieldSignals: ["sales", "revenue", "expense", "profit"],
    minimumSignals: 2,
  },
  agri_record: {
    label: "agriculture income record",
    aliases: ["agriculture record", "farm income record", "agri record"],
    fieldSignals: ["agriculture", "crop", "farm", "land"],
    minimumSignals: 2,
  },
  foreign_asset_statement: {
    label: "foreign asset or income statement",
    aliases: ["foreign asset statement", "foreign income statement", "overseas asset"],
    fieldSignals: ["foreign", "overseas", "country", "asset"],
    minimumSignals: 2,
  },
  aop_company_proof: {
    label: "AOP or company proof",
    aliases: ["aop proof", "company proof", "partnership proof"],
    fieldSignals: ["aop", "partnership", "company", "shareholding"],
    minimumSignals: 2,
  },
  sales_tax_return: {
    label: "sales tax or FED return",
    aliases: ["sales tax return", "fed return", "gst return"],
    fieldSignals: ["sales tax", "fed", "gst", "output tax"],
    minimumSignals: 2,
  },
  other_income_proof: {
    label: "other income proof",
    aliases: ["other income proof", "income receipt", "income proof"],
    fieldSignals: ["income", "receipt", "payer", "amount"],
    minimumSignals: 2,
  },
};

function normalizeDocumentText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildExtractionPrompt(documentType: string) {
  const rule = DOCUMENT_SLOT_RULES[documentType];
  if (!rule) return EXTRACTION_PROMPT;

  return `${EXTRACTION_PROMPT}

Expected upload slot: ${rule.label}.
Verify the actual document content against this slot. Do not label a bank statement as a CNIC, or a CNIC as a bank statement. If the uploaded document does not match the expected slot, still return its actual documentType so the application can reject it.`;
}

function validateExtractedDocument(documentType: string, extracted: unknown) {
  const rule = DOCUMENT_SLOT_RULES[documentType];
  if (!rule) return { valid: true as const };

  const payload = extracted as {
    documentType?: unknown;
    fields?: Array<{ label?: unknown }>;
  };
  const declaredType = normalizeDocumentText(payload.documentType);
  const fieldLabels = (payload.fields ?? [])
    .map((field) => normalizeDocumentText(field.label))
    .join(" ");

  const declaredTypeMatches = rule.aliases.some((alias) =>
    declaredType.includes(normalizeDocumentText(alias)),
  );
  const matchingSignals = rule.fieldSignals.filter((signal) =>
    fieldLabels.includes(normalizeDocumentText(signal)),
  ).length;

  if (declaredTypeMatches || matchingSignals >= rule.minimumSignals) {
    return { valid: true as const };
  }

  return {
    valid: false as const,
    error: `This file does not appear to be a ${rule.label}. Upload the correct document for this slot.`,
  };
}


async function getCurrentUserId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new Error("User profile not found");
  return user.id;
}

async function getOwnedDraft(draftId: string) {
  const userId = await getCurrentUserId();
  const draft = await prisma.filingDraft.findFirst({
    where: { id: draftId, userId },
    select: { id: true, userId: true },
  });
  if (!draft) throw new Error("Filing draft not found");
  return draft;
}

async function getOwnedDocument(documentId: string) {
  const userId = await getCurrentUserId();
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
  });
  if (!document) throw new Error("Document not found");
  return document;
}

function parseModelJson(text: string) {
  const withoutFence = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new TypeError("Gemini did not return valid JSON");
    }
    return JSON.parse(withoutFence.slice(start, end + 1));
  }
}

export async function getFilingDocumentsAction(draftId: string) {
  try {
    const draft = await getOwnedDraft(draftId);
    const documents = await prisma.document.findMany({
      where: { filingDraftId: draft.id, userId: draft.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        extractionStatus: true,
        extractionProvider: true,
        extractedAt: true,
      },
    });

    return {
      success: true,
      documents: documents.map((document) => ({
        ...document,
        extractedAt: document.extractedAt ? String(document.extractedAt) : null,
      })),
    };
  } catch (error) {
    console.error("Error fetching filing documents:", error);
    return { success: false, error: "Failed to fetch filing documents" };
  }
}

export async function getDocumentExtractionAction(documentId: string) {
  try {
    const document = await getOwnedDocument(documentId);
    const extracted = document.extractedData
      ? JSON.parse(document.extractedData)
      : null;

    return {
      success: true,
      extraction: extracted,
      status: document.extractionStatus,
    };
  } catch (error) {
    console.error("Error fetching document extraction:", error);
    return { success: false, error: "Failed to fetch extracted data" };
  }
}

export async function updateDocumentExtractionAction(
  documentId: string,
  extracted: unknown,
) {
  try {
    await getOwnedDocument(documentId);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: JSON.stringify(extracted),
        extractionStatus: "COMPLETED",
        extractionError: null,
        extractedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating document extraction:", error);
    return { success: false, error: "Failed to save extracted data" };
  }
}

function normalizedLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .replaceAll("/", "_");
}

function fieldValue(fields: Array<{ label: string; value: unknown }>, labels: string[]) {
  const wanted = new Set(labels.map(normalizedLabel));
  return fields.find((field) => wanted.has(normalizedLabel(field.label)))?.value;
}

function parseExtractedAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseExtractedDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function approveAndMapExtractedDocumentAction(documentId: string) {
  try {
    const document = await getOwnedDocument(documentId);
    if (!document.filingDraftId) {
      return { success: false, error: "Document is not attached to a filing" };
    }

    const extracted = document.extractedData
      ? (JSON.parse(document.extractedData) as {
          fields?: Array<{ label: string; value: unknown }>;
        })
      : null;
    const fields = extracted?.fields ?? [];

    if (document.documentType === "bank_statement") {
      const accountLabel = String(
        fieldValue(fields, ["account_name", "account_title", "bank_name"]) ??
          "Primary account",
      );
      const openingBalance = parseExtractedAmount(
        fieldValue(fields, ["opening_balance", "balance_at_1_february"]),
      );
      const closingBalance = parseExtractedAmount(
        fieldValue(fields, ["closing_balance", "balance_at_1_march"]),
      );

      if (openingBalance === null || closingBalance === null) {
        return {
          success: false,
          error: "Opening and closing balances were not found in extracted data",
        };
      }

      const draft = await prisma.filingDraft.findUnique({
        where: { id: document.filingDraftId },
        select: { taxYear: true },
      });

      if (!draft) {
        return { success: false, error: "Filing draft not found" };
      }

      const userId = document.userId;
      const periodStart = parseExtractedDate(
        fieldValue(fields, ["from_date", "statement_period"]),
      );
      const periodEnd = parseExtractedDate(
        fieldValue(fields, ["to_date"]),
      );
      const currency = String(fieldValue(fields, ["currency"]) ?? "PKR");
      const periodValidation = validateTaxYearStatement({
        taxYear: draft.taxYear,
        periodStart,
        periodEnd,
        currency,
      });

      if (!periodValidation.valid) {
        return { success: false, error: periodValidation.error };
      }

      const existing = await prisma.bankStatement.findFirst({
        where: {
          filingDraftId: document.filingDraftId,
          userId,
          accountLabel,
        },
        select: { id: true },
      });
      const data = {
        accountLabel,
        accountNumberMasked: String(
          fieldValue(fields, ["account_number", "iban"]) ?? "",
        ) || null,
        currency,
        periodStart,
        periodEnd,
        openingBalance,
        closingBalance,
        sourceDocumentId: document.id,
      };

      const statement = existing
        ? await prisma.bankStatement.update({ where: { id: existing.id }, data })
        : await prisma.bankStatement.create({
            data: {
              ...data,
              filingDraftId: document.filingDraftId,
              userId,
            },
          });

      await prisma.bankTransaction.updateMany({
        where: {
          filingDraftId: document.filingDraftId,
          userId,
          bankStatementId: null,
        },
        data: { bankStatementId: statement.id },
      });

      await prisma.document.update({
        where: { id: document.id },
        data: { extractionStatus: "MAPPED" },
      });

      return { success: true, mapping: "BANK_STATEMENT", statementId: statement.id };
    }

    if (document.documentType === "salary_certificate") {
      const grossSalary = parseExtractedAmount(
        fieldValue(fields, ["gross_salary", "gross_pay", "salary"]),
      );
      const taxWithheld = parseExtractedAmount(
        fieldValue(fields, ["tax_deducted", "tax_withheld"]),
      ) ?? 0;

      if (grossSalary === null) {
        return { success: false, error: "Gross salary was not found in extracted data" };
      }

      await prisma.ledgerEntry.deleteMany({
        where: {
          filingDraftId: document.filingDraftId,
          userId: document.userId,
          sourceDocumentId: document.id,
        },
      });
      await prisma.ledgerEntry.create({
        data: {
          filingDraftId: document.filingDraftId,
          userId: document.userId,
          entryType: "INCOME",
          category: "SALARY",
          description: "Salary extracted from certificate",
          amount: grossSalary,
          source: "DOCUMENT_EXTRACTION",
          sourceDocumentId: document.id,
        },
      });
      await prisma.filingDraft.update({
        where: { id: document.filingDraftId },
        data: { taxWithheld },
      });
      await prisma.document.update({
        where: { id: document.id },
        data: { extractionStatus: "MAPPED" },
      });

      return { success: true, mapping: "SALARY", grossSalary, taxWithheld };
    }

    return { success: false, error: "No mapping rule exists for this document type yet" };
  } catch (error) {
    console.error("Error mapping extracted document:", error);
    return { success: false, error: "Failed to map extracted document" };
  }
}

export async function extractDocumentWithGeminiAction(documentId: string) {
  let documentIdForError: string | null = null;

  try {
    const document = await getOwnedDocument(documentId);
    documentIdForError = document.id;

    if (!GEMINI_SUPPORTED_TYPES.has(document.mimeType)) {
      return {
        success: false,
        error: "Gemini extraction currently supports PDF, JPG, and PNG documents",
      };
    }

    await prisma.document.update({
      where: { id: document.id },
      data: {
        extractionStatus: "PROCESSING",
        extractionProvider: "gemini",
        extractionError: null,
      },
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await prisma.document.update({
        where: { id: document.id },
        data: {
          extractionStatus: "FAILED",
          extractionProvider: "gemini",
          extractionError: "GEMINI_API_KEY is not configured",
        },
      });
      return { success: false, error: "GEMINI_API_KEY is not configured" };
    }

    const storedFileName = path.basename(document.fileUrl);
    const filePath = path.join(process.cwd(), "uploads", storedFileName);
    const fileBuffer = await readFile(filePath);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });

    const result = await model.generateContent([
      { text: buildExtractionPrompt(document.documentType) },
      {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: document.mimeType,
        },
      },
    ]);

    const extracted = parseModelJson(result.response.text());
    const validation = validateExtractedDocument(document.documentType, extracted);

    if (!validation.valid) {
      await prisma.document.update({
        where: { id: document.id },
        data: {
          extractionStatus: "FAILED",
          extractionProvider: "gemini",
          extractedData: JSON.stringify(extracted),
          extractionError: validation.error,
          extractedAt: null,
        },
      });

      return { success: false, error: validation.error };
    }

    await prisma.document.update({
      where: { id: document.id },
      data: {
        extractionStatus: "COMPLETED",
        extractionProvider: "gemini",
        extractedData: JSON.stringify(extracted),
        extractionError: null,
        extractedAt: new Date(),
      },
    });

    return { success: true, documentId: document.id, extracted };
  } catch (error) {
    if (documentIdForError) {
      await prisma.document.update({
        where: { id: documentIdForError },
        data: {
          extractionStatus: "FAILED",
          extractionProvider: "gemini",
          extractionError: error instanceof Error ? error.message : "Unknown extraction error",
        },
      });
    }

    console.error("Error extracting document with Gemini:", error);
    return {
      success: false,
      error:
        process.env.NODE_ENV === "development" && error instanceof Error
          ? error.message
          : "Document extraction failed",
    };
  }
}
