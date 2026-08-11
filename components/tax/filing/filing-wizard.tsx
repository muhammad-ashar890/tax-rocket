"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  confirmFilingForPacketAction,
  getFilingDraftAction,
  invalidateFilingPipelineAction,
  updateFilingDraftAction,
  updateFilingStepAction,
} from "@/app/actions/filing";
import { uploadFilingDocumentAction } from "@/app/actions/documents";
import {
  approveAndMapExtractedDocumentAction,
  extractDocumentWithGeminiAction,
  getDocumentExtractionAction,
  getFilingDocumentsAction,
  updateDocumentExtractionAction,
} from "@/app/actions/extraction";
import { getFilingSummaryAction } from "@/app/actions/filing-summary";
import { getBankTransactionsAction } from "@/app/actions/bank-transactions";
import { getBankStatementAction } from "@/app/actions/bank-statements";
import { saveBankAccountsAction } from "@/app/actions/bank-accounts";
import { getUserProfile } from "@/app/actions/user";

import { getRequiredTaxDocumentTypesForCurrentFlow } from "@/lib/tax/document-requirements";

import {
  computeDocumentSlots,
  incomeSourceOptions,
  readinessOptions,
  stepLabels,
  type FilingActionResult,
  type FilingPacketSummary,
  type FilingSummary,
  type FilingWizardProps,
  type PipelineStepKey,
  type ReconciliationMethod,
  type StepKey,
} from "@/components/tax/filing/config/filing-wizard-config";

import type {
  TaxIncomeSource,
  TaxReadinessItem,
} from "@/lib/tax/filing-drafts";

import { evaluateSimplifiedReturnEligibility } from "@/lib/tax/simplified-eligibility";

import type { TaxDraftMetadata } from "@/lib/tax/draft-metadata";
import type { DraftBankAccount } from "@/components/tax/filing/config/bank-account-types";

import type { StepsRailItem } from "@/components/tax/wizard-ui";
import { WizardHeader } from "@/components/tax/filing/wizard-header";
import { WizardNavigation } from "@/components/tax/filing/wizard-navigation";
import { WizardShellLayout } from "@/components/tax/filing/wizard-shell-layout";
import {
  WizardSetupStep,
  type SetupStepKey,
} from "@/components/tax/filing/wizard-setup-step";
import {
  WizardDocumentsStep,
  type ExtractedPayload,
  type ExtractedTransaction,
} from "@/components/tax/filing/wizard-documents-step";
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
import { useFilingDocuments } from "@/components/tax/filing/hooks/use-filing-documents";
import { useFilingLedger } from "@/components/tax/filing/hooks/use-filing-ledger";
import { useFilingReconciliation } from "@/components/tax/filing/hooks/use-filing-reconciliation";
import { useFilingFinalization } from "@/components/tax/filing/hooks/use-filing-finalization";

// The wizard remains the orchestration layer. Domain types, option lists,
// and step metadata live in filing-wizard-config.ts so they can be reused
// without moving any server actions or changing the filing behavior.

const currentTaxYear = new Date().getFullYear();

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
  const [filingActionError, setFilingActionError] = useState<string | null>(
    null,
  );
  const filingActionErrorRef = useRef<HTMLDivElement | null>(null);
  const resumeHydratedRef = useRef(!resumeDraftId);

  useEffect(() => {
    if (!filingActionError) return;
    filingActionErrorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [filingActionError]);

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
  const [bankAccounts, setBankAccounts] = useState<DraftBankAccount[]>([
    {
      clientId: "bank-account-1",
      bankName: "",
      accountLabel: "Account 1",
      accountNumberMasked: "",
      currency: "PKR",
    },
  ]);
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

  useEffect(() => {
    if (resumeDraftId) return;

    let isMounted = true;
    getUserProfile().then((result) => {
      if (!isMounted || !result.success || !result.user) return;
      const configuredTaxYear = Number(result.user.taxYear);
      if (Number.isInteger(configuredTaxYear) && configuredTaxYear >= 2000) {
        setTaxYear(configuredTaxYear);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [resumeDraftId]);

  const [readinessCompleted, setReadinessCompleted] = useState<
    TaxReadinessItem[]
  >([
    "cnic_ntn_ready",
    "iris_credentials_ready",
    "mobile_email_ready",
    "core_documents_ready",
  ]);

  // ── Pipeline-phase state (Ledgers → Reconciliation → Review → Filing Packet → Approval → FBR Connect) ──
  const [bankIntelligenceClassified, setBankIntelligenceClassified] =
    useState(false);
  const [bankTransactionsReviewed, setBankTransactionsReviewed] =
    useState(false);
  const [bankStatementSaved, setBankStatementSaved] = useState(false);

  const [filingSummary, setFilingSummary] = useState<FilingSummary | null>(
    null,
  );
  const [filingSummaryError, setFilingSummaryError] = useState<string | null>(
    null,
  );
  const {
    uploadedDocuments,
    documentRecords,
    extractedByDocumentId,
    extractingDocumentId,
    reviewingDocumentId,
    savingDocumentReviewId,
    mappingDocumentId,
    selectedDocumentFiles,
    uploadingDocumentType,
    documentUploadError,
    uploadFileInputsRef,
    setUploadedDocuments,
    setDocumentRecords,
    setSelectedDocumentFiles,
    setUploadingDocumentType,
    setDocumentUploadError,
    triggerDocumentUpload,
    handleDocumentFileSelected,
    handleExtractDocument,
    handleReviewDocument,
    handleExtractedFieldChange,
    handleExtractedTransactionChange,
    handleSaveDocumentReview,
    handleMapDocument,
  } = useFilingDocuments({
    draftId,
    step,
    resetDownstreamSteps,
    setFilingSummary,
  });

  // ── Resume an existing Prisma-backed filing draft ──
  useEffect(() => {
    if (!resumeDraftId) return;

    // Fetch the draft details dynamically from backend Action
    let isMounted = true;
    getFilingDraftAction(resumeDraftId).then((result) => {
      if (!isMounted) return;
      if (!result.success || !result.draft) return;

      const existing = result.draft;
      resumeHydratedRef.current = true;

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
      setApprovalConfirmed(
        existing.packetApprovalConfirmed === true ||
          existing.status === "APPROVED_FOR_FILING",
      );

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
    if (!draftId) return;

    let isMounted = true;
    getBankTransactionsAction(draftId).then((result) => {
      if (!isMounted || !result.success) return;
      const rows = result.rows;
      const finalStatuses = new Set([
        "APPROVED",
        "REJECTED",
        "TRANSFER",
        "CASH_MOVEMENT",
      ]);
      setBankIntelligenceClassified(
        rows.length === 0 ||
          rows.some((row) => row.classificationStatus !== "UNREVIEWED"),
      );
      setBankTransactionsReviewed(
        rows.every((row) => finalStatuses.has(row.classificationStatus)),
      );
    });

    return () => {
      isMounted = false;
    };
  }, [draftId]);

  function resetDownstreamSteps(
    resetStep: number,
    preserveReconciliation = false,
  ) {
    setFilingPacket(null);
    setApprovalConfirmed(false);

    // Only invalidate bank review state when a change occurs at or before
    // the Bank Intelligence step. Confirming reconciliation is downstream
    // and must not make already-reviewed bank rows pending again.
    const bankStepIndex = combinedSteps.indexOf("bank_intelligence");
    if (resetStep <= bankStepIndex) {
      setBankIntelligenceClassified(false);
      setBankTransactionsReviewed(false);
    }

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
  const requiresBankAccounts = requiredDocumentTypes.includes("bank_statement");
  const missingRequiredDocumentCount = requiredDocumentTypes.filter(
    (documentType) => !uploadedDocuments[documentType],
  ).length;

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
    if (!onAutoSave || !resumeHydratedRef.current) return;
    const handle = setTimeout(() => {
      onAutoSave(buildFormData());
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildFormData, onAutoSave]);

  const handleSaveDraft = useCallback(async () => {
    if (!onSaveDraft) {
      setFilingActionError("Save draft is not available right now");
      return;
    }

    setSavingDraft(true);
    setFilingActionError(null);

    try {
      const snapshot = buildFormData();
      snapshot.set("currentStep", String(step));
      const result = await onSaveDraft(snapshot);

      if (result && !result.success) {
        setFilingActionError(result.error ?? "Failed to save filing draft");
        return;
      }

      if (result && result.draftId) {
        setDraftId(result.draftId);
      }

      setDraftSavedAt(Date.now());
    } catch (error) {
      console.error("Error saving filing draft:", error);
      setFilingActionError("Failed to save filing draft");
    } finally {
      setSavingDraft(false);
    }
  }, [buildFormData, onSaveDraft, step]);

  // ── Setup-phase step list (unchanged branching logic) ────────────────
  const showsSalarySplit =
    incomeSources.includes("salary") && incomeSources.length >= 2;

  const setupSteps: SetupStepKey[] = useMemo(() => {
    if (!filerType) return ["who"];

    if (filerType === "my_business" && !businessStructure)
      return ["who", "structure"];

    const tail: SetupStepKey[] = ["tax_year", "readiness"];

    if (isMyself) {
      return [
        "who",
        "income",
        ...(requiresBankAccounts ? (["bank_accounts"] as SetupStepKey[]) : []),
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
        ...(requiresBankAccounts ? (["bank_accounts"] as SetupStepKey[]) : []),
        ...(showsSalarySplit ? (["salary_split"] as SetupStepKey[]) : []),
        ...tail,
        "review",
      ];
    }

    if (isBusinessEntity || isPractitioner) {
      return [
        "who",
        "structure",
        ...(requiresBankAccounts ? (["bank_accounts"] as SetupStepKey[]) : []),
        ...tail,
        "review",
      ];
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
    requiresBankAccounts,
  ]);

  // Pipeline steps only exist in the rail once a filing has actually been
  // created — appearing here is a direct result of the "Create Filing"
  // click, never automatic.
  const pipelineSteps: PipelineStepKey[] = [
    "documents",
    "bank_intelligence",
    "ledgers",
    "reconciliation",
    "pipeline_review",
    "approval",
    "filing_packet",
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

  const {
    ledgerEntries,
    ledgerDraft,
    savingLedger,
    ledgerError,
    setLedgerDraft,
    refreshLedger,
    handleAddLedgerEntry,
    handleRemoveLedgerEntry,
  } = useFilingLedger({
    draftId,
    currentStepKey,
    combinedSteps,
    resetDownstreamSteps,
  });

  const {
    reconciliationMethod,
    reconciliationNote,
    reconciliationResolved,
    reconciliationError,
    reconciliationPreview,
    setReconciliationMethod,
    setReconciliationNote,
    setReconciliationResolved,
    setReconciliationPreview,
    handleConfirmReconciliation,
  } = useFilingReconciliation({
    draftId,
    step,
    ledgerEntryCount: ledgerEntries.length,
    setSavingDraft,
    resetDownstreamSteps,
    refreshLedger,
  });

  const {
    approvalConfirmed,
    setTaxCalculatedInSession,
    taxCalculatedInSession,
    calculatingTax,
    taxCalculationError,
    filingPacket,
    generatingPacket,
    generatingPdf,
    packetError,
    setApprovalConfirmed,
    setFilingPacket,
    handleApprovalChange,
    handleGeneratePacket,
    handleGeneratePacketPdf,
    handleCalculateTax,
  } = useFilingFinalization({
    draftId,
    step,
    currentStepKey,
    setSavingDraft,
    setFilingActionError,
    setFilingSummary,
  });

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
    Object.keys(documentRecords).length,
    reconciliationResolved,
    approvalConfirmed,
  ]);

  useEffect(() => {
    if (currentStepKey !== "pipeline_review") {
      setTaxCalculatedInSession(false);
    }
  }, [currentStepKey]);

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
    if (currentStepKey === "bank_accounts") {
      return (
        bankAccounts.length > 0 &&
        bankAccounts.every(
          (account) =>
            account.bankName.trim().length > 0 &&
            account.accountLabel.trim().length > 0 &&
            /^\\d{4}$/.test(account.accountNumberMasked),
        )
      );
    }
    // Keep Continue clickable on review-gated pipeline steps so the user
    // receives a clear error explaining what remains instead of a disabled
    // button with no feedback.
    if (
      currentStepKey === "documents" ||
      currentStepKey === "bank_intelligence"
    ) {
      return true;
    }
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
    bankAccounts,
    bankIntelligenceClassified,
    reconciliationResolved,
    reconciliationPreview,
    filingPacket,
    approvalConfirmed,
  ]);

  const approvalBlockers = useMemo(() => {
    const blockers: string[] = [];
    const uploadedRecords = Object.values(documentRecords);

    const requiredRecords = requiredDocumentTypes
      .map((documentType) => documentRecords[documentType])
      .filter(Boolean);

    if (requiredRecords.length < requiredDocumentTypes.length) {
      blockers.push("Required document statuses are still loading");
    }

    if (
      requiredRecords.some(
        (document) =>
          !["COMPLETED", "MAPPED"].includes(document.extractionStatus),
      )
    ) {
      blockers.push("Review all uploaded document extractions");
    }

    if (!bankTransactionsReviewed) {
      blockers.push("Classify and review all bank transactions");
    }

    if (!filingSummary || filingSummary.taxCalculationStatus !== "ESTIMATE") {
      blockers.push("Complete a supported tax calculation");
    }

    if (!reconciliationResolved) {
      blockers.push("Resolve wealth reconciliation before approval");
    } else if (Math.abs(filingSummary?.reconciliationGap ?? 0) > 0.01) {
      blockers.push("Resolve the remaining Mizan gap before approval");
    }

    return blockers;
  }, [
    documentRecords,
    requiredDocumentTypes,
    filingSummary,
    bankTransactionsReviewed,
    reconciliationResolved,
  ]);

  const approvalReady = approvalBlockers.length === 0;

  // Whether EVERY required setup field is filled — gates the "Create
  // Filing" submit button. Deliberately independent of step-index math
  // (this is the bug fix from the previous revision, preserved).
  const canSubmit = useMemo(() => {
    if (!filerType) return false;
    if (filerType === "my_business" && !businessStructure) return false;
    if (needsIncomeSourceSelection && incomeSources.length === 0) return false;
    if (showsSalarySplit && !salaryPercentage) return false;
    if (!taxYear) return false;
    if (
      requiresBankAccounts &&
      (bankAccounts.length === 0 ||
        bankAccounts.some(
          (account) =>
            !account.bankName.trim() ||
            !account.accountLabel.trim() ||
            !/^\\d{4}$/.test(account.accountNumberMasked),
        ))
    ) {
      return false;
    }
    return true;
  }, [
    filerType,
    businessStructure,
    needsIncomeSourceSelection,
    incomeSources.length,
    showsSalarySplit,
    salaryPercentage,
    taxYear,
    requiresBankAccounts,
    bankAccounts,
    readinessCompleted.length,
  ]);

  const hasResolvedRequiredDocumentCount =
    Boolean(filerType) &&
    needsIncomeSourceSelection &&
    incomeSources.length > 0;

  const documentRequirementSummary = !filerType
    ? "Pending choice"
    : hasResolvedRequiredDocumentCount
      ? `${requiredDocumentTypes.length} required documents`
      : needsIncomeSourceSelection
        ? "Choose income sources"
        : "Finalized after setup";

  const requiredDocumentLabels = requiredDocumentTypes.map(
    (documentType) =>
      documentSlots.find((slot) => slot.documentType === documentType)?.label ??
      documentType.replaceAll("_", " "),
  );

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
    [combinedSteps, step, furthestStepReached, readinessCompleted.length],
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
            ? reconciliationResolved.note?.startsWith(
                "No Other reconciliation adjustment",
              )
              ? "Resolved"
              : "Resolved · Auto-adjust"
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
      if (
        requiresBankAccounts &&
        (bankAccounts.length === 0 ||
          bankAccounts.some(
            (account) =>
              !account.bankName.trim() ||
              !account.accountLabel.trim() ||
              !/^\\d{4}$/.test(account.accountNumberMasked),
          ))
      ) {
        b.push("Add each bank account and enter its last 4 digits");
      }

      const missingReadiness =
        readinessOptions.length - readinessCompleted.length;
      if (missingReadiness > 0)
        b.push(`Complete ${missingReadiness} readiness check(s)`);
    } else {
      // Only show relevant blockers per step — avoid confusing user with future steps
      if (currentStepKey === "bank_intelligence") {
        if (!bankStatementSaved) {
          b.push("Save statement balances before continuing");
        } else if (!bankIntelligenceClassified) {
          b.push("Click Classify to generate suggestions");
        } else if (!bankTransactionsReviewed) {
          b.push(
            "Review all bank transactions — approve, transfer, or exclude each row",
          );
        }
      }

      if (
        (currentStepKey === "reconciliation" ||
          currentStepKey === "pipeline_review" ||
          currentStepKey === "approval" ||
          currentStepKey === "filing_packet" ||
          currentStepKey === "fbr_connect") &&
        !reconciliationResolved
      ) {
        b.push("Resolve wealth reconciliation gap");
      }
      // Approval blocker only in approval & later steps — not in documents/bank/ledgers
      if (
        !approvalConfirmed &&
        (currentStepKey === "approval" ||
          currentStepKey === "filing_packet" ||
          currentStepKey === "fbr_connect")
      ) {
        b.push("Provide final approval for filing");
      }

      if (currentStepKey === "filing_packet" && !filingPacket) {
        b.push("Generate the latest filing packet before continuing");
      }

      const isFinalReviewPhase =
        currentStepKey === "filing_packet" ||
        currentStepKey === "approval" ||
        currentStepKey === "fbr_connect";

      if (isFinalReviewPhase && missingRequiredDocumentCount > 0) {
        b.push(
          `${missingRequiredDocumentCount} required document(s) still missing`,
        );
      }

      if (
        isFinalReviewPhase &&
        filingSummary &&
        filingSummary.taxCalculationStatus !== "ESTIMATE"
      ) {
        b.push("Tax calculation is pending route-specific rules");
      }

      if (
        isFinalReviewPhase &&
        reconciliationResolved?.method === "manual" &&
        Math.abs(filingSummary?.reconciliationGap ?? 0) > 0.01
      ) {
        b.push("Manual reconciliation gap remains unresolved");
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
    requiresBankAccounts,
    bankAccounts,
    readinessCompleted.length,
    documentSlots,
    uploadedDocuments,
    reconciliationResolved,
    approvalConfirmed,
    currentStepKey,
    bankStatementSaved,
    filingPacket,
  ]);

  // ── Navigation ────────────────────────────────────────────────────

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function goNext() {
    if (navigationLockedRef.current) return;

    if (currentStepKey === "documents") {
      // Required documents must be reviewed before leaving this step. Bank
      // statements and salary certificates additionally require Save &
      // Approve Map because their data feeds downstream ledgers.
      if (draftId) {
        const documentResult = await getFilingDocumentsAction(draftId);
        const documents = documentResult.success
          ? documentResult.documents
          : [];
        const latestByType = new Map<string, (typeof documents)[number]>(
          documents.map((document) => [document.documentType, document]),
        );
        const notReady = requiredDocumentTypes.filter((documentType) => {
          const document = latestByType.get(documentType);
          if (!document) return true;
          if (!["COMPLETED", "MAPPED"].includes(document.extractionStatus)) {
            return true;
          }
          return (
            ["bank_statement", "salary_certificate"].includes(documentType) &&
            document.extractionStatus !== "MAPPED"
          );
        });

        if (notReady.length > 0) {
          setFilingActionError(
            "Review and approve/map all required documents before continuing.",
          );
          return;
        }
      }
      setFilingActionError(null);
    }

    if (currentStepKey === "filing_packet" && !filingPacket) {
      setFilingActionError(
        "Generate the latest filing packet before continuing.",
      );
      return;
    }

    if (currentStepKey === "pipeline_review" && !taxCalculatedInSession) {
      setFilingActionError(
        "Calculate the tax estimate before continuing to approval.",
      );
      return;
    }

    if (currentStepKey === "bank_intelligence") {
      // Validate against the persisted database record as well as local UI
      // state. This prevents a stale/resumed wizard from moving to Mizan
      // with only extracted form values and no saved BankStatement row.
      if (draftId) {
        const persistedStatement = await getBankStatementAction(draftId);
        if (!persistedStatement.success || !persistedStatement.statement) {
          setFilingActionError("Save statement balances before continuing.");
          return;
        }
      }

      if (!bankStatementSaved) {
        setFilingActionError("Save statement balances before continuing.");
        return;
      }
      // Strict restriction: all rows must be classified AND reviewed (approved/rejected/transfer/cash_movement)
      if (!bankIntelligenceClassified) {
        setFilingActionError(
          "Click 'Classify' first to generate suggestions for all bank transactions.",
        );
        return;
      }
      if (!bankTransactionsReviewed) {
        setFilingActionError(
          "Classify and review all bank transactions before continuing. For each row: green check = approve, blue arrows = internal transfer, amber X = exclude from ledger. All 5 rows must be decided.",
        );
        return;
      }
    }

    if (!canGoNext) return;
    setFilingActionError(null);
    const nextIndex = Math.min(totalSteps - 1, step + 1);
    if (currentStepKey === "pipeline_review") {
      setTaxCalculatedInSession(false);
    }

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

      // Auto-save form data + step. Keep tax year and empty arrays in sync too.
      const updateResult = await updateFilingDraftAction(draftId, {
        taxYear,
        filerType,
        businessStructure,
        incomeSources,
        salaryPercentage,
        readinessCompleted,
      });

      if (!updateResult.success) {
        setSavingDraft(false);
        setFilingActionError(
          updateResult.error ?? "Failed to save filing details",
        );
        return;
      }

      const stepResult = await updateFilingStepAction(
        draftId,
        nextIndex,
        newStatus,
      );

      if (!stepResult.success) {
        setSavingDraft(false);
        setFilingActionError(stepResult.error ?? "Failed to save filing step");
        return;
      }

      setSavingDraft(false);
    }

    setStep(nextIndex);
    setFurthestStepReached((prev) => Math.max(prev, nextIndex));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // "Create Filing" calls the real backend action and uses the returned
  // Prisma-backed draft ID to continue into the pipeline without navigation.
  async function handleCreateFiling() {
    if (navigationLockedRef.current) return;
    if (!canSubmit) return;

    setSubmitting(true);
    setFilingActionError(null);

    try {
      const result = await createAction(buildFormData());

      if (!result.success || !result.draftId) {
        setFilingActionError(result.error ?? "Failed to create filing draft");
        return;
      }

      const createdDraftId = result.draftId;
      setDraftId(createdDraftId);

      if (requiresBankAccounts) {
        const accountsResult = await saveBankAccountsAction(
          createdDraftId,
          bankAccounts.map(({ clientId: _clientId, ...account }) => account),
        );
        if (!accountsResult.success) {
          setFilingActionError(
            accountsResult.error ?? "Failed to save bank account details",
          );
          return;
        }
      }

      let uploadFailed = false;
      const stagedFiles = Object.entries(selectedDocumentFiles);

      for (const [documentType, file] of stagedFiles) {
        setUploadingDocumentType(documentType);

        const uploadData = new FormData();
        uploadData.set("draftId", createdDraftId);
        uploadData.set("documentType", documentType);
        uploadData.set("file", file);

        const uploadResult = await uploadFilingDocumentAction(uploadData);

        if (!uploadResult.success) {
          uploadFailed = true;
          setDocumentUploadError(
            uploadResult.error ?? `Failed to upload ${file.name}`,
          );
          setUploadedDocuments((previous) => {
            const next = { ...previous };
            delete next[documentType];
            return next;
          });
          continue;
        }

        // Keep the returned DB record in local state so Extract is available
        // immediately after Create Filing, without requiring a refresh.
        setDocumentRecords((previous) => ({
          ...previous,
          [documentType]: {
            id: uploadResult.document.id,
            fileName: uploadResult.document.fileName,
            extractionStatus: uploadResult.document.extractionStatus,
            extractionProvider: null,
            extractedAt: null,
          },
        }));
      }

      setUploadingDocumentType(null);
      setSelectedDocumentFiles({});

      // Re-read after staged uploads so a slower initial draft fetch cannot
      // overwrite the newly uploaded records with an empty response.
      const refreshedDocuments = await getFilingDocumentsAction(createdDraftId);
      if (refreshedDocuments.success) {
        const nextRecords: Record<string, FilingDocumentRecord> = {};
        const nextNames: Record<string, string> = {};

        for (const document of refreshedDocuments.documents) {
          nextRecords[document.documentType] = document as FilingDocumentRecord;
          nextNames[document.documentType] = document.fileName;
        }

        setDocumentRecords(nextRecords);
        setUploadedDocuments(nextNames);
      }

      const documentsStepIndex = setupSteps.length;
      setStep(documentsStepIndex);
      setFurthestStepReached(documentsStepIndex);

      const stepResult = await updateFilingStepAction(
        createdDraftId,
        documentsStepIndex,
        "IN_PROGRESS",
      );

      if (!stepResult.success) {
        setFilingActionError(stepResult.error ?? "Failed to save filing step");
      }

      if (uploadFailed) {
        setFilingActionError(
          (currentError) =>
            currentError ?? "One or more documents could not be uploaded",
        );
      }
    } catch (error) {
      console.error("Error creating filing:", error);
      setFilingActionError("Failed to create filing draft");
    } finally {
      setUploadingDocumentType(null);
      setSubmitting(false);
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
        bankAccounts={bankAccounts}
        salaryPercentage={salaryPercentage}
        taxYear={taxYear}
        readinessCompleted={readinessCompleted}
        showStructureRow={showStructureRow}
        needsIncomeSourceSelection={needsIncomeSourceSelection}
        documentRequirementSummary={documentRequirementSummary}
        requiredDocumentLabels={requiredDocumentLabels}
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
        onBankAccountsChange={(accounts) => {
          resetForSetupChange();
          setBankAccounts(accounts);
        }}
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
        taxYear={taxYear}
        documentSlots={documentSlots}
        uploadedDocuments={uploadedDocuments}
        documentRecords={documentRecords}
        extractedByDocumentId={extractedByDocumentId}
        uploadingDocumentType={uploadingDocumentType}
        extractingDocumentId={extractingDocumentId}
        reviewingDocumentId={reviewingDocumentId}
        savingDocumentReviewId={savingDocumentReviewId}
        mappingDocumentId={mappingDocumentId}
        documentUploadError={documentUploadError}
        uploadFileInputsRef={uploadFileInputsRef}
        triggerDocumentUpload={triggerDocumentUpload}
        handleDocumentFileSelected={handleDocumentFileSelected}
        handleExtractDocument={handleExtractDocument}
        handleReviewDocument={handleReviewDocument}
        handleExtractedFieldChange={handleExtractedFieldChange}
        handleExtractedTransactionChange={handleExtractedTransactionChange}
        handleSaveDocumentReview={handleSaveDocumentReview}
        handleMapDocument={handleMapDocument}
      />
    );
  }

  function renderBankIntelligence() {
    return (
      <WizardBankIntelligenceStep
        draftId={draftId ?? undefined}
        taxYear={taxYear}
        onClassificationStateChange={setBankIntelligenceClassified}
        onReviewStateChange={setBankTransactionsReviewed}
        onStatementSavedChange={setBankStatementSaved}
      />
    );
  }

  function renderLedgers() {
    return (
      <WizardLedgerStep
        taxYear={taxYear}
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
        approvalLocked={Boolean(filingPacket && approvalConfirmed)}
        approvalReady={approvalReady}
        approvalBlockers={approvalBlockers}
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
    bank_accounts: renderSetup,
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
        {filingActionError && (
          <div
            ref={filingActionErrorRef}
            role="alert"
            className="mb-6 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {filingActionError}
          </div>
        )}

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

export default FilingWizard;
