"use client";

// Tiny localStorage-backed store so this standalone demo can simulate a
// real filing moving through the whole journey — Setup, Upload, Ledgers,
// Reconciliation, Review, Filing Packet, Approval, FBR Connect — without
// a real backend/database. Swap this out for real data-layer calls when
// you wire these components into your actual TaxRocket project.
//
// Per direct feedback, the ENTIRE journey now lives inside ONE component
// (`components/tax/filing-wizard.tsx`) as a single continuous rail —
// there are no more separate route pages per step. This store's only
// job is to (a) let a filing be resumed later from the dashboard at
// exactly the step the user left off on, and (b) hold the small pieces
// of state (reconciliation choice, approval status) that later steps in
// the rail need to read back.

import type { FilingStep } from "@/components/tax/filing-progress";

export type ReconciliationMethod = "auto" | "manual";

export type DemoFilingDraft = {
  id: string;
  taxYear: number;
  taxpayerName: string;
  filerType: string;
  businessStructure: string | null;
  incomeSources: string[];
  readinessCompleted: string[];
  createdAt: number;
  status: string;
  /** Coarse status, used only by the dashboard's compact 5-stage FilingProgress bar. */
  currentStep: FilingStep;
  /** Fine-grained position within FilingWizard's unified step rail — lets "Continue Filing" from the dashboard resume at the exact step the user left off on. */
  wizardStepIndex: number;
  reconciliation: {
    method: ReconciliationMethod;
    /** For "manual", the note the user gave explaining the gap. */
    note?: string;
    resolvedAt: number;
  } | null;
  approved: boolean;
};

const KEY = "taxrocket-demo-drafts";

function readAll(): DemoFilingDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoFilingDraft[]) : [];
  } catch {
    return [];
  }
}

function writeAll(drafts: DemoFilingDraft[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(drafts));
  window.dispatchEvent(new Event("taxrocket-demo-drafts-changed"));
}

export function listDrafts(): DemoFilingDraft[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getDraft(id: string): DemoFilingDraft | null {
  return readAll().find((d) => d.id === id) ?? null;
}

export function createDraft(input: {
  taxYear: number;
  taxpayerName: string;
  filerType: string;
  businessStructure?: string | null;
  incomeSources: string[];
  readinessCompleted?: string[];
}): DemoFilingDraft {
  const draft: DemoFilingDraft = {
    id: `draft_${Math.random().toString(36).slice(2, 9)}`,
    taxYear: input.taxYear,
    taxpayerName: input.taxpayerName || "You",
    filerType: input.filerType,
    businessStructure: input.businessStructure ?? null,
    incomeSources: input.incomeSources,
    readinessCompleted: input.readinessCompleted ?? [],
    createdAt: Date.now(),
    status: "in_progress",
    currentStep: "upload",
    wizardStepIndex: 0,
    reconciliation: null,
    approved: false,
  };
  const all = readAll();
  all.push(draft);
  writeAll(all);
  return draft;
}

/** Generic patch — used to persist wherever the user currently is in the unified wizard rail, plus reconciliation/approval state, so re-opening the filing later resumes at the same spot. */
export function updateDraft(
  id: string,
  patch: Partial<Omit<DemoFilingDraft, "id">>,
) {
  const all = readAll();
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
}

export function clearAllDrafts() {
  writeAll([]);
}
