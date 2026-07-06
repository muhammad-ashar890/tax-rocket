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
  ScrollText,
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
  type StepsRailItem,
} from "@/components/tax/wizard-ui";

import {
  createDraft,
  getDraft,
  updateDraft,
  type ReconciliationMethod,
} from "@/lib/demo-store";

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

const DEMO_RECONCILIATION_GAP = 184500;

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
  const uploadFileInputsRef = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );

  function triggerDocumentUpload(documentType: string) {
    uploadFileInputsRef.current[documentType]?.click();
  }

  function handleDocumentFileSelected(
    documentType: string,
    fileList: FileList | null,
  ) {
    const file = fileList?.[0];
    if (!file) return;
    setUploadedDocuments((prev) => ({ ...prev, [documentType]: file.name }));
  }

  // ── Pipeline-phase state (Ledgers → Reconciliation → Review → Filing Packet → Approval → FBR Connect) ──
  const [reconciliationMethod, setReconciliationMethod] =
    useState<ReconciliationMethod | null>(null);
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [reconciliationResolved, setReconciliationResolved] = useState<{
    method: ReconciliationMethod;
    note?: string;
  } | null>(null);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);

  // ── Resume an existing demo draft straight into the pipeline phase ──
  useEffect(() => {
    if (!resumeDraftId) return;
    const existing = getDraft(resumeDraftId);
    if (!existing) return;
    setDraftId(existing.id);
    setFilerType((existing.filerType as "myself" | "my_business") ?? "myself");
    setBusinessStructure(existing.businessStructure);
    setIncomeSources(existing.incomeSources as TaxIncomeSource[]);
    setTaxYear(existing.taxYear);
    setReadinessCompleted(
      (existing.readinessCompleted as TaxReadinessItem[]) ?? [],
    );
    if (existing.reconciliation) {
      setReconciliationResolved({
        method: existing.reconciliation.method,
        note: existing.reconciliation.note,
      });
    }
    setApprovalConfirmed(existing.approved);
    // Jump straight to wherever the draft's coarse status implies.
    setStep(
      (existing.wizardStepIndex && existing.wizardStepIndex > 0
        ? existing.wizardStepIndex
        : 0) || 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeDraftId]);

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

  // Bug fix: resuming a draft (e.g. dashboard's "Continue Filing") always
  // landed back on step 1 ("Who is filing?") instead of wherever the user
  // actually left off, even though the correct wizardStepIndex was being
  // saved. Root cause was a race between two effects on the very first
  // render after navigating to `?draftId=...`:
  //   1. The resume effect above calls `setStep(existing.wizardStepIndex)`
  //      (e.g. 6, landing on "ledgers").
  //   2. On that same first render, `draftId` is still null (state hasn't
  //      committed yet), so `combinedSteps totalSteps` are computed as
  //      if there were no pipeline steps at all (`totalSteps === 1`).
  //   3. The clamp effect below then runs with that stale `totalSteps`
  //      and forces `setStep(0)`, silently overwriting the correct resume
  //      value the moment after it was set.
  // `resumePendingRef` tracks "a resume is in flight but draftId hasn't
  // been committed to state yet" so the clamp effect can skip clamping
  // during that narrow window instead of racing against it.
  const resumePendingRef = useRef(Boolean(resumeDraftId));
  useEffect(() => {
    if (resumePendingRef.current) {
      resumePendingRef.current = false;
      return;
    }
    setStep((s) => Math.min(s, totalSteps - 1));
  }, [totalSteps]);

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
    const rows: { label: string; value: string }[] = [];

    if (filerType)
      rows.push({ label: "Filer", value: filerType.replace("_", " ") });
    if (showStructureRow)
      rows.push({
        label: "Structure",
        value: (businessStructure ?? "").replace("_", " "),
      });
    rows.push({ label: "Tax year", value: String(taxYear) });

    if (needsIncomeSourceSelection && incomeSources.length > 0) {
      const labels = incomeSources
        .map((s) => incomeSourceOptions.find((o) => o.value === s)?.label ?? s)
        .join(", ");
      rows.push({
        label: `Income sources (${incomeSources.length})`,
        value: labels,
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
      const uploadedCount = documentSlots.filter((slot) =>
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
            ? "Auto-adjusted"
            : "Manually resolved",
      });
    }

    if (approvalConfirmed) {
      rows.push({ label: "Approval", value: "Confirmed" });
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
    draftId,
    reconciliationResolved,
    approvalConfirmed,
  ]);

  // ── Navigation ────────────────────────────────────────────────────

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function goNext() {
    if (navigationLockedRef.current) return;
    if (!canGoNext) return;
    const nextIndex = Math.min(totalSteps - 1, step + 1);
    setStep(nextIndex);
    if (draftId) updateDraft(draftId, { wizardStepIndex: nextIndex });
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
      await createAction(buildFormData());
      const draft = createDraft({
        taxYear,
        taxpayerName: "TX Dev",
        filerType: filerType ?? "myself",
        businessStructure,
        incomeSources,
        readinessCompleted,
      });
      setDraftId(draft.id);
      const ledgersStepIndex = setupSteps.length;
      setStep(ledgersStepIndex); // land on "ledgers", the first pipeline step
      // Bug fix: the draft record was created with the default
      // wizardStepIndex (0) and never updated to reflect that the user
      // actually landed on "ledgers" — so re-opening this filing later
      // from the dashboard's "Continue Filing" button always restarted
      // at step 1 ("Who is filing?") instead of resuming where the user
      // left off. Persist the real position immediately.
      updateDraft(draft.id, { wizardStepIndex: ledgersStepIndex });
    } finally {
      setSubmitting(false);
    }
  }

  function handleConfirmReconciliation() {
    if (!reconciliationMethod) return;
    if (
      reconciliationMethod === "manual" &&
      reconciliationNote.trim().length === 0
    )
      return;
    const resolved = {
      method: reconciliationMethod,
      note:
        reconciliationMethod === "manual"
          ? reconciliationNote.trim()
          : undefined,
    };
    setReconciliationResolved(resolved);
    if (draftId)
      updateDraft(draftId, {
        reconciliation: { ...resolved, resolvedAt: Date.now() },
      });
  }

  function handleConfirmApproval() {
    setApprovalConfirmed(true);
    if (draftId)
      updateDraft(draftId, { approved: true, status: "approved_for_filing" });
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
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadedFileName ? "Replace" : "Upload"}
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
    return (
      <div className="space-y-6">
        <StepHeading
          title="Your ledgers"
          description="Income, expenses, assets, and liabilities — organized from your uploaded documents."
        />
        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard label="Income entries" value="0" accent="amanah" />
          <WorkflowKpiCard label="Expense entries" value="0" />
          <WorkflowKpiCard label="Asset entries" value="0" accent="mizan" />
          <WorkflowKpiCard label="Liability entries" value="0" />
        </WorkflowKpiStrip>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Scale className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Ledger tables go here
          </p>
          <p className="text-xs text-muted-foreground">
            (Demo placeholder — wire in real ledger data-layer calls here)
          </p>
        </div>
      </div>
    );
  }

  function renderReconciliation() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="Wealth reconciliation (Mizan)"
          description="There's a gap between your opening and closing wealth statements — let's resolve it before moving on."
        />
        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard
            label="Opening wealth"
            value="PKR 12,450,000"
            accent="mizan"
          />
          <WorkflowKpiCard
            label="Closing wealth"
            value="PKR 12,634,500"
            accent="mizan"
          />
          <WorkflowKpiCard
            label="Unexplained gap"
            value={`PKR ${DEMO_RECONCILIATION_GAP.toLocaleString()}`}
            accent="risk"
          />
          <WorkflowKpiCard
            label="Status"
            value={reconciliationResolved ? "Balanced" : "Needs attention"}
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
                  ? `The unexplained PKR ${DEMO_RECONCILIATION_GAP.toLocaleString()} was moved into Other Expenses automatically.`
                  : reconciliationResolved.note}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-[#B8872F]/30 bg-[#B8872F]/10 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#8A641F]" />
              <p className="text-sm text-[#8A641F]">
                Choose how you'd like to resolve the PKR{" "}
                {DEMO_RECONCILIATION_GAP.toLocaleString()} gap.
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
    return (
      <div className="space-y-6">
        <StepHeading
          title="Review your filing"
          description="Check what our AI found and make sure your wealth reconciliation (Mizan) balances."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amanah/10 text-amanah">
              <FileText className="h-5 w-5" />
            </div>
            <p className="font-semibold text-foreground">Document extraction</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review fields extracted from uploaded documents.
            </p>
            <Badge
              variant="outline"
              className="mt-3 border-amanah/25 bg-amanah/10 text-amanah"
            >
              0 fields need review
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
              {reconciliationResolved
                ? reconciliationResolved.method === "auto"
                  ? "Resolved automatically — unexplained gap adjusted into Other Expenses."
                  : "Resolved manually — you provided an explanation for the gap."
                : "Not resolved yet."}
            </p>
            <Badge
              variant="outline"
              className={
                reconciliationResolved
                  ? "mt-3 border-amanah/25 bg-amanah/10 text-amanah"
                  : "mt-3 border-[#B8872F]/35 bg-[#B8872F]/10 text-[#8A641F]"
              }
            >
              {reconciliationResolved ? "Balanced" : "Needs attention"}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  function renderFilingPacket() {
    // Each figure gets its own card — a combined "PKR 0 / PKR 0" style
    // value was the thing overflowing its card once real, longer
    // amounts (or the packet hash) were shown; splitting "Tax payable"
    // and "Refund due" into separate cards keeps every value short
    // enough to always fit, no matter how large the real numbers get.
    return (
      <div className="space-y-6">
        <StepHeading
          title="Your filing packet"
          description="A frozen, versioned snapshot of your filing — this is what gets approved and filed."
        />
        <WorkflowKpiStrip maxColumns={2}>
          <WorkflowKpiCard label="Packet version" value="v1" />
          <WorkflowKpiCard
            label="Packet hash"
            value="a1b2c3d4e5f6…"
            sub="Cryptographic fingerprint"
          />
          <WorkflowKpiCard label="Tax payable" value="PKR 0" accent="amanah" />
          <WorkflowKpiCard label="Refund due" value="PKR 0" accent="amanah" />
          <WorkflowKpiCard
            label="Reconciliation gap"
            value="PKR 0"
            accent="mizan"
          />
        </WorkflowKpiStrip>
      </div>
    );
  }

  function renderApproval() {
    return (
      <div className="space-y-6">
        <StepHeading
          title="Approve your filing packet"
          description="This is the final checkpoint before filing."
        />
        {approvalConfirmed ? (
          <div className="flex items-start gap-3 rounded-xl border border-amanah/20 bg-amanah/5 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amanah" />
            <p className="text-sm font-medium text-amanah">
              Packet approved. You're ready to file with FBR.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">
              I confirm the tax payable/refund, wealth reconciliation, and risk
              posture shown in this packet are understood and correct.
            </p>
            <Button
              type="button"
              onClick={handleConfirmApproval}
              className="mt-4 gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Approve &amp; Continue
            </Button>
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

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[220px_1fr_280px]">
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

        <Card className="shadow-sm lg:self-start">
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
        <aside className="lg:sticky lg:top-20 lg:z-10 lg:self-start">
          <WizardSummaryPanel rows={summaryRows} />
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
