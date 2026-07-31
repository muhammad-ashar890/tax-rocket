// lib/tax/filing-status.ts — CENTRALIZED filing status & gate helper
// Per handoff doc: Dashboard / History / FBR / Approval drift ko khatam karne ke liye single source of truth.
// This file is the ONLY place where "is currently approved" and blocker logic should live.

export const FILING_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  APPROVED_FOR_FILING: "APPROVED_FOR_FILING",
  FILED: "FILED",
  NEEDS_RULES: "NEEDS_RULES",
} as const;

export type FilingStatus =
  | (typeof FILING_STATUS)[keyof typeof FILING_STATUS]
  | string;

export const COMPLETED_FILING_STATUSES = [
  FILING_STATUS.APPROVED_FOR_FILING,
  FILING_STATUS.FILED,
] as const;

// ── Ready status constants — match exact DB values ──
export const DOCUMENT_READY_STATUSES = ["COMPLETED", "MAPPED"] as const;
export const TRANSACTION_READY_STATUSES = [
  "APPROVED",
  "REJECTED",
  "TRANSFER",
  "CASH_MOVEMENT",
] as const;

export type DocumentLike = { extractionStatus: string };
export type TransactionLike = { classificationStatus: string };
export type PacketLike = {
  approvalStatus?: string | null;
  status?: string | null;
  version?: number;
} | null;

export type DraftCoreLike = {
  status?: string | null;
  packetApprovalConfirmed?: boolean | null;
  taxCalculationStatus?: string | null;
  reconciliationStatus?: string | null;
  reconciliationGap?: number | null;
  // optional includes for deep checks
  documents?: DocumentLike[];
  bankTransactions?: TransactionLike[];
  filingPackets?: PacketLike[] | { approvalStatus: string }[];
};

// ── Low-level predicates ──

export function isTaxCalculationReady(status?: string | null): boolean {
  return status === "ESTIMATE";
}

export function isTaxCalculationNeedsRules(status?: string | null): boolean {
  return status === "NEEDS_RULES";
}

export function isMizanResolved(
  reconciliationStatus?: string | null,
  reconciliationGap?: number | null,
  tolerance = 0.01,
): boolean {
  return (
    reconciliationStatus === "RESOLVED" &&
    Math.abs(reconciliationGap ?? 0) <= tolerance
  );
}

export function isDocumentReady(status: string): boolean {
  return (DOCUMENT_READY_STATUSES as readonly string[]).includes(status);
}

export function isTransactionReady(status: string): boolean {
  return (TRANSACTION_READY_STATUSES as readonly string[]).includes(status);
}

export function areDocumentsReviewed(
  documents: DocumentLike[] | undefined | null,
): boolean {
  if (!documents) return true; // if no docs loaded, don't block here — caller decides
  return documents.every((d) => isDocumentReady(d.extractionStatus));
}

export function areTransactionsReviewed(
  transactions: TransactionLike[] | undefined | null,
): boolean {
  if (!transactions) return true;
  return transactions.every((t) => isTransactionReady(t.classificationStatus));
}

export function isPacketApproved(packet: PacketLike): boolean {
  if (!packet) return false;
  return packet.approvalStatus === "APPROVED";
}

export function isPacketNotSuperseded(packet: PacketLike): boolean {
  if (!packet) return false;
  // Prisma query already filters status != SUPERSEDED, but keep defensive
  return packet.status ? packet.status !== "SUPERSEDED" : true;
}

export function isApprovalConfirmed(draft: DraftCoreLike): boolean {
  return Boolean(draft?.packetApprovalConfirmed);
}

// ── High-level current approval check — SINGLE SOURCE OF TRUTH ──
// Dashboard, History, and any UI that wants to know "is this filing truly approved right now"
// MUST use this, not raw draft.status.

export type CurrentApprovalInput = {
  draft: DraftCoreLike;
  documents?: DocumentLike[];
  transactions?: TransactionLike[];
  latestPacket?: PacketLike;
  // alternative if draft already includes arrays
  useDraftIncludes?: boolean;
};

export function getCurrentApprovalState(input: CurrentApprovalInput): {
  isCurrentlyApproved: boolean;
  isFiled: boolean;
  blockers: string[];
} {
  const { draft } = input;
  const blockers: string[] = [];

  const isFiled = draft.status === FILING_STATUS.FILED;
  if (isFiled) {
    return { isCurrentlyApproved: true, isFiled: true, blockers: [] };
  }

  const documents = input.documents ?? draft.documents ?? [];
  const transactions = input.transactions ?? draft.bankTransactions ?? [];
  let latestPacket: PacketLike = input.latestPacket ?? null;

  // Support draft.filingPackets[0] pattern from dashboard include
  if (!latestPacket && draft.filingPackets && draft.filingPackets.length > 0) {
    latestPacket = draft.filingPackets[0] as PacketLike;
  }

  if (draft.status !== FILING_STATUS.APPROVED_FOR_FILING) {
    blockers.push("Approve the current filing data and packet first");
  }
  if (!isApprovalConfirmed(draft)) {
    blockers.push("Confirm approval for packet generation");
  }
  if (!isTaxCalculationReady(draft.taxCalculationStatus)) {
    blockers.push("Complete a supported tax calculation");
  }
  if (!isMizanResolved(draft.reconciliationStatus, draft.reconciliationGap)) {
    blockers.push("Resolve the remaining Mizan gap");
  }
  if (documents.length > 0 && !areDocumentsReviewed(documents)) {
    blockers.push("Review all uploaded document extractions");
  }
  if (transactions.length > 0 && !areTransactionsReviewed(transactions)) {
    blockers.push("Classify and review all bank transactions");
  }
  if (!isPacketApproved(latestPacket) || !isPacketNotSuperseded(latestPacket)) {
    blockers.push("Generate and approve the latest filing packet");
  }

  return {
    isCurrentlyApproved: blockers.length === 0,
    isFiled: false,
    blockers,
  };
}

export function isCurrentlyApproved(input: CurrentApprovalInput): boolean {
  return getCurrentApprovalState(input).isCurrentlyApproved;
}

// ── Blockers specifically for pre-packet approval (Review → Approval step) ──
// Used in confirmFilingForPacketAction and wizard-approval-step

export type ApprovalBlockersInput = {
  documents?: DocumentLike[];
  transactions?: TransactionLike[];
  taxCalculationStatus?: string | null;
  reconciliationStatus?: string | null;
  reconciliationGap?: number | null;
};

export function getApprovalBlockers(input: ApprovalBlockersInput): string[] {
  const blockers: string[] = [];

  if (input.documents && !areDocumentsReviewed(input.documents)) {
    blockers.push("Review all uploaded document extractions");
  }
  if (input.transactions && !areTransactionsReviewed(input.transactions)) {
    blockers.push("Classify and review all bank transactions");
  }
  if (!isTaxCalculationReady(input.taxCalculationStatus)) {
    blockers.push("Complete a supported tax calculation");
  }
  if (!isMizanResolved(input.reconciliationStatus, input.reconciliationGap)) {
    blockers.push("Resolve the remaining Mizan gap");
  }

  return blockers;
}

// ── Blockers for final filing approval (packet → APPROVED) ──

export type FinalApprovalBlockersInput = ApprovalBlockersInput & {
  packetApprovalConfirmed?: boolean | null;
  latestPacket?: PacketLike;
};

export function getFinalApprovalBlockers(
  input: FinalApprovalBlockersInput,
): string[] {
  const blockers: string[] = [];

  if (!input.packetApprovalConfirmed) {
    blockers.push("Approve the current filing data from the filing wizard");
  }
  blockers.push(...getApprovalBlockers(input));

  if (!isPacketApproved(input.latestPacket)) {
    blockers.push("A current filing packet is not available for approval");
  }

  return blockers;
}

// ── Blockers for FBR Connect start gate ──
// Must match handoff doc: current approval, supported tax calc, Mizan zero, docs reviewed, bank reviewed, current approved non-superseded packet

export type FbrBlockersInput = {
  draft: DraftCoreLike;
  documents?: DocumentLike[];
  transactions?: TransactionLike[];
  latestPacket?: PacketLike;
};

export function getFbrConnectionBlockers(input: FbrBlockersInput): string[] {
  const state = getCurrentApprovalState({
    draft: input.draft,
    documents: input.documents,
    transactions: input.transactions,
    latestPacket: input.latestPacket,
  });

  // If already fully approved, no blockers. Otherwise return the detailed list.
  // For FBR we want the raw blockers from getCurrentApprovalState.
  return state.isCurrentlyApproved ? [] : state.blockers;
}

// ── Dashboard / History effective status ──
// Never trust stale APPROVED_FOR_FILING raw status — compute effective status.

export function getEffectiveFilingStatus(
  input: CurrentApprovalInput,
): FilingStatus {
  const { draft } = input;
  if (draft.status === FILING_STATUS.FILED) return FILING_STATUS.FILED;

  const approvalState = getCurrentApprovalState(input);
  if (approvalState.isCurrentlyApproved) {
    return FILING_STATUS.APPROVED_FOR_FILING;
  }
  if (isTaxCalculationNeedsRules(draft.taxCalculationStatus)) {
    return FILING_STATUS.NEEDS_RULES;
  }
  return FILING_STATUS.IN_PROGRESS;
}

// ── Pipeline helpers — for dashboard labels ──

export function getPipelineStartIndex(draft: {
  filerType?: string | null;
  businessStructure?: string | null;
  incomeSources: string | string[]; // JSON string or array
}): number {
  let setupStepCount = 1; // Who is filing?
  let incomeSourcesArray: string[] = [];

  if (typeof draft.incomeSources === "string") {
    try {
      const parsed = JSON.parse(draft.incomeSources);
      incomeSourcesArray = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      incomeSourcesArray = [];
    }
  } else if (Array.isArray(draft.incomeSources)) {
    incomeSourcesArray = draft.incomeSources.map(String);
  }

  const needsIncomeSourceSelection =
    draft.filerType === "myself" ||
    (draft.filerType === "my_business" &&
      draft.businessStructure === "sole_proprietor");

  if (draft.filerType === "my_business") setupStepCount += 1;
  if (needsIncomeSourceSelection) setupStepCount += 1;

  if (
    needsIncomeSourceSelection &&
    incomeSourcesArray.includes("salary") &&
    incomeSourcesArray.length >= 2
  ) {
    setupStepCount += 1;
  }

  // Tax year + readiness + review/create
  return setupStepCount + 3;
}

export function getDashboardStepLabel(params: {
  draft: {
    currentStep: number;
    incomeSources: string | string[];
    filerType?: string | null;
    businessStructure?: string | null;
  };
  isCurrentlyApproved: boolean;
}): string {
  if (params.isCurrentlyApproved) return "File";

  const pipelineOffset =
    params.draft.currentStep - getPipelineStartIndex(params.draft);
  if (pipelineOffset >= 7) return "File";
  if (pipelineOffset >= 5) return "Approve";
  if (pipelineOffset >= 2) return "Review";
  if (pipelineOffset >= 0) return "Upload";
  return "Setup";
}

// ── Tax display helpers — Pending vs PKR 0 ──

export function formatTaxValueForDisplay(
  value: number | null | undefined,
  taxCalculationStatus?: string | null,
): string {
  if (
    !isTaxCalculationReady(taxCalculationStatus) ||
    value === null ||
    value === undefined
  ) {
    return "Pending";
  }
  return `PKR ${value.toLocaleString()}`;
}

export function formatTaxValueForPacketPdf(
  value: number | null | undefined,
  taxCalculationStatus?: string | null,
): string {
  if (
    !isTaxCalculationReady(taxCalculationStatus) ||
    value === null ||
    value === undefined
  ) {
    return "Pending — route-specific tax rules required";
  }
  return `PKR ${value.toLocaleString()}`;
}
