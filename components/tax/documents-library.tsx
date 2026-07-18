"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";

import type { DocumentLibraryItem } from "@/app/actions/documents";
import {
  extractDocumentWithGeminiAction,
  getDocumentExtractionAction,
  updateDocumentExtractionAction,
} from "@/app/actions/extraction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ExtractedPayload = {
  documentType?: string;
  fields?: Array<{
    label: string;
    value: string | number | boolean | null;
    confidence?: number;
  }>;
  notes?: string[];
};

export function DocumentsLibrary({
  initialDocuments,
}: {
  initialDocuments: DocumentLibraryItem[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [extractedById, setExtractedById] = useState<
    Record<string, ExtractedPayload>
  >({});
  const [error, setError] = useState<string | null>(null);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesQuery =
        !normalizedQuery ||
        document.fileName.toLowerCase().includes(normalizedQuery) ||
        document.documentType.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "ALL" || document.extractionStatus === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [documents, query, statusFilter]);

  async function handleExtract(documentId: string) {
    setExtractingId(documentId);
    setError(null);

    const result = await extractDocumentWithGeminiAction(documentId);
    setExtractingId(null);

    if (!result.success) {
      setError(result.error ?? "Document extraction failed");
      setDocuments((previous) =>
        previous.map((document) =>
          document.id === documentId
            ? { ...document, extractionStatus: "FAILED" }
            : document,
        ),
      );
      return;
    }

    setDocuments((previous) =>
      previous.map((document) =>
        document.id === documentId
          ? {
              ...document,
              extractionStatus: "COMPLETED",
              extractionProvider: "gemini",
              extractedAt: new Date().toISOString(),
            }
          : document,
      ),
    );
  }

  async function handleReview(documentId: string) {
    setReviewingId(documentId);
    setError(null);
    const result = await getDocumentExtractionAction(documentId);
    setReviewingId(null);

    if (!result.success) {
      setError(result.error ?? "Failed to load extracted data");
      return;
    }

    setExtractedById((previous) => ({
      ...previous,
      [documentId]: (result.extraction ?? {
        fields: [],
        notes: [],
      }) as ExtractedPayload,
    }));
  }

  function updateExtractedField(
    documentId: string,
    index: number,
    value: string,
  ) {
    setExtractedById((previous) => {
      const payload = previous[documentId];
      if (!payload?.fields) return previous;
      const fields = payload.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, value } : field,
      );
      return { ...previous, [documentId]: { ...payload, fields } };
    });
  }

  async function handleSaveReview(documentId: string) {
    const payload = extractedById[documentId];
    if (!payload) return;
    setSavingReviewId(documentId);
    setError(null);
    const result = await updateDocumentExtractionAction(documentId, payload);
    setSavingReviewId(null);
    if (!result.success)
      setError(result.error ?? "Failed to save extracted data");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review uploaded documents and run extraction when Gemini is
            available.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          {documents.length} document(s)
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search documents..."
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No documents found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="divide-y">
            {filteredDocuments.map((document) => {
              const isExtracting = extractingId === document.id;
              const isCompleted = document.extractionStatus === "COMPLETED";
              const extracted = extractedById[document.id];
              return (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amanah/10 text-amanah">
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {document.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {document.documentType} · TY {document.taxYear ?? "—"} ·{" "}
                        {(document.sizeBytes / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge variant="outline">{document.extractionStatus}</Badge>
                    <a
                      href={`/api/documents/${document.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Open
                    </a>
                    {isCompleted && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleReview(document.id)}
                        disabled={reviewingId === document.id}
                        className="gap-1.5"
                      >
                        {reviewingId === document.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {reviewingId === document.id
                          ? "Loading..."
                          : "Review data"}
                      </Button>
                    )}
                    {!isCompleted && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleExtract(document.id)}
                        disabled={isExtracting}
                        className="gap-1.5"
                      >
                        {isExtracting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {isExtracting ? "Extracting..." : "Extract"}
                      </Button>
                    )}
                  </div>

                  {extracted && (
                    <div className="border-t bg-muted/20 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Extracted data
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Review and correct these fields before ledger
                            mapping.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSaveReview(document.id)}
                          disabled={savingReviewId === document.id}
                        >
                          {savingReviewId === document.id
                            ? "Saving..."
                            : "Save corrections"}
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(extracted.fields ?? []).map((field, fieldIndex) => (
                          <label
                            key={`${field.label}-${fieldIndex}`}
                            className="grid gap-1"
                          >
                            <span className="text-xs font-medium text-muted-foreground">
                              {field.label}
                              {typeof field.confidence === "number" &&
                                ` · ${Math.round(field.confidence * 100)}% confidence`}
                            </span>
                            <input
                              value={String(field.value ?? "")}
                              onChange={(event) =>
                                updateExtractedField(
                                  document.id,
                                  fieldIndex,
                                  event.target.value,
                                )
                              }
                              className="h-9 rounded-lg border bg-background px-3 text-sm"
                            />
                          </label>
                        ))}
                      </div>
                      {extracted.notes && extracted.notes.length > 0 && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {extracted.notes.join(" ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
