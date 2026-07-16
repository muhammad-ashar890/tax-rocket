"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BadgeDollarSign,
  Banknote,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDot,
  Coins,
  CreditCard,
  FileCheck2,
  FileText,
  Globe2,
  HandCoins,
  Handshake,
  Landmark,
  LaptopMinimal,
  Leaf,
  Link2,
  Mail,
  ScrollText,
  ReceiptText,
  Route,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  approveFilingDraftAction,
  getFilingDraftAction,
  invalidateFilingPipelineAction,
  updateFilingDraftAction,
  updateFilingStepAction,
} from "@/app/actions/filing";
import { uploadFilingDocumentAction } from "@/app/actions/documents";
import {
  extractDocumentWithGeminiAction,
  getFilingDocumentsAction,
} from "@/app/actions/extraction";
import {
  getLedgerEntriesAction,
  replaceLedgerEntriesAction,
  type LedgerEntryInput,
} from "@/app/actions/ledger";
import {
  calculateReconciliationPreviewAction,
  getReconciliationAction,
  saveReconciliationAction,
  type ReconciliationInput,
} from "@/app/actions/reconciliation";
import { getFilingSummaryAction } from "@/app/actions/filing-summary";
import { calculateTaxAction } from "@/app/actions/tax-calculation";
import {
  generateFilingPacketAction,
  generateFilingPacketPdfAction,
  getLatestFilingPacketAction,
} from "@/app/actions/packet";

import {
  buildTaxDocumentSlotsPreview,
  getRequiredTaxDocumentTypesForCurrentFlow,
} from "@/lib/tax/document-requirements";

import type {
  TaxIncomeSource,
  TaxReadinessItem,
} from "@/lib/tax/filing-drafts";

import { evaluateSimplifiedReturnEligibility } from "@/lib/tax/simplified-eligibility";

import type { TaxDraftMetadata } from "@/lib/tax/draft-metadata";

import type { StepsRailItem } from "@/components/tax/wizard-ui";
import { WizardHeader } from "@/components/tax/filing/wizard-header";
import { WizardNavigation } from "@/components/tax/filing/wizard-navigation";
import { WizardShellLayout } from "@/components/tax/filing/wizard-shell-layout";
import {
  WizardSetupStep,
  type SetupStepKey,
} from "@/components/tax/filing/wizard-setup-step";
import { WizardDocumentsStep } from "@/components/tax/filing/wizard-documents-step";
import {
  WizardLedgerStep,
  type WizardLedgerEntry,
} from "@/components/tax/filing/wizard-ledger-step";
import { WizardReconciliationStep } from "@/components/tax/filing/wizard-reconciliation-step";
import { WizardReviewStep } from "@/components/tax/filing/wizard-review-step";
import { WizardPacketStep } from "@/components/tax/filing/wizard-packet-step";
import { WizardApprovalStep } from "@/components/tax/filing/wizard-approval-step";
import { WizardFbrStep } from "@/components/tax/filing/wizard-fbr-step";
import { WizardBankIntelligenceStep } from "@/components/tax/filing/wizard-bank-intelligence-step";
import type { FilingDocumentRecord } from "@/components/tax/filing/wizard-documents-step";

// Type added locally since we removed the demo-store
export type ReconciliationMethod = "auto" | "manual";

// ─────────────────────────────────────────────────────────────────────────
// FilingWizard v5 — the ENTIRE filing journey, one component, one rail.
//
// Per direct, explicit product feedback: everything that used to live on
// separate routes (Setup confirmation, Upload, Ledgers, Reconciliation,
// Review, Filing Packet / Approve, FBR Connect) now lives in THIS single
// file as one continuous left-rail journey. There is no more page
// navigation between these steps — no fresh "loading" flash, no
// remounted shell. Clicking "Continue" just advances the local step
// index, exactly like moving between the original Setup questions.
//
// Journey (left rail, top to bottom):
//   1. Who's filing              (setup question)
//   2. Business type             (setup question — only if "My Business")
//   3. Income sources            (setup question)
//   4. Salary share              (setup question — only if salary + other sources)
//   5. Tax year                  (setup question)
//   6. Readiness                 (setup question)
//   7. Upload documents          (setup question — required-doc checklist + upload dropzone)
//   8. Review & create           (setup recap + the "Create Filing" action)
//   ────────────────────────────────────────────────────────────────
//   9. ledgers                   (pipeline — income/expense/asset/liability ledgers)
//   10. Reconciliation           (pipeline — Mizan gap: Auto-adjust vs. Manual)
//   11. Review                   (pipeline — extraction + risk overview)
//   12. Filing Packet            (pipeline — packet generation summary)
//   13. Approval                 (pipeline — explicit sign-off)
//   14. FBR connect              (pipeline — supervised filing hand-off)
//
// The pipeline steps (9-14) only appear in the rail once "Create Filing"
// has been pressed — advancing into them is a direct, explicit result of
// that button click, never automatic. A demo-only `draftId` is created
// at that point (see `lib/demo-store.ts`) purely so this component can
// track/resume progress; it has no bearing on the backend contract below.
//
// Backend contract — fully preserved:
//   - `FilingWizard({ createAction })` signature unchanged; `createAction`
//     is still called with the exact same FormData shape as before, at
//     the exact moment "Create Filing" is pressed.
//   - Every FormData field name/value option is identical to the
//     original wizard.
//   - The real bug fix from the previous revision is preserved: the
//     "Create Filing" button is gated by `canSubmit`, not step-index math.
//
// Fix (per direct feedback): on mobile/tablet, once the 3-column layout
// stacks into a single column below the `lg` breakpoint, the full steps
// rail used to render in full above the actual question — forcing a
// scroll past the entire journey outline just to see "Who is filing?".
// The left rail now renders `WizardStepsRailCompact` (a single
// "Step X of Y" row + progress bar + optional "View all steps" expand)
// below `lg`, and the full always-visible `WizardStepsRail` unchanged
// at `lg` and above.
//
// Mobile document-row fix: the upload button on the right side of each
// document row was overflowing or squeezing the label text on narrow
// screens. Each row is now `flex-col sm:flex-row` — on mobile the
// button drops below the label (full-width), and on desktop it stays
// inline at the end of the row.
// ─────────────────────────────────────────────────────────────────────────

const currentTaxYear = new Date().getFullYear();

const taxYearOptions = Array.from({ length: 6 }, (_, i) => currentTaxYear - i);

const incomeSourceOptions = [
  { value: "salary", label: "Salary", icon: BriefcaseBusiness },
  { value: "pension", label: "Pension", icon: HandCoins },
  { value: "property_rent", label: "Rental Income", icon: Building2 },
  { value: "services", label: "Freelancer", icon: LaptopMinimal },
  { value: "bank_profit", label: "Bank Profit", icon: Landmark },
  { value: "dividend", label: "Dividend", icon: Banknote },
  { value: "capital_gains", label: "Capital Gains", icon: Coins },
  { value: "business", label: "Business Income", icon: BadgeDollarSign },
  { value: "agriculture", label: "Agriculture", icon: Leaf },
  { value: "foreign_income_assets", label: "Non-Resident", icon: Globe2 },
  { value: "aop_company_links", label: "AOP / Company", icon: Link2 },
  {
    value: "sales_tax_fed_withholding",
    label: "Sales Tax / FED",
    icon: ReceiptText,
  },
  { value: "other_income", label: "Other Income", icon: FileText },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  icon: LucideIcon;
}>;

const readinessOptions = [
  { value: "cnic_ntn_ready", label: "CNIC / NTN", icon: CreditCard },
  { value: "iris_credentials_ready", label: "Iris Login", icon: CircleDot },
  { value: "mobile_email_ready", label: "Mobile / Email", icon: Mail },
  {
    value: "previous_return_available",
    label: "Previous Return",
    icon: FileCheck2,
  },
  { value: "core_documents_ready", label: "Core Documents", icon: FileText },
] as const;

function computeDocumentSlots(input: {
  incomeSources: TaxIncomeSource[];
  readinessCompleted: TaxReadinessItem[];
}) {
  return buildTaxDocumentSlotsPreview({
    incomeSources: input.incomeSources,
    readinessCompleted: input.readinessCompleted,
  });
}

// ─── Step keys — the whole journey, one flat list ──────────────────────

type PipelineStepKey =
  | "bank_intelligence"
  | "ledgers"
  | "reconciliation"
  | "pipeline_review"
  | "filing_packet"
  | "approval"
  | "fbr_connect";

type StepKey = SetupStepKey | PipelineStepKey;

const stepLabels: Record<StepKey, string> = {
  who: "Who's filing",
  structure: "Business type",
  income: "Income sources",
  salary_split: "Salary share",
  tax_year: "Tax year",
  readiness: "Readiness",
  documents: "Upload documents",
  review: "Review & create",
  bank_intelligence: "Bank Intelligence",
  ledgers: "ledgers",
  reconciliation: "Reconciliation",
  pipeline_review: "Review",
  filing_packet: "Filing Packet",
  approval: "Approval",
  fbr_connect: "FBR connect",
};

// ─── Main Wizard ─────────────────────────────────────────────────────

type FilingSummary = {
  income: number;
  expenses: number;
  assets: number;
  liabilities: number;
  ledgerEntryCount: number;
  documentCount: number;
  pendingDocumentCount: number;
  reconciliationStatus: string;
  reconciliationGap: number | null;
  taxableIncome: number | null;
  taxWithheld: number | null;
  taxPayable: number | null;
  refundDue: number | null;
  taxCalculationStatus: string;
};

type FilingPacketSummary = {
  id: string;
  version: number;
  packetHash: string;
  status: string;
  taxPayable: number;
  refundDue: number;
  pdfUrl?: string | null;
  createdAt: string | Date;
};

type FilingWizardProps = {
  createAction: (formData: FormData) => Promise<void>;
  /** Optional — called on every meaningful change so a real autosave endpoint can be wired later. No-op if omitted. */
  onAutoSave?: (snapshotFormData: FormData) => void;
  /** Optional — explicit "Save draft" button handler. Falls back to a friendly inline confirmation if omitted. */
  onSaveDraft?: (snapshotFormData: FormData) => Promise<void> | void;
  /** Optional — resume an already-created demo filing (e.g. from "Continue Filing" on the dashboard) straight into the pipeline phase of this same rail. */
  resumeDraftId?: string;
};

export function FilingWizard({
  createAction,
  onAutoSave,
  onSaveDraft,
  resumeDraftId,
}: FilingWizardProps) {
  const [step, setStep] = useState(0);

  // Tracks the furthest step index the user has ever reached in this
  // session. Fixes a real bug: "completed" was previously computed as
  // `index < step`, which only looked at where the user currently is —
  // so going Back a few steps made every step ahead of the new
  // (smaller) `step` value look "not completed" again, even though the
  // user had already filled them in, and clicking them in the rail did
  // nothing (only completed steps are clickable). Tracking the furthest
  // point ever reached means a step stays marked completed — and
  // clickable — even after navigating backward past it.
  const [furthestStepReached, setFurthestStepReached] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  // ── Navigation lock ──────────────────────────────────────────────────
  // Fixes a real glitch: the "Continue" button on one step sits in the
  // exact same screen position as "Create Filing" on the very next step
  // (Review & create). A fast double-click (or a click that lands right
  // as the step transitions) could hit that same spot twice — once as
  // "Continue" advancing to Review, and immediately again as "Create
  // Filing" — submitting the filing without the user ever actually
  // seeing the Review screen, which is what made it look like Upload
  // jumped straight to Ledgers. This ref+short-timeout ignores any
  // further "Continue"/"Create Filing" clicks for a brief moment right
  // after a step change, so each click can only ever advance one step.
  const navigationLockedRef = useRef(false);

  useEffect(() => {
    navigationLockedRef.current = true;
    const handle = setTimeout(() => {
      navigationLockedRef.current = false;
    }, 400);
    return () => clearTimeout(handle);
  }, [step]);

  // Whenever `step` moves forward past whatever was previously the
  // furthest point reached, extend the furthest-reached marker. Moving
  // backward never shrinks it — that's the whole fix (see the comment
  // on `furthestStepReached` above).
  useEffect(() => {
    setFurthestStepReached((prev) => Math.max(prev, step));
  }, [step]);

  // ── Demo-only: once "Create Filing" is pressed, a lightweight local
  // draft record is created purely so this single component can track
  // progress through the pipeline phase and be resumed later. This has
  // no bearing on the `createAction` backend contract below — that is
  // still called with the real FormData at the same point as before. ──
  const [draftId, setDraftId] = useState<string | null>(null);

  // ── Step: Who is filing? (unchanged) ──
  const [filerType, setFilerType] = useState<"myself" | "my_business" | null>(
    null,
  );

  // ── Income sources (unchanged) ──
  const [incomeSources, setIncomeSources] = useState<TaxIncomeSource[]>([]);
  const [salaryPercentage, setSalaryPercentage] = useState<
    "over_50" | "under_50" | null
  >(null);

  // ── Business structure (unchanged) ──
  const [businessStructure, setBusinessStructure] = useState<string | null>(
    null,
  );

  // ── Gating facts — not asked on-screen; inferred/defaulted (unchanged from previous revision) ──
  const hasServicesIncome = incomeSources.includes("services") ? "yes" : "no";
  const hasForeignIncomeOrAssets = incomeSources.includes(
    "foreign_income_assets",
  )
    ? "yes"
    : "no";
  const hasAopCompanyLink = incomeSources.includes("aop_company_links")
    ? "yes"
    : "no";
  const employerCount = "unsure";
  const highProfitOnDebt = "unsure";
  const filingIntent = "original";

  // ── Tax year & residency ──
  const [taxYear, setTaxYear] = useState(currentTaxYear);
  const residencyDays = "yes";

  const [readinessCompleted, setReadinessCompleted] = useState<
    TaxReadinessItem[]
  >([
    "cnic_ntn_ready",
    "iris_credentials_ready",
    "mobile_email_ready",
    "core_documents_ready",
  ]);

  // ── Per-document upload state ──────────────────────────────────────
  // Per direct feedback: no bulk drag-and-drop zone — each required
  // document gets its own dedicated "Upload" button/slot instead.
  const [uploadedDocuments, setUploadedDocuments] = useState<
    Record<string, string>
  >({}); // documentType -> fileName
  const [documentRecords, setDocumentRecords] = useState<
    Record<string, FilingDocumentRecord>
  >({});
  const [extractingDocumentId, setExtractingDocumentId] = useState<
    string | null
  >(null);
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<
    Record<string, File>
  >({}); // staged until a real draftId exists
  const [uploadingDocumentType, setUploadingDocumentType] = useState<
    string | null
  >(null);
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(
    null,
  );

  const uploadFileInputsRef = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );

  function triggerDocumentUpload(documentType: string) {
    uploadFileInputsRef.current[documentType]?.click();
  }

  async function handleDocumentFileSelected(
    documentType: string,
    fileList: FileList | null,
  ) {
    const file = fileList?.[0];
    if (!file) return;

    setDocumentUploadError(null);
    setUploadedDocuments((prev) => ({ ...prev, [documentType]: file.name }));
    setSelectedDocumentFiles((prev) => ({ ...prev, [documentType]: file }));

    // Setup documents are selected before "Create Filing" creates the DB draft.
    // They stay staged in memory and are uploaded immediately after creation.
    if (!draftId) return;

    setUploadingDocumentType(documentType);

    const uploadData = new FormData();
    uploadData.set("draftId", draftId);
    uploadData.set("documentType", documentType);
    uploadData.set("file", file);

    const result = await uploadFilingDocumentAction(uploadData);
    setUploadingDocumentType(null);

    if (result.success) {
      setDocumentRecords((previous) => ({
        ...previous,
        [documentType]: {
          id: result.document.id,
          fileName: result.document.fileName,
          extractionStatus: result.document.extractionStatus,
          extractionProvider: null,
          extractedAt: null,
        },
      }));
      resetForSetupChange();
    }

    if (!result.success) {
      setDocumentUploadError(result.error ?? "Failed to upload document");
      setUploadedDocuments((prev) => {
        const next = { ...prev };
        delete next[documentType];
        return next;
      });
    }
  }

  async function handleExtractDocument(documentType: string) {
    const record = documentRecords[documentType];
    if (!record) return;

    setExtractingDocumentId(record.id);
    setDocumentUploadError(null);

    const result = await extractDocumentWithGeminiAction(record.id);
    setExtractingDocumentId(null);

    if (!result.success) {
      setDocumentUploadError(result.error ?? "Document extraction failed");
      setDocumentRecords((previous) => ({
        ...previous,
        [documentType]: {
          ...record,
          extractionStatus: "FAILED",
        },
      }));
      return;
    }

    setDocumentRecords((previous) => ({
      ...previous,
      [documentType]: {
        ...record,
        extractionStatus: "COMPLETED",
        extractionProvider: "gemini",
        extractedAt: new Date().toISOString(),
      },
    }));
    resetForSetupChange();

    if (draftId) {
      const refreshedSummary = await getFilingSummaryAction(draftId);
      if (refreshedSummary.success) {
        setFilingSummary(refreshedSummary.summary as FilingSummary);
      }
    }
  }

  // ── Pipeline-phase state (Ledgers → Reconciliation → Review → Filing Packet → Approval → FBR Connect) ──
  const [reconciliationMethod, setReconciliationMethod] =
    useState<ReconciliationMethod | null>(null);
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [reconciliationResolved, setReconciliationResolved] = useState<{
    method: ReconciliationMethod;
    note?: string;
  } | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(
    null,
  );
  const [reconciliationPreview, setReconciliationPreview] = useState<{
    openingWealth: number;
    closingWealth: number;
    totalIncome: number;
    totalExpenses: number;
    gap: number;
  } | null>(null);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);

  const [ledgerEntries, setLedgerEntries] = useState<WizardLedgerEntry[]>([]);
  const [ledgerDraft, setLedgerDraft] = useState<LedgerEntryInput>({
    date: "",
    entryType: "INCOME",
    category: "",
    description: "",
    amount: "",
    source: "MANUAL",
  });
  const [savingLedger, setSavingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const ledgerHydratedRef = useRef(false);
  const previousLedgerSignatureRef = useRef<string | null>(null);
  const [filingSummary, setFilingSummary] = useState<FilingSummary | null>(
    null,
  );
  const [filingSummaryError, setFilingSummaryError] = useState<string | null>(
    null,
  );
  const [calculatingTax, setCalculatingTax] = useState(false);
  const [taxCalculationError, setTaxCalculationError] = useState<string | null>(
    null,
  );
  const [filingPacket, setFilingPacket] = useState<FilingPacketSummary | null>(
    null,
  );
  const [generatingPacket, setGeneratingPacket] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [packetError, setPacketError] = useState<string | null>(null);

  // ── Resume an existing demo draft straight into the pipeline phase ──
  useEffect(() => {
    if (!resumeDraftId) return;

    // Fetch the draft details dynamically from backend Action
    let isMounted = true;
    getFilingDraftAction(resumeDraftId).then((result) => {
      if (!isMounted) return;
      if (!result.success || !result.draft) return;

      const existing = result.draft;

      setDraftId(existing.id);
      setFilerType(
        (existing.filerType as "myself" | "my_business") ?? "myself",
      );
      setBusinessStructure(existing.businessStructure);
      setIncomeSources(existing.incomeSources as TaxIncomeSource[]);
      setTaxYear(existing.taxYear);
      setReadinessCompleted(
        (existing.readinessCompleted as TaxReadinessItem[]) ?? [],
      );
      setApprovalConfirmed(existing.status === "APPROVED_FOR_FILING");

      // Jump straight to wherever the draft's coarse status implies.
      const jumpStep = existing.currentStep > 0 ? existing.currentStep : 0;

      // Wait for React to finish rendering states above before forcefully setting step
      setTimeout(() => {
        if (isMounted) {
          setFurthestStepReached(jumpStep);
          setStep(jumpStep);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeDraftId]);

  useEffect(() => {
    ledgerHydratedRef.current = false;
    previousLedgerSignatureRef.current = null;

    if (!draftId) {
      setLedgerEntries([]);
      return;
    }

    let isMounted = true;
    getLedgerEntriesAction(draftId).then((result) => {
      if (!isMounted) return;

      if (result.success) {
        const loadedEntries = result.entries as WizardLedgerEntry[];
        previousLedgerSignatureRef.current = JSON.stringify(loadedEntries);
        ledgerHydratedRef.current = true;
        setLedgerEntries(loadedEntries);
      } else {
        ledgerHydratedRef.current = true;
        setLedgerError(result.error ?? "Failed to load ledger entries");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [draftId]);

  useEffect(() => {
    if (!draftId) return;

    let isMounted = true;
    getFilingDocumentsAction(draftId).then((result) => {
      if (!isMounted || !result.success) return;

      const nextRecords: Record<string, FilingDocumentRecord> = {};
      const nextNames: Record<string, string> = {};

      for (const document of result.documents) {
        nextRecords[document.documentType] = document as FilingDocumentRecord;
        nextNames[document.documentType] = document.fileName;
      }

      setDocumentRecords(nextRecords);
      setUploadedDocuments(nextNames);
    });

    return () => {
      isMounted = false;
    };
  }, [draftId]);

  useEffect(() => {
    if (!draftId) {
      setFilingSummary(null);
      return;
    }

    let isMounted = true;
    getFilingSummaryAction(draftId).then((result) => {
      if (!isMounted) return;
      if (result.success) {
        setFilingSummary(result.summary as FilingSummary);
      } else {
        setFilingSummaryError(result.error ?? "Failed to load filing summary");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    draftId,
    ledgerEntries.length,
    reconciliationResolved,
    approvalConfirmed,
  ]);

  useEffect(() => {
    if (!draftId) {
      setFilingPacket(null);
      return;
    }

    let isMounted = true;
    getLatestFilingPacketAction(draftId).then((result) => {
      if (!isMounted) return;
      if (result.success && result.packet) {
        setFilingPacket(result.packet as FilingPacketSummary);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [draftId]);

  useEffect(() => {
    if (!draftId) {
      setReconciliationResolved(null);
      setReconciliationPreview(null);
      return;
    }

    let isMounted = true;
    Promise.all([
      getReconciliationAction(draftId),
      calculateReconciliationPreviewAction(draftId),
    ]).then(([savedResult, previewResult]) => {
      if (!isMounted) return;

      if (!previewResult.success) {
        setReconciliationPreview(null);
        setReconciliationResolved(null);
        setReconciliationError(
          previewResult.error ?? "Add bank data before calculating Mizan",
        );
        return;
      }

      const preview = previewResult.preview;
      setReconciliationPreview(preview);

      const record = savedResult.success ? savedResult.reconciliation : null;
      const savedMatchesPreview =
        record?.reconciliationStatus === "RESOLVED" &&
        record.reconciliationMethod &&
        record.openingWealth === preview.openingWealth &&
        record.closingWealth === preview.closingWealth &&
        record.reconciliationGap === preview.gap;

      if (
        savedMatchesPreview &&
        (record.reconciliationMethod === "auto" ||
          record.reconciliationMethod === "manual")
      ) {
        setReconciliationResolved({
          method: record.reconciliationMethod,
          note: record.reconciliationNote ?? undefined,
        });
      } else {
        setReconciliationResolved(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [draftId, ledgerEntries.length]);

  async function persistLedgerEntries(nextEntries: WizardLedgerEntry[]) {
    setLedgerEntries(nextEntries);
    setLedgerError(null);

    if (!draftId) return;

    setSavingLedger(true);
    const inputs: LedgerEntryInput[] = nextEntries.map(
      ({ id, ...entry }) => entry,
    );
    const result = await replaceLedgerEntriesAction(draftId, inputs);
    setSavingLedger(false);

    if (!result.success) {
      setLedgerError(result.error ?? "Failed to save ledger entries");
    }
  }

  function handleAddLedgerEntry() {
    const amount = Number(
      String(ledgerDraft.amount).replaceAll(",", "").trim(),
    );
    if (
      !ledgerDraft.description?.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setLedgerError("Add a description and a valid amount first");
      return;
    }

    void persistLedgerEntries([
      ...ledgerEntries,
      {
        ...ledgerDraft,
        amount,
        description: ledgerDraft.description.trim(),
      },
    ]);

    setLedgerDraft((previous) => ({
      ...previous,
      description: "",
      amount: "",
    }));
  }

  function handleRemoveLedgerEntry(index: number) {
    void persistLedgerEntries(ledgerEntries.filter((_, i) => i !== index));
  }

  function resetDownstreamSteps(
    resetStep: number,
    preserveReconciliation = false,
  ) {
    setFilingPacket(null);
    setApprovalConfirmed(false);
    setFurthestStepReached(resetStep);
    setStep((currentStep) => Math.min(currentStep, resetStep));

    if (!preserveReconciliation) {
      setReconciliationMethod(null);
      setReconciliationNote("");
      setReconciliationResolved(null);
      setReconciliationPreview(null);
    }

    if (draftId) {
      void invalidateFilingPipelineAction(
        draftId,
        resetStep,
        preserveReconciliation,
      );
    }
  }

  function resetForSetupChange() {
    const resetStep = Math.max(0, Math.min(step, setupSteps.length - 1));
    resetDownstreamSteps(resetStep);
  }

  const taxpayerType =
    filerType === "my_business" && businessStructure === "sole_proprietor"
      ? "individual"
      : filerType === "my_business"
        ? businessStructure === "tax_practitioner"
          ? "practitioner_managed"
          : "individual"
        : "salaried";

  const provisionalMetadata: TaxDraftMetadata = {
    incomeSources,
    readinessCompleted,
    readinessMissing: readinessOptions
      .filter((r) => !readinessCompleted.includes(r.value))
      .map((r) => r.value),
    complexityScore: 0,
    residencyDaysInPakistan: residencyDays as "yes" | "no" | "unsure",
    employerCount: employerCount as "single" | "multiple" | "unsure",
    hasServicesIncome: hasServicesIncome as "yes" | "no" | "unsure",
    hasForeignIncomeOrAssets: hasForeignIncomeOrAssets as
      | "yes"
      | "no"
      | "unsure",
    hasAopCompanyLink: hasAopCompanyLink as "yes" | "no" | "unsure",
    highProfitOnDebt: highProfitOnDebt as "yes" | "no" | "unsure",
    filingIntent: filingIntent as "original" | "revised" | "unsure",
  };

  const isMyself = filerType === "myself";
  const isSoleProprietor =
    filerType === "my_business" && businessStructure === "sole_proprietor";
  const isBusinessEntity =
    filerType === "my_business" &&
    (businessStructure === "aop" || businessStructure === "company");
  const isPractitioner =
    filerType === "my_business" && businessStructure === "tax_practitioner";

  const needsIncomeSourceSelection = isMyself || isSoleProprietor;

  const eligibilityResult =
    evaluateSimplifiedReturnEligibility(provisionalMetadata);

  const eligibilityRouteLabel = !filerType
    ? "Choose who is filing to preview the route"
    : needsIncomeSourceSelection && incomeSources.length === 0
      ? "Choose income sources to preview the route"
      : filerType === "my_business" && !isSoleProprietor && !businessStructure
        ? "Choose a business structure"
        : filerType === "my_business" && !isSoleProprietor
          ? "Business route finalizes after setup"
          : eligibilityResult.isSimplifiedReturnEligible
            ? "Simple filing — assisted pilot"
            : eligibilityResult.supportedScope
              ? "Advanced — optional review available"
              : "Complex — advocate review recommended";

  const eligibilityRouteTone: "muted" | "amanah" | "mizan" | "risk" =
    !filerType ||
    (needsIncomeSourceSelection && incomeSources.length === 0) ||
    (filerType === "my_business" && !isSoleProprietor)
      ? "muted"
      : eligibilityResult.isSimplifiedReturnEligible
        ? "amanah"
        : eligibilityResult.supportedScope
          ? "mizan"
          : "risk";

  const routeToneClass: Record<typeof eligibilityRouteTone, string> = {
    muted: "border-border bg-muted/40 text-muted-foreground",
    amanah: "text-amanah border-amanah/25 bg-amanah/10",
    mizan: "text-mizan-foreground border-mizan/40 bg-mizan/20",
    risk: "text-destructive border-destructive/25 bg-destructive/10",
  };

  const documentSlots = computeDocumentSlots({
    incomeSources,
    readinessCompleted,
  });

  const requiredDocumentTypes = getRequiredTaxDocumentTypesForCurrentFlow({
    incomeSources,
  });

  const toggleIncomeSource = useCallback(
    (value: TaxIncomeSource) => {
      resetForSetupChange();
      setIncomeSources((prev) =>
        prev.includes(value)
          ? prev.filter((s) => s !== value)
          : [...prev, value],
      );
    },
    [resetForSetupChange],
  );

  const toggleReadiness = useCallback(
    (value: TaxReadinessItem) => {
      resetForSetupChange();
      setReadinessCompleted((prev) =>
        prev.includes(value)
          ? prev.filter((s) => s !== value)
          : [...prev, value],
      );
    },
    [resetForSetupChange],
  );

  // ── Build the FormData snapshot — identical field names/values as the original wizard ──
  const buildFormData = useCallback(() => {
    const formData = new FormData();
    formData.set("taxYear", String(taxYear));
    formData.set("taxpayerType", taxpayerType);
    formData.set("residencyDaysInPakistan", residencyDays);
    formData.set("filerType", filerType ?? "");
    formData.set("businessStructure", businessStructure ?? "");
    formData.set("salaryPercentage", salaryPercentage ?? "");
    formData.set("employerCount", employerCount);
    formData.set("hasServicesIncome", hasServicesIncome);
    formData.set("hasForeignIncomeOrAssets", hasForeignIncomeOrAssets);
    formData.set("hasAopCompanyLink", hasAopCompanyLink);
    formData.set("highProfitOnDebt", highProfitOnDebt);
    formData.set("filingIntent", filingIntent);
    for (const source of incomeSources)
      formData.append("incomeSources", source);
    for (const item of readinessCompleted)
      formData.append("readinessCompleted", item);
    return formData;
  }, [
    taxYear,
    taxpayerType,
    filerType,
    businessStructure,
    salaryPercentage,
    incomeSources,
    readinessCompleted,
  ]);

  useEffect(() => {
    if (!onAutoSave) return;
    const handle = setTimeout(() => {
      onAutoSave(buildFormData());
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildFormData, onAutoSave]);

  const handleSaveDraft = useCallback(async () => {
    setSavingDraft(true);
    try {
      if (onSaveDraft) {
        await onSaveDraft(buildFormData());
      } else {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      setDraftSavedAt(Date.now());
    } finally {
      setSavingDraft(false);
    }
  }, [buildFormData, onSaveDraft]);

  // ── Setup-phase step list (unchanged branching logic) ────────────────
  const showsSalarySplit =
    incomeSources.includes("salary") && incomeSources.length >= 2;

  const setupSteps: SetupStepKey[] = useMemo(() => {
    if (!filerType) return ["who"];

    if (filerType === "my_business" && !businessStructure)
      return ["who", "structure"];

    const tail: SetupStepKey[] = ["tax_year", "readiness", "documents"];

    if (isMyself) {
      return [
        "who",
        "income",
        ...(showsSalarySplit ? (["salary_split"] as SetupStepKey[]) : []),
        ...tail,
        "review",
      ];
    }

    if (isSoleProprietor) {
      return [
        "who",
        "structure",
        "income",
        ...(showsSalarySplit ? (["salary_split"] as SetupStepKey[]) : []),
        ...tail,
        "review",
      ];
    }

    if (isBusinessEntity || isPractitioner) {
      return ["who", "structure", ...tail, "review"];
    }

    return ["who", "structure"];
  }, [
    filerType,
    businessStructure,
    isMyself,
    isSoleProprietor,
    isBusinessEntity,
    isPractitioner,
    showsSalarySplit,
  ]);

  // Pipeline steps only exist in the rail once a filing has actually been
  // created — appearing here is a direct result of the "Create Filing"
  // click, never automatic.
  const pipelineSteps: PipelineStepKey[] = [
    "bank_intelligence",
    "ledgers",
    "reconciliation",
    "pipeline_review",
    "filing_packet",
    "approval",
    "fbr_connect",
  ];

  const combinedSteps: StepKey[] = useMemo(
    () => (draftId ? [...setupSteps, ...pipelineSteps] : setupSteps),
    [draftId, setupSteps],
  );

  const totalSteps = combinedSteps.length;

  useEffect(() => {
    if (!draftId || !ledgerHydratedRef.current) return;

    const signature = JSON.stringify(ledgerEntries);
    if (previousLedgerSignatureRef.current === null) {
      previousLedgerSignatureRef.current = signature;
      return;
    }

    if (signature === previousLedgerSignatureRef.current) return;
    previousLedgerSignatureRef.current = signature;

    const ledgerStepIndex = combinedSteps.indexOf("ledgers");
    if (ledgerStepIndex < 0) return;

    resetDownstreamSteps(ledgerStepIndex);
  }, [draftId, ledgerEntries, combinedSteps]);

  const resumePendingRef = useRef(Boolean(resumeDraftId));
  useEffect(() => {
    if (resumePendingRef.current) {
      resumePendingRef.current = false;
      return;
    }
    // Only clamp the step if we aren't resuming an explicitly later step.
    // If we have a draftId AND the furthest step reached is > 0, we've loaded a draft,
    // so do not crush the step down back to 0.
    if (!draftId && furthestStepReached === 0) {
      setStep((s) => Math.min(s, totalSteps - 1));
    }
  }, [totalSteps, draftId, furthestStepReached]);

  const currentStepKey = combinedSteps[step] ?? "who";
  const isPipelinePhase = pipelineSteps.includes(
    currentStepKey as PipelineStepKey,
  );

  // Whether the CURRENT step's own question has been answered — gates the "Next"/"Continue" button.
  const canGoNext = useMemo(() => {
    if (currentStepKey === "who") return Boolean(filerType);
    if (currentStepKey === "structure") return Boolean(businessStructure);
    if (currentStepKey === "income") return incomeSources.length > 0;
    if (currentStepKey === "salary_split") return Boolean(salaryPercentage);
    if (currentStepKey === "tax_year") return Boolean(taxYear);
    if (currentStepKey === "filing_packet") return Boolean(filingPacket);
    if (currentStepKey === "reconciliation")
      return Boolean(reconciliationResolved);
    if (currentStepKey === "approval") return approvalConfirmed;

    return true;
  }, [
    currentStepKey,
    filerType,
    businessStructure,
    incomeSources.length,
    salaryPercentage,
    taxYear,
    reconciliationResolved,
    reconciliationPreview,
    filingPacket,
    approvalConfirmed,
  ]);

  // Whether EVERY required setup field is filled — gates the "Create
  // Filing" submit button. Deliberately independent of step-index math
  // (this is the bug fix from the previous revision, preserved).
  const canSubmit = useMemo(() => {
    if (!filerType) return false;
    if (filerType === "my_business" && !businessStructure) return false;
    if (needsIncomeSourceSelection && incomeSources.length === 0) return false;
    if (showsSalarySplit && !salaryPercentage) return false;
    if (!taxYear) return false;
    return true;
  }, [
    filerType,
    businessStructure,
    needsIncomeSourceSelection,
    incomeSources.length,
    showsSalarySplit,
    salaryPercentage,
    taxYear,
  ]);

  const hasResolvedRequiredDocumentCount =
    Boolean(filerType) &&
    needsIncomeSourceSelection &&
    incomeSources.length > 0;

  const documentRequirementSummary = !filerType
    ? "Pending choice"
    : hasResolvedRequiredDocumentCount
      ? `${requiredDocumentTypes.length} required`
      : needsIncomeSourceSelection
        ? "Choose income sources"
        : "Finalized after setup";

  const showStructureRow = Boolean(
    filerType === "my_business" && businessStructure,
  );

  const railItems: StepsRailItem[] = useMemo(
    () =>
      combinedSteps.map((key, index) => ({
        label: stepLabels[key],
        current: index === step,
        // A step is "completed" (and therefore clickable) once the user
        // has ever reached past it — not just when it's behind the
        // *current* step. This is what lets you go Back a few steps and
        // then jump straight back to a later step you already filled
        // in, instead of being forced to click "Continue" repeatedly.
        completed: index < furthestStepReached,
      })),
    [combinedSteps, step, furthestStepReached],
  );

  const summaryRows = useMemo(() => {
    // Per direct feedback: the summary panel was showing far less than
    // what's actually known at any given point — e.g. it never showed
    // which income sources were picked (only a count), readiness
    // progress, or how many documents had actually been uploaded. This
    // now surfaces every meaningful piece of state as soon as it's
    // available, and keeps showing it through the rest of the journey.
    const rows: {
      label: string;
      value: string;
      details?: { label: string; value: string }[];
    }[] = [];

    if (filerType)
      rows.push({ label: "Filer", value: filerType.replace("_", " ") });
    if (showStructureRow)
      rows.push({
        label: "Structure",
        value: (businessStructure ?? "").replace("_", " "),
      });
    rows.push({ label: "Tax year", value: String(taxYear) });

    if (needsIncomeSourceSelection && incomeSources.length > 0) {
      const details = incomeSources.map((s) => ({
        label: "",
        value: incomeSourceOptions.find((o) => o.value === s)?.label ?? s,
      }));
      rows.push({
        label: `Income sources`,
        value: `${incomeSources.length} selected`,
        details,
      });
    }

    if (salaryPercentage) {
      rows.push({
        label: "Salary share",
        value: salaryPercentage === "over_50" ? "Over 50%" : "Under 50%",
      });
    }

    if (readinessCompleted.length > 0) {
      rows.push({
        label: "Readiness",
        value: `${readinessCompleted.length} of ${readinessOptions.length} ready`,
      });
    }

    if (documentSlots.length > 0) {
      const uploadedCount =
        filingSummary?.documentCount ??
        documentSlots.filter((slot) =>
          Boolean(uploadedDocuments[slot.documentType]),
        ).length;
      rows.push({
        label: "Documents uploaded",
        value: `${uploadedCount} of ${documentSlots.length}`,
      });
    }

    if (draftId) {
      rows.push({ label: "Filing status", value: "Created" });
    }

    if (reconciliationResolved) {
      rows.push({
        label: "Reconciliation",
        value:
          reconciliationResolved.method === "auto"
            ? "Resolved · Auto-adjust"
            : "Resolved · Manual",
        details: [
          {
            label: "Opening Wealth",
            value: reconciliationPreview
              ? `PKR ${reconciliationPreview.openingWealth.toLocaleString()}`
              : "Not available",
          },
          {
            label: "Closing Wealth",
            value: reconciliationPreview
              ? `PKR ${reconciliationPreview.closingWealth.toLocaleString()}`
              : "Not available",
          },
          {
            label: "Unexplained Gap",
            value: reconciliationPreview
              ? `PKR ${Math.abs(reconciliationPreview.gap).toLocaleString()}`
              : "Not available",
          },
        ],
      });
    }

    if (approvalConfirmed) {
      rows.push({
        label: "Approval",
        value: "Confirmed",
        details: [
          {
            label: "Tax Payable",
            value:
              filingSummary?.taxPayable === null ||
              filingSummary?.taxPayable === undefined
                ? "Pending tax rules"
                : `PKR ${filingSummary.taxPayable.toLocaleString()}`,
          },
          {
            label: "Refund Due",
            value:
              filingSummary?.refundDue === null ||
              filingSummary?.refundDue === undefined
                ? "Pending tax rules"
                : `PKR ${filingSummary.refundDue.toLocaleString()}`,
          },
        ],
      });
    }

    return rows;
  }, [
    filerType,
    showStructureRow,
    businessStructure,
    taxYear,
    needsIncomeSourceSelection,
    incomeSources,
    salaryPercentage,
    readinessCompleted,
    documentSlots,
    uploadedDocuments,
    filingSummary,
    draftId,
    reconciliationResolved,
    reconciliationPreview,
    approvalConfirmed,
  ]);

  const currentBlockers = useMemo(() => {
    const b: string[] = [];

    // Setup Phase Blockers
    if (!draftId) {
      if (!filerType) b.push("Select who is filing");
      if (filerType === "my_business" && !businessStructure)
        b.push("Select business structure");
      if (needsIncomeSourceSelection && incomeSources.length === 0)
        b.push("Select at least one income source");
      if (showsSalarySplit && !salaryPercentage) b.push("Specify salary share");
      if (!taxYear) b.push("Select tax year");

      const missingReadiness =
        readinessOptions.length - readinessCompleted.length;
      if (missingReadiness > 0)
        b.push(`Complete ${missingReadiness} readiness check(s)`);

      const missingDocs = documentSlots.filter(
        (s) => !uploadedDocuments[s.documentType],
      ).length;
      if (missingDocs > 0) b.push(`Upload ${missingDocs} required document(s)`);
    } else {
      // Testing mode: pipeline blockers are intentionally kept light.
      if (!reconciliationResolved) b.push("Resolve wealth reconciliation gap");
      if (
        !approvalConfirmed &&
        currentStepKey !== "fbr_connect" &&
        currentStepKey !== "filing_packet"
      ) {
        b.push("Provide final approval for filing");
      }
    }

    return b;
  }, [
    draftId,
    filerType,
    businessStructure,
    needsIncomeSourceSelection,
    incomeSources.length,
    showsSalarySplit,
    salaryPercentage,
    taxYear,
    readinessCompleted.length,
    documentSlots,
    uploadedDocuments,
    reconciliationResolved,
    approvalConfirmed,
    currentStepKey,
  ]);

  // ── Navigation ────────────────────────────────────────────────────

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function goNext() {
    if (navigationLockedRef.current) return;
    if (!canGoNext) return;
    const nextIndex = Math.min(totalSteps - 1, step + 1);

    navigationLockedRef.current = true;
    setTimeout(() => {
      navigationLockedRef.current = false;
    }, 400);

    // DB state save logic for setup and pipeline steps
    if (draftId && nextIndex > step) {
      setSavingDraft(true);
      const newStatus =
        currentStepKey === "approval" && approvalConfirmed
          ? "APPROVED_FOR_FILING"
          : "IN_PROGRESS";

      // Auto-save form data + step
      await updateFilingDraftAction(draftId, {
        filerType,
        businessStructure,
        incomeSources,
        salaryPercentage,
        readinessCompleted,
      });
      await updateFilingStepAction(draftId, nextIndex, newStatus);

      setSavingDraft(false);
    }

    setStep(nextIndex);
    setFurthestStepReached((prev) => Math.max(prev, nextIndex));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // "Create Filing" — the one explicit action that both (a) calls the
  // real backend `createAction` with the unchanged FormData contract,
  // and (b) creates the demo-only local record so this same rail can
  // continue into the pipeline phase without ever navigating away.
  async function handleCreateFiling() {
    if (navigationLockedRef.current) return;
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Passes the form to parent (page.tsx) which actually calls createFilingDraftAction
      // Wait for it to return the new draftId from the database
      const result = (await createAction(buildFormData())) as any;

      if (result && result.draftId) {
        setDraftId(result.draftId);

        let uploadFailed = false;
        const stagedFiles = Object.entries(selectedDocumentFiles);
        for (const [documentType, file] of stagedFiles) {
          setUploadingDocumentType(documentType);

          const uploadData = new FormData();
          uploadData.set("draftId", result.draftId);
          uploadData.set("documentType", documentType);
          uploadData.set("file", file);

          const uploadResult = await uploadFilingDocumentAction(uploadData);
          if (!uploadResult.success) {
            uploadFailed = true;
            setDocumentUploadError(
              uploadResult.error ?? `Failed to upload ${file.name}`,
            );
            setUploadedDocuments((prev) => {
              const next = { ...prev };
              delete next[documentType];
              return next;
            });
          }
        }
        setUploadingDocumentType(null);
        setSelectedDocumentFiles({});

        if (uploadFailed) {
          const documentsStepIndex = setupSteps.indexOf("documents");
          setStep(documentsStepIndex);
          await updateFilingStepAction(
            result.draftId,
            documentsStepIndex,
            "IN_PROGRESS",
          );
          return;
        }

        const bankIntelligenceStepIndex = setupSteps.length;
        setStep(bankIntelligenceStepIndex); // first pipeline step after creation

        // Update the DB immediately to say we are on Bank Intelligence
        await updateFilingStepAction(
          result.draftId,
          bankIntelligenceStepIndex,
          "IN_PROGRESS",
        );
      } else {
        console.error("No draft ID returned from create action");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReconciliation() {
    if (!reconciliationMethod) return;
    if (
      reconciliationMethod === "manual" &&
      reconciliationNote.trim().length === 0
    )
      return;

    if (!reconciliationPreview) {
      setReconciliationError(
        "Add bank transactions with balances before resolving Mizan",
      );
      return;
    }

    const input: ReconciliationInput = {
      method: reconciliationMethod,
      note:
        reconciliationMethod === "manual"
          ? reconciliationNote.trim()
          : undefined,
      openingWealth: reconciliationPreview.openingWealth,
      closingWealth: reconciliationPreview.closingWealth,
      gap: reconciliationPreview.gap,
    };

    if (!draftId) {
      setReconciliationResolved({
        method: input.method,
        note: input.note,
      });
      return;
    }

    setSavingDraft(true);
    setReconciliationError(null);
    const result = await saveReconciliationAction(draftId, input);
    setSavingDraft(false);

    if (!result.success) {
      setReconciliationError(result.error ?? "Failed to save reconciliation");
      return;
    }

    resetDownstreamSteps(step, true);
    setReconciliationResolved({
      method: input.method,
      note: input.note,
    });
  }

  async function handleApprovalChange(checked: boolean) {
    if (!checked) {
      setApprovalConfirmed(false);
      return;
    }

    if (!draftId) {
      setApprovalConfirmed(true);
      return;
    }

    setSavingDraft(true);
    const result = await approveFilingDraftAction(draftId);
    setSavingDraft(false);

    setApprovalConfirmed(result.success);
  }

  async function handleGeneratePacket() {
    if (!draftId) return;

    setGeneratingPacket(true);
    setPacketError(null);

    const result = await generateFilingPacketAction(draftId);
    setGeneratingPacket(false);

    if (!result.success || !result.packet) {
      setPacketError(result.error ?? "Failed to generate filing packet");
      return;
    }

    setFilingPacket(result.packet as FilingPacketSummary);
    setApprovalConfirmed(false);
    setFurthestStepReached(step);

    await updateFilingStepAction(draftId, step, "IN_PROGRESS");
  }

  async function handleGeneratePacketPdf() {
    if (!draftId || !filingPacket) return;

    setGeneratingPdf(true);
    setPacketError(null);

    const result = await generateFilingPacketPdfAction(draftId);
    setGeneratingPdf(false);

    if (!result.success) {
      setPacketError(result.error ?? "Failed to generate packet PDF");
      return;
    }

    setFilingPacket((previous) =>
      previous ? { ...previous, pdfUrl: result.pdfUrl } : previous,
    );
  }

  async function handleCalculateTax() {
    if (!draftId) return;

    setCalculatingTax(true);
    setTaxCalculationError(null);

    const result = await calculateTaxAction(draftId);
    setCalculatingTax(false);

    if (!result.success) {
      setTaxCalculationError(result.error ?? "Failed to calculate tax");
      return;
    }

    const refreshed = await getFilingSummaryAction(draftId);
    if (refreshed.success) {
      setFilingSummary(refreshed.summary as FilingSummary);
    }
  }

  // ── Step content renderers ────────────────────────────────────────

  function renderSetup() {
    return (
      <WizardSetupStep
        currentStepKey={currentStepKey as SetupStepKey}
        filerType={filerType}
        businessStructure={businessStructure}
        incomeSources={incomeSources}
        salaryPercentage={salaryPercentage}
        taxYear={taxYear}
        readinessCompleted={readinessCompleted}
        showStructureRow={showStructureRow}
        needsIncomeSourceSelection={needsIncomeSourceSelection}
        documentRequirementSummary={documentRequirementSummary}
        eligibilityRouteLabel={eligibilityRouteLabel}
        eligibilityRouteTone={eligibilityRouteTone}
        canSubmit={canSubmit}
        onFilerTypeChange={(value) => {
          resetForSetupChange();
          setFilerType(value);
          if (value === "myself") {
            setBusinessStructure(null);
          } else {
            setIncomeSources([]);
            setSalaryPercentage(null);
          }
        }}
        onBusinessStructureChange={(value) => {
          resetForSetupChange();
          setBusinessStructure(value);
        }}
        onIncomeSourceToggle={toggleIncomeSource}
        onSalaryPercentageChange={(value) => {
          resetForSetupChange();
          setSalaryPercentage(value);
        }}
        onTaxYearChange={(value) => {
          resetForSetupChange();
          setTaxYear(value);
        }}
        onReadinessToggle={toggleReadiness}
      />
    );
  }

  function renderDocuments() {
    return (
      <WizardDocumentsStep
        documentSlots={documentSlots}
        uploadedDocuments={uploadedDocuments}
        documentRecords={documentRecords}
        uploadingDocumentType={uploadingDocumentType}
        extractingDocumentId={extractingDocumentId}
        documentUploadError={documentUploadError}
        uploadFileInputsRef={uploadFileInputsRef}
        triggerDocumentUpload={triggerDocumentUpload}
        handleDocumentFileSelected={handleDocumentFileSelected}
        handleExtractDocument={handleExtractDocument}
      />
    );
  }

  function renderBankIntelligence() {
    return <WizardBankIntelligenceStep draftId={draftId ?? undefined} />;
  }

  function renderLedgers() {
    return (
      <WizardLedgerStep
        ledgerEntries={ledgerEntries}
        ledgerDraft={ledgerDraft}
        savingLedger={savingLedger}
        ledgerError={ledgerError}
        onDraftChange={(patch) =>
          setLedgerDraft((previous) => ({ ...previous, ...patch }))
        }
        onAdd={handleAddLedgerEntry}
        onRemove={handleRemoveLedgerEntry}
      />
    );
  }

  function renderReconciliation() {
    return (
      <WizardReconciliationStep
        draftId={draftId ?? undefined}
        reconciliationMethod={reconciliationMethod}
        reconciliationNote={reconciliationNote}
        reconciliationResolved={reconciliationResolved}
        reconciliationPreview={reconciliationPreview}
        reconciliationError={reconciliationError}
        saving={savingDraft}
        onMethodChange={setReconciliationMethod}
        onNoteChange={setReconciliationNote}
        onConfirm={handleConfirmReconciliation}
      />
    );
  }

  function renderPipelineReview() {
    return (
      <WizardReviewStep
        filingSummary={filingSummary}
        filingSummaryError={filingSummaryError}
        taxCalculationError={taxCalculationError}
        calculatingTax={calculatingTax}
        reconciliationResolved={Boolean(reconciliationResolved)}
        draftId={draftId ?? undefined}
        onCalculateTax={handleCalculateTax}
      />
    );
  }

  function renderApproval() {
    return (
      <WizardApprovalStep
        draftId={draftId ?? undefined}
        approvalConfirmed={approvalConfirmed}
        packetVersion={filingPacket?.version}
        onApprovalChange={handleApprovalChange}
      />
    );
  }

  function renderFilingPacket() {
    return (
      <WizardPacketStep
        draftId={draftId ?? undefined}
        filingPacket={filingPacket}
        filingSummary={filingSummary}
        generatingPacket={generatingPacket}
        generatingPdf={generatingPdf}
        packetError={packetError}
        onGeneratePacket={handleGeneratePacket}
        onGeneratePdf={handleGeneratePacketPdf}
      />
    );
  }

  function renderFbrConnect() {
    return <WizardFbrStep draftId={draftId ?? undefined} />;
  }

  const stepRenderers: Record<StepKey, () => JSX.Element> = {
    who: renderSetup,
    structure: renderSetup,
    income: renderSetup,
    salary_split: renderSetup,
    tax_year: renderSetup,
    readiness: renderSetup,
    documents: renderDocuments,
    review: renderSetup,
    bank_intelligence: renderBankIntelligence,
    ledgers: renderLedgers,
    reconciliation: renderReconciliation,
    pipeline_review: renderPipelineReview,
    filing_packet: renderFilingPacket,
    approval: renderApproval,
    fbr_connect: renderFbrConnect,
  };

  const isSetupReviewStep = currentStepKey === "review";
  const isLastStep = currentStepKey === "fbr_connect";

  return (
    <div>
      <WizardHeader
        hasDraft={Boolean(draftId)}
        isPipelinePhase={isPipelinePhase}
        savingDraft={savingDraft}
        draftSavedAt={draftSavedAt}
        onSaveDraft={handleSaveDraft}
      />

      <WizardShellLayout
        showRail={Boolean(filerType)}
        railItems={railItems}
        summaryRows={summaryRows}
        blockers={currentBlockers}
        onRailItemClick={(index) => setStep(index)}
      >
        <div
          key={currentStepKey}
          className="animate-in fade-in slide-in-from-right-2 duration-300"
        >
          {stepRenderers[currentStepKey]()}
        </div>

        <WizardNavigation
          step={step}
          isSetupReviewStep={isSetupReviewStep}
          isLastStep={isLastStep}
          submitting={submitting}
          canSubmit={canSubmit}
          canGoNext={canGoNext}
          onBack={goBack}
          onContinue={goNext}
          onCreateFiling={handleCreateFiling}
        />
      </WizardShellLayout>
    </div>
  );
}
