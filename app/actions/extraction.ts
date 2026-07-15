"use server";

import { readFile } from "fs/promises";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

async function getOwnedDocument(documentId: string) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) throw new Error("User profile not found");

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      userId: user.id,
    },
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
      where: {
        filingDraftId: draft.id,
        userId: draft.userId,
      },
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "GEMINI_API_KEY is not configured" };
    }

    await prisma.document.update({
      where: { id: document.id },
      data: {
        extractionStatus: "PROCESSING",
        extractionProvider: "gemini",
        extractionError: null,
      },
    });

    const storedFileName = path.basename(document.fileUrl);
    const filePath = path.join(process.cwd(), "uploads", storedFileName);
    const fileBuffer = await readFile(filePath);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: modelName,
    });

    const result = await model.generateContent([
      { text: EXTRACTION_PROMPT },
      {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: document.mimeType,
        },
      },
    ]);

    const extracted = parseModelJson(result.response.text());

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
