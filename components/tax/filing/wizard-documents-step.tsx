"use client";

import type React from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StepHeading } from "@/components/tax/wizard-ui";

export type FilingDocumentRecord = {
  id: string;
  fileName: string;
  extractionStatus: string;
  extractionProvider: string | null;
  extractedAt: string | null;
};

export type WizardDocumentSlot = {
  documentType: string;
  label: string;
  reason: string;
  required: boolean;
};

type WizardDocumentsStepProps = Readonly<{
  documentSlots: WizardDocumentSlot[];
  uploadedDocuments: Record<string, string>;
  documentRecords: Record<string, FilingDocumentRecord>;
  uploadingDocumentType: string | null;
  extractingDocumentId: string | null;
  documentUploadError: string | null;
  uploadFileInputsRef: React.MutableRefObject<
    Record<string, HTMLInputElement | null>
  >;
  triggerDocumentUpload: (documentType: string) => void;
  handleDocumentFileSelected: (
    documentType: string,
    fileList: FileList | null,
  ) => void;
  handleExtractDocument: (documentType: string) => void;
}>;

export function WizardDocumentsStep({
  documentSlots,
  uploadedDocuments,
  documentRecords,
  uploadingDocumentType,
  extractingDocumentId,
  documentUploadError,
  uploadFileInputsRef,
  triggerDocumentUpload,
  handleDocumentFileSelected,
  handleExtractDocument,
}: WizardDocumentsStepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Upload your documents"
        description="Upload each document one at a time, using its own button below."
      />

      {documentUploadError && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {documentUploadError}
        </div>
      )}

      <div className="rounded-xl border border-amanah/20 bg-amanah/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amanah" />
          <p className="text-sm text-amanah">
            AI will extract salary, tax deducted, account balances, and more
            directly from what you upload.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Documents</h3>

        {documentSlots.map((slot) => {
          const uploadedFileName = uploadedDocuments[slot.documentType];
          const documentRecord = documentRecords[slot.documentType];
          const isUploading = uploadingDocumentType === slot.documentType;
          const isExtracting = extractingDocumentId === documentRecord?.id;
          const isExtracted = documentRecord?.extractionStatus === "COMPLETED";

          return (
            <div
              key={slot.documentType}
              className={`flex min-w-0 flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center ${
                slot.required
                  ? "border-amanah/20 bg-amanah/5"
                  : "border-dashed opacity-90"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    uploadedFileName
                      ? "bg-amanah/15 text-amanah"
                      : slot.required
                        ? "bg-amanah/10 text-amanah"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {uploadedFileName ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-medium ${slot.required ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {slot.label}
                    </span>
                    {slot.required ? (
                      <Badge
                        variant="outline"
                        className="border-amanah/25 bg-amanah/10 px-1.5 py-0 text-[10px] text-amanah"
                      >
                        Required
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {uploadedFileName
                      ? `Uploaded: ${uploadedFileName}`
                      : slot.reason}
                  </p>
                </div>
              </div>

              <input
                ref={(element) => {
                  uploadFileInputsRef.current[slot.documentType] = element;
                }}
                type="file"
                className="hidden"
                onChange={(event) =>
                  handleDocumentFileSelected(
                    slot.documentType,
                    event.target.files,
                  )
                }
              />

              <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant={uploadedFileName ? "outline" : "default"}
                  size="sm"
                  className="min-w-0 flex-1 gap-1.5 sm:w-auto"
                  onClick={() => triggerDocumentUpload(slot.documentType)}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {isUploading
                    ? "Uploading..."
                    : uploadedFileName
                      ? "Replace"
                      : "Upload"}
                </Button>

                {uploadedFileName && documentRecord && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-0 flex-1 gap-1.5 sm:w-auto"
                    onClick={() => handleExtractDocument(slot.documentType)}
                    disabled={isExtracting || isExtracted}
                  >
                    {isExtracting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isExtracted ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isExtracting
                      ? "Extracting..."
                      : isExtracted
                        ? "Extracted"
                        : "Extract"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
