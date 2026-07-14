"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDot,
  Coins,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Globe2,
  HandCoins,
  Handshake,
  Landmark,
  LaptopMinimal,
  Leaf,
  Loader2,
  Link2,
  Mail,
  PenLine,
  Plus,
  ScrollText,
  Trash2,
  ReceiptText,
  Route,
  Save as SaveIcon,
  Scale,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  approveFilingDraftAction,
  getFilingDraftAction,
  updateFilingDraftAction,
  updateFilingStepAction,
} from "@/app/actions/filing";
import { uploadFilingDocumentAction } from "@/app/actions/documents";
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
import {
  generateFilingPacketAction,
  getLatestFilingPacketAction,
} from "@/app/actions/packet";
import ApprovalPacket from "@/components/tax/approval-packet";

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

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";

import {
  WorkflowKpiCard,
  WorkflowKpiStrip,
} from "@/components/tax/workflow-page-shell";

import {
  BigChoiceCard,
  CompactSelectableCard,
  StepHeading,
  WizardStepsRail,
  WizardStepsRailCompact,
  WizardSummaryPanel,
  WizardActionCard,
  type StepsRailItem,
} from "@/components/tax/wizard-ui";

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

const businessStructureOptions = [
  {
    value: "sole_proprietor",
    icon: UserRound,
    label: "Sole Proprietor",
    desc: "Single owner, personal liability",
  },
  {
    value: "aop",
    icon: Handshake,
    label: "AOP",
    desc: "Association of Persons / Partnership",
  },
  {
    value: "company",
    icon: Building2,
    label: "Company",
    desc: "Private or public limited company",
  },
  {
    value: "tax_practitioner",
    icon: ScrollText,
    label: "Tax Practitioner",
    desc: "Filing for multiple clients",
  },
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

type SetupStepKey =
  | "who"
  | "structure"
  | "income"
  | "salary_split"
  | "tax_year"
  | "readiness"
  | "documents"
  | "review";

type PipelineStepKey =
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
  ledgers: "ledgers",
  reconciliation: "Reconciliation",
  pipeline_review: "Review",
  filing_packet: "Filing Packet",
  approval: "Approval",
  fbr_connect: "FBR connect",
};

// ─── Main Wizard ─────────────────────────────────────────────────────

type WizardLedgerEntry = LedgerEntryInput & {
  id?: string;
};

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
};

type FilingPacketSummary = {
  id: string;
  version: number;
  packetHash: string;
  status: string;
  taxPayable: number;
  refundDue: number;
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

    if (!result.success) {
      setDocumentUploadError(result.error ?? "Failed to upload document");
      setUploadedDocuments((prev) => {
        const next = { ...prev };
        delete next[documentType];
        return next;
      });
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
  const [filingSummary, setFilingSummary] = useState<FilingSummary | null>(
    null,
  );
  const [filingSummaryError, setFilingSummaryError] = useState<string | null>(
    null,
  );
  const [filingPacket, setFilingPacket] = useState<FilingPacketSummary | null>(
    null,
  );
  const [generatingPacket, setGeneratingPacket] = useState(false);
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
    if (!draftId) {
      setLedgerEntries([]);
      return;
    }

    let isMounted = true;
    getLedgerEntriesAction(draftId).then((result) => {
      if (!isMounted) return;

      if (result.success) {
        setLedgerEntries(result.entries as WizardLedgerEntry[]);
      } else {
        setLedgerError(result.error ?? "Failed to load ledger entries");
      }
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
  }, [draftId]);

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

  const toggleIncomeSource = useCallback((value: TaxIncomeSource) => {
    setIncomeSources((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }, []);

  const toggleReadiness = useCallback((value: TaxReadinessItem) => {
    setReadinessCompleted((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }, []);

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
          { label: "Tax Payable", value: "PKR 0" },
          { label: "Refund Due", value: "PKR 0" },
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
      // Pipeline Phase Blockers
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

        const ledgersStepIndex = setupSteps.length;
        setStep(ledgersStepIndex); // land on "ledgers", the first pipeline step

        // Update the DB immediately to say we are on the first pipeline step
        await updateFilingStepAction(
          result.draftId,
          ledgersStepIndex,
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
  }

  // ── Step content renderers ────────────────────────────────────────

  function renderWho() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="Who is filing?"
          description="Are you filing for yourself or for your business?"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <BigChoiceCard
            icon={UserRound}
            title="Myself"
            description="Individual"
            selected={filerType === "myself"}
            onClick={() => {
              setFilerType("myself");
              setBusinessStructure(null);
            }}
          />
          <BigChoiceCard
            icon={Briefcase}
            title="My Business / Client"
            description="Business or practitioner"
            selected={filerType === "my_business"}
            onClick={() => {
              setFilerType("my_business");
              setIncomeSources([]);
              setSalaryPercentage(null);
            }}
          />
        </div>
      </div>
    );
  }

  function renderStructure() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="Choose your business structure"
          description="Select the structure that best describes your business."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {businessStructureOptions.map((option) => (
            <BigChoiceCard
              key={option.value}
              icon={option.icon}
              title={option.label}
              description={option.desc}
              selected={businessStructure === option.value}
              onClick={() => setBusinessStructure(option.value)}
            />
          ))}
        </div>

        {businessStructure === "sole_proprietor" && (
          <InfoBanner tone="mizan">
            Sole proprietors also need to select their income sources in the
            next step.
          </InfoBanner>
        )}
        {businessStructure === "tax_practitioner" && (
          <InfoBanner tone="amanah">
            You'll be taken to the practitioner dashboard where you can manage
            multiple clients.
          </InfoBanner>
        )}
        {businessStructure &&
          (businessStructure === "aop" || businessStructure === "company") && (
            <InfoBanner tone="amanah">
              You'll need to provide NTN, financial year, and other business
              details.
            </InfoBanner>
          )}
      </div>
    );
  }

  function renderIncome() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="What describes your income?"
          description="Select all that apply. This determines which documents you'll need."
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {incomeSourceOptions.map((source) => (
            <CompactSelectableCard
              key={source.value}
              icon={source.icon}
              label={source.label}
              selected={incomeSources.includes(source.value)}
              onClick={() => toggleIncomeSource(source.value)}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderSalarySplit() {
    return (
      <div className="space-y-6">
        <StepHeading title="Is salary more than 50% of your income?" />
        <div className="grid gap-4 sm:grid-cols-2">
          <BigChoiceCard
            icon={BriefcaseBusiness}
            title="Yes — Salary is majority"
            description="Salaried path (Declaration 114I) — simplified workflow"
            selected={salaryPercentage === "over_50"}
            onClick={() => setSalaryPercentage("over_50")}
          />
          <BigChoiceCard
            icon={BadgeDollarSign}
            title="No — Other sources dominate"
            description="Non-Business Individual path — more review steps"
            selected={salaryPercentage === "under_50"}
            onClick={() => setSalaryPercentage("under_50")}
          />
        </div>
      </div>
    );
  }

  function renderTaxYear() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="Which tax year is this for?"
          description="Choose from the most recent tax years."
        />
        <div className="max-w-xs">
          <label
            htmlFor="taxYear"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Tax year
          </label>
          <select
            id="taxYear"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {taxYearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
                {yr === currentTaxYear ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  function renderReadiness() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="What do you already have ready?"
          description="Tap what applies — no worries if something's missing."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {readinessOptions.map((item) => {
            const selected = readinessCompleted.includes(item.value);
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => toggleReadiness(item.value)}
                className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                  selected
                    ? "border-amanah bg-amanah/5 shadow-sm"
                    : "border-border bg-card hover:border-amanah/35"
                }`}
              >
                {selected && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-amanah text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                )}
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                    selected
                      ? "border-amanah/25 bg-amanah/10 text-amanah"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <span
                  className={`text-xs font-medium ${selected ? "text-amanah" : "text-foreground"}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderDocuments() {
    // Per direct feedback: no bulk drag-and-drop zone. Every required (and
    // optional) document gets its own row with its own dedicated upload
    // button — each triggers a hidden per-slot file input, so documents
    // are attached one at a time to the exact slot they belong to.
    //
    // Mobile fix: each row is `flex-col sm:flex-row`. On mobile the
    // upload button drops below the label (full width), on desktop it
    // stays inline at the end of the row. This prevents the button from
    // overflowing or squeezing the label text on narrow screens.
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
          <h3 className="text-sm font-medium text-muted-foreground">
            Documents
          </h3>
          {documentSlots.map((slot) => {
            const uploadedFileName = uploadedDocuments[slot.documentType];
            return (
              <div
                key={slot.documentType}
                className={`flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center ${
                  slot.required
                    ? "border-amanah/20 bg-amanah/5"
                    : "border-dashed opacity-90"
                }`}
              >
                {/* Icon + text: always inline, takes remaining space */}
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
                          className="border-amanah/25 bg-amanah/10 text-amanah text-[10px] px-1.5 py-0"
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

                {/* Hidden file input for this specific slot */}
                <input
                  ref={(el) => {
                    uploadFileInputsRef.current[slot.documentType] = el;
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) =>
                    handleDocumentFileSelected(
                      slot.documentType,
                      e.target.files,
                    )
                  }
                />

                {/* Upload button: full-width on mobile, auto-width on desktop */}
                <Button
                  type="button"
                  variant={uploadedFileName ? "outline" : "default"}
                  size="sm"
                  className="w-full shrink-0 gap-1.5 sm:w-auto"
                  onClick={() => triggerDocumentUpload(slot.documentType)}
                  disabled={uploadingDocumentType === slot.documentType}
                >
                  {uploadingDocumentType === slot.documentType ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {uploadingDocumentType === slot.documentType
                    ? "Uploading..."
                    : uploadedFileName
                      ? "Replace"
                      : "Upload"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderReview() {
    const chips: { icon: LucideIcon; text: string }[] = [
      { icon: UserRound, text: filerType?.replace("_", " ") ?? "—" },
      ...(showStructureRow
        ? [
            {
              icon: Building2,
              text: businessStructure?.replace("_", " ") ?? "—",
            },
          ]
        : []),
      { icon: FileText, text: `Tax year ${taxYear}` },
      ...(needsIncomeSourceSelection
        ? [
            {
              icon: BadgeDollarSign,
              text: `${incomeSources.length || 0} income source${incomeSources.length === 1 ? "" : "s"}`,
            },
          ]
        : []),
      ...(salaryPercentage
        ? [
            {
              icon: BriefcaseBusiness,
              text:
                salaryPercentage === "over_50"
                  ? "Salary is majority"
                  : "Salary is under 50%",
            },
          ]
        : []),
      ...(readinessCompleted.length > 0
        ? [
            {
              icon: CheckCircle2,
              text: `Readiness: ${readinessCompleted.length}/${readinessOptions.length}`,
            },
          ]
        : []),
      { icon: FileText, text: documentRequirementSummary },
    ];

    return (
      <div className="space-y-6">
        <StepHeading eyebrow="Setup complete" title="Review your answers" />

        <div className="flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm capitalize text-foreground"
            >
              <chip.icon className="h-3.5 w-3.5 text-amanah" />
              {chip.text}
            </span>
          ))}
        </div>

        {needsIncomeSourceSelection && incomeSources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {incomeSources.map((s) => {
              const opt = incomeSourceOptions.find((o) => o.value === s);
              const Icon = opt?.icon ?? FileText;
              return (
                <span
                  key={s}
                  className="inline-flex items-center gap-2 rounded-full border border-amanah/25 bg-amanah/5 px-3 py-1.5 text-sm text-amanah"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt?.label ?? s}
                </span>
              );
            })}
          </div>
        )}

        <div
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${routeToneClass[eligibilityRouteTone]}`}
        >
          <Route className="h-4 w-4" />
          {eligibilityRouteLabel}
        </div>

        {!canSubmit && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Some required answers are still missing — use Back or the steps list
            to complete them before creating your filing.
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Clicking "Create Filing" continues straight into Ledgers,
          Reconciliation, Review, Filing Packet, Approval, and FBR Connect — all
          on this same screen.
        </p>
      </div>
    );
  }

  function renderLedgers() {
    const counts = {
      INCOME: ledgerEntries.filter((entry) => entry.entryType === "INCOME")
        .length,
      EXPENSE: ledgerEntries.filter((entry) => entry.entryType === "EXPENSE")
        .length,
      ASSET: ledgerEntries.filter((entry) => entry.entryType === "ASSET")
        .length,
      LIABILITY: ledgerEntries.filter(
        (entry) => entry.entryType === "LIABILITY",
      ).length,
    };

    return (
      <div className="space-y-6">
        <StepHeading
          title="Your ledgers"
          description="Add or review income, expenses, assets, and liabilities for this filing."
        />

        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard
            label="Income entries"
            value={String(counts.INCOME)}
            accent="amanah"
          />
          <WorkflowKpiCard
            label="Expense entries"
            value={String(counts.EXPENSE)}
          />
          <WorkflowKpiCard
            label="Asset entries"
            value={String(counts.ASSET)}
            accent="mizan"
          />
          <WorkflowKpiCard
            label="Liability entries"
            value={String(counts.LIABILITY)}
          />
        </WorkflowKpiStrip>

        {ledgerError && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {ledgerError}
          </div>
        )}

        <Card className="border-border shadow-none">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Add ledger entry
                </h3>
                <p className="text-xs text-muted-foreground">
                  Entries are saved to this filing draft.
                </p>
              </div>
              {savingLedger && (
                <span className="text-xs text-muted-foreground">Saving...</span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="date"
                value={String(ledgerDraft.date ?? "")}
                onChange={(event) =>
                  setLedgerDraft((previous) => ({
                    ...previous,
                    date: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <select
                value={ledgerDraft.entryType}
                onChange={(event) =>
                  setLedgerDraft((previous) => ({
                    ...previous,
                    entryType: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
              </select>
              <input
                type="text"
                placeholder="Category"
                value={String(ledgerDraft.category ?? "")}
                onChange={(event) =>
                  setLedgerDraft((previous) => ({
                    ...previous,
                    category: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <input
                type="number"
                min="0"
                placeholder="Amount"
                value={String(ledgerDraft.amount ?? "")}
                onChange={(event) =>
                  setLedgerDraft((previous) => ({
                    ...previous,
                    amount: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <input
                type="text"
                placeholder="Description"
                value={String(ledgerDraft.description ?? "")}
                onChange={(event) =>
                  setLedgerDraft((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2 lg:col-span-3"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddLedgerEntry}
                disabled={savingLedger}
                className="h-10 w-full gap-1.5 lg:col-span-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {ledgerEntries.length > 0 ? (
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {ledgerEntries.length} entr
                {ledgerEntries.length === 1 ? "y" : "ies"}
              </p>
              <span className="text-xs text-muted-foreground">
                Source:{" "}
                {ledgerEntries.some((entry) => entry.source === "MANUAL")
                  ? "Manual"
                  : "Imported"}
              </span>
            </div>
            <div className="min-w-0 max-w-full overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledgerEntries.map((entry, index) => (
                    <tr key={entry.id ?? `${entry.description}-${index}`}>
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.date || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {entry.entryType}
                      </td>
                      <td className="px-4 py-3">{entry.category || "—"}</td>
                      <td className="px-4 py-3">{entry.description || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        PKR {Number(entry.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveLedgerEntry(index)}
                          disabled={savingLedger}
                          aria-label="Remove ledger entry"
                          className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            <Scale className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No ledger entries yet
            </p>
            <p className="text-xs text-muted-foreground">
              Add entries above. Document extraction can populate these ledgers
              later.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderReconciliation() {
    const formatWealth = (value: number | undefined) =>
      value === undefined ? "Not available" : `PKR ${value.toLocaleString()}`;
    const gapLabel = reconciliationPreview
      ? `PKR ${Math.abs(reconciliationPreview.gap).toLocaleString()}`
      : "calculated data";

    return (
      <div className="space-y-6">
        <StepHeading
          title="Wealth reconciliation (Mizan)"
          description="There's a gap between your opening and closing wealth statements — let's resolve it before moving on."
        />

        {reconciliationError && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {reconciliationError}
          </div>
        )}

        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard
            label="Opening wealth"
            value={formatWealth(reconciliationPreview?.openingWealth)}
            accent="mizan"
          />
          <WorkflowKpiCard
            label="Closing wealth"
            value={formatWealth(reconciliationPreview?.closingWealth)}
            accent="mizan"
          />
          <WorkflowKpiCard
            label="Unexplained gap"
            value={
              reconciliationPreview
                ? `PKR ${Math.abs(reconciliationPreview.gap).toLocaleString()}`
                : "Not available"
            }
            accent="risk"
          />
          <WorkflowKpiCard
            label="Status"
            value={reconciliationResolved ? "Resolved" : "Needs attention"}
          />
        </WorkflowKpiStrip>

        {reconciliationResolved ? (
          <div className="flex items-start gap-3 rounded-xl border border-amanah/20 bg-amanah/5 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amanah" />
            <div>
              <p className="text-sm font-medium text-amanah">
                {reconciliationResolved.method === "auto"
                  ? "Auto-adjusted"
                  : "Manually resolved"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {reconciliationResolved.method === "auto"
                  ? `Auto-adjustment selected for the calculated ${gapLabel} gap. The final ledger adjustment will be reviewed before filing.`
                  : reconciliationResolved.note}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-[#B8872F]/30 bg-[#B8872F]/10 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#8A641F]" />
              <p className="text-sm text-[#8A641F]">
                {reconciliationPreview
                  ? `Choose how you'd like to resolve the ${gapLabel} gap.`
                  : "Add bank transactions with balances to calculate the Mizan gap."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setReconciliationMethod("auto")}
                className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all ${
                  reconciliationMethod === "auto"
                    ? "border-amanah bg-amanah/5 shadow-sm"
                    : "border-border hover:border-amanah/35"
                }`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                    reconciliationMethod === "auto"
                      ? "border-amanah/25 bg-amanah/10 text-amanah"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Sparkles className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Auto-adjust</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automatically move the unexplained amount into "Other
                    Expenses". Fastest option — good for small gaps.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReconciliationMethod("manual")}
                className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all ${
                  reconciliationMethod === "manual"
                    ? "border-amanah bg-amanah/5 shadow-sm"
                    : "border-border hover:border-amanah/35"
                }`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                    reconciliationMethod === "manual"
                      ? "border-amanah/25 bg-amanah/10 text-amanah"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <PenLine className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">
                    Resolve manually
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Explain the gap yourself — e.g. a gift received, an asset
                    you forgot to declare, or a correction to an entry.
                  </p>
                </div>
              </button>
            </div>

            {reconciliationMethod === "manual" && (
              <div className="grid gap-2">
                <label
                  htmlFor="reconciliationNote"
                  className="text-sm font-medium text-foreground"
                >
                  Explain the gap
                </label>
                <textarea
                  id="reconciliationNote"
                  value={reconciliationNote}
                  onChange={(e) => setReconciliationNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Received PKR 180,000 as a gift from a family member, not yet recorded in the bank ledger."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            {reconciliationMethod && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleConfirmReconciliation}
                  disabled={
                    reconciliationMethod === "manual" &&
                    reconciliationNote.trim().length === 0
                  }
                  className="gap-2"
                >
                  {reconciliationMethod === "auto" ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Confirm{" "}
                  {reconciliationMethod === "auto"
                    ? "Auto-adjustment"
                    : "Resolution"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderPipelineReview() {
    const money = (value: number | null | undefined) =>
      `PKR ${(value ?? 0).toLocaleString()}`;

    return (
      <div className="space-y-6">
        <StepHeading
          title="Review your filing"
          description="Review the totals saved against this filing before generating the packet."
        />

        {filingSummaryError && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {filingSummaryError}
          </div>
        )}

        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard
            label="Income"
            value={money(filingSummary?.income)}
            accent="amanah"
          />
          <WorkflowKpiCard
            label="Expenses"
            value={money(filingSummary?.expenses)}
          />
          <WorkflowKpiCard
            label="Assets"
            value={money(filingSummary?.assets)}
            accent="mizan"
          />
          <WorkflowKpiCard
            label="Liabilities"
            value={money(filingSummary?.liabilities)}
          />
        </WorkflowKpiStrip>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amanah/10 text-amanah">
              <FileText className="h-5 w-5" />
            </div>
            <p className="font-semibold text-foreground">Document extraction</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filingSummary?.documentCount ?? 0} document(s) attached to this
              filing.
            </p>
            <Badge
              variant="outline"
              className="mt-3 border-amanah/25 bg-amanah/10 text-amanah"
            >
              {filingSummary?.pendingDocumentCount ?? 0} pending extraction
            </Badge>
          </div>

          <div className="rounded-xl border border-mizan/30 bg-mizan/5 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-mizan/20 text-mizan-foreground">
              <Scale className="h-5 w-5" />
            </div>
            <p className="font-semibold text-foreground">
              Wealth Reconciliation (Mizan)
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Status: {filingSummary?.reconciliationStatus ?? "UNRESOLVED"}
              {filingSummary?.reconciliationGap !== null &&
              filingSummary?.reconciliationGap !== undefined
                ? ` · Gap ${money(Math.abs(filingSummary.reconciliationGap))}`
                : ""}
            </p>
            <Badge
              variant="outline"
              className={
                filingSummary?.reconciliationStatus === "RESOLVED"
                  ? "mt-3 border-amanah/25 bg-amanah/10 text-amanah"
                  : "mt-3 border-[#B8872F]/35 bg-[#B8872F]/10 text-[#8A641F]"
              }
            >
              {filingSummary?.reconciliationStatus === "RESOLVED"
                ? "Resolved"
                : "Needs attention"}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  function renderApproval() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="Approve your filing"
          description="Review your filing summary and provide final approval before proceeding to your filing packet."
        />
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <ApprovalPacket
            draftId={draftId || undefined}
            onCancel={() => {}} // No-op, inline wizard component
            onApprovalChange={handleApprovalChange}
            showGenerateButton={false} // Hide generate button in the wizard step
            initialApproved={approvalConfirmed}
            packetVersion={filingPacket?.version ?? 1}
          />
        </div>
      </div>
    );
  }

  function renderFilingPacket() {
    const money = (value: number | null | undefined) =>
      `PKR ${(value ?? 0).toLocaleString()}`;

    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <StepHeading
            title="Your filing packet"
            description="Generate an immutable snapshot of your current filing data before approval."
          />
          <Button
            type="button"
            onClick={handleGeneratePacket}
            disabled={generatingPacket || !draftId}
            className="shrink-0 gap-2 bg-[#376952] text-white hover:bg-[#2e5a44]"
          >
            {generatingPacket ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {generatingPacket
              ? "Generating..."
              : filingPacket
                ? "Generate New Version"
                : "Generate Packet Snapshot"}
          </Button>
        </div>

        {packetError && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {packetError}
          </div>
        )}

        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard
            label="Packet version"
            value={filingPacket ? `v${filingPacket.version}` : "Not generated"}
          />
          <WorkflowKpiCard
            label="Packet hash"
            value={
              filingPacket ? `${filingPacket.packetHash.slice(0, 12)}…` : "—"
            }
            sub="SHA-256 snapshot fingerprint"
          />
          <WorkflowKpiCard
            label="Tax payable"
            value={money(filingPacket?.taxPayable)}
            accent="amanah"
          />
          <WorkflowKpiCard
            label="Refund due"
            value={money(filingPacket?.refundDue)}
            accent="amanah"
          />
          <WorkflowKpiCard
            label="Reconciliation gap"
            value={money(filingSummary?.reconciliationGap)}
            accent="mizan"
          />
        </WorkflowKpiStrip>

        {filingPacket && (
          <div className="rounded-xl border border-amanah/20 bg-amanah/5 p-4 text-sm text-amanah">
            Packet snapshot {`v${filingPacket.version}`} generated successfully.
            Approval can now be reviewed against this exact version.
          </div>
        )}
      </div>
    );
  }

  function renderFbrConnect() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="File with FBR"
          description="Confirm payment, then launch the supervised FBR Connect agent."
        />

        <div className="rounded-xl border border-amanah/20 bg-amanah/5 p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amanah/10 text-amanah">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="font-semibold text-foreground">
            FBR Connect — supervised filing
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your local Trusted Desktop Agent connects to Iris on your own
            machine. You'll personally enter any OTP, CAPTCHA, or PIN.
          </p>
          <Button asChild className="mt-4 gap-2">
            <a
              href={
                draftId
                  ? `/tax/fbr-connect?draftId=${draftId}`
                  : "/tax/fbr-connect"
              }
            >
              Launch FBR Connect <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const stepRenderers: Record<StepKey, () => JSX.Element> = {
    who: renderWho,
    structure: renderStructure,
    income: renderIncome,
    salary_split: renderSalarySplit,
    tax_year: renderTaxYear,
    readiness: renderReadiness,
    documents: renderDocuments,
    review: renderReview,
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isSetupReviewStep) handleCreateFiling();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TaxRocketLogo showWordmark={false} />
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {draftId ? "Your filing" : "New tax filing"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isPipelinePhase
                ? "Ledgers → Reconciliation → Review → Filing Packet → Approval → FBR Connect"
                : "One simple question at a time."}
            </p>
          </div>
        </div>

        {!draftId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            {savingDraft ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SaveIcon className="h-3.5 w-3.5" />
            )}
            {draftSavedAt ? "Draft saved" : "Save draft"}
          </Button>
        )}
      </div>

      {/* ── Three-column layout: steps list (left) — content (center) — summary (right) ──
          Persists across the ENTIRE journey — setup questions AND the
          pipeline phase — so nothing here ever remounts or navigates. */}

      <div className="mt-6 grid min-w-0 items-start gap-6 lg:grid-cols-[220px_1fr_280px]">
        {filerType ? (
          <aside className="lg:sticky lg:top-20 lg:z-10 lg:self-start">
            {/* Mobile/tablet: a single compact "Step X of Y" row with a
                progress bar and an optional expand toggle, instead of
                dumping the entire journey list above the actual
                question. Desktop keeps the always-visible full rail. */}
            <div className="lg:hidden">
              <WizardStepsRailCompact
                items={railItems}
                onItemClick={(index) => setStep(index)}
              />
            </div>
            <Card className="hidden p-2 shadow-sm lg:block">
              <WizardStepsRail
                items={railItems}
                onItemClick={(index) => setStep(index)}
              />
            </Card>
          </aside>
        ) : (
          <div className="hidden lg:block" />
        )}

        <Card className="min-w-0 shadow-sm lg:self-start">
          <CardContent className="p-6 sm:p-8">
            <div
              key={currentStepKey}
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              {stepRenderers[currentStepKey]()}
            </div>

            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={goBack}
                disabled={step === 0}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-3">
                {isSetupReviewStep ? (
                  <Button
                    type="submit"
                    disabled={submitting || !canSubmit}
                    className="gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Create Filing
                  </Button>
                ) : !isLastStep ? (
                  <Button
                    type="button"
                    onClick={goNext}
                    className="gap-2"
                    disabled={!canGoNext}
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <aside className="min-w-0 lg:sticky lg:top-20 lg:z-10 lg:self-start">
          <WizardSummaryPanel rows={summaryRows} />
          <WizardActionCard blockers={currentBlockers} />
        </aside>
      </div>
    </form>
  );
}

// ─── Small presentational helpers local to this file ────────────────

function InfoBanner({
  tone,
  children,
}: {
  tone: "amanah" | "mizan";
  children: React.ReactNode;
}) {
  const cls =
    tone === "amanah"
      ? "border-amanah/20 bg-amanah/5 text-amanah"
      : "border-[#B8872F]/30 bg-[#B8872F]/10 text-[#8A641F]";
  return (
    <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>
  );
}
