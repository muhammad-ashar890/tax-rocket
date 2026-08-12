import { useEffect, useState } from "react";

import {
  calculateReconciliationPreviewAction,
  getReconciliationAction,
  saveReconciliationAction,
  type ReconciliationInput,
} from "@/app/actions/reconciliation";
import type { ReconciliationMethod } from "@/components/tax/filing/config/filing-wizard-config";

type ResetDownstreamSteps = (
  resetStep: number,
  preserveReconciliation?: boolean,
) => void;

type ReconciliationPreview = {
  accountBalances?: Array<{
    bankName: string | null;
    accountLabel: string;
    openingBalance: number;
    closingBalance: number;
  }>;
  openingWealth: number;
  closingWealth: number;
  totalIncome: number;
  totalExpenses: number;
  gap: number;
};

type ReconciliationResolved = {
  method: ReconciliationMethod;
  note?: string;
};

type UseFilingReconciliationInput = {
  draftId: string | null;
  step: number;
  ledgerEntryCount: number;
  setSavingDraft: (saving: boolean) => void;
  resetDownstreamSteps: ResetDownstreamSteps;
  refreshLedger: () => Promise<void>;
};

export function useFilingReconciliation({
  draftId,
  step,
  ledgerEntryCount,
  setSavingDraft,
  resetDownstreamSteps,
  refreshLedger,
}: UseFilingReconciliationInput) {
  const [reconciliationMethod, setReconciliationMethod] =
    useState<ReconciliationMethod | null>(null);
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [reconciliationResolved, setReconciliationResolved] =
    useState<ReconciliationResolved | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(
    null,
  );
  const [reconciliationPreview, setReconciliationPreview] =
    useState<ReconciliationPreview | null>(null);

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
      const amountsMatch = (
        savedValue: number | null | undefined,
        previewValue: number,
      ) =>
        savedValue !== null &&
        savedValue !== undefined &&
        Math.abs(savedValue - previewValue) < 0.01;
      const savedMatchesPreview =
        record?.reconciliationStatus === "RESOLVED" &&
        record.reconciliationMethod &&
        amountsMatch(record.openingWealth, preview.openingWealth) &&
        amountsMatch(record.closingWealth, preview.closingWealth) &&
        amountsMatch(record.reconciliationGap, preview.gap);

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
  }, [draftId, ledgerEntryCount, step]);

  async function handleConfirmReconciliation() {
    if (!reconciliationPreview) {
      setReconciliationError(
        "Add bank transactions with balances before resolving Mizan",
      );
      return;
    }

    const effectiveMethod: ReconciliationMethod =
      Math.abs(reconciliationPreview.gap) <= 0.01
        ? "auto"
        : (reconciliationMethod ?? "auto");

    if (
      effectiveMethod === "manual" &&
      reconciliationNote.trim().length === 0
    ) {
      return;
    }

    const input: ReconciliationInput = {
      method: effectiveMethod,
      note:
        effectiveMethod === "manual" ? reconciliationNote.trim() : undefined,
      openingWealth: reconciliationPreview.openingWealth,
      closingWealth: reconciliationPreview.closingWealth,
      gap: reconciliationPreview.gap,
    };

    if (!draftId) {
      setReconciliationResolved({ method: input.method, note: input.note });
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

    const adjustmentAmount = result.adjustmentAmount ?? Math.abs(input.gap);
    resetDownstreamSteps(step, true);

    if (input.method === "auto") {
      setReconciliationPreview((previous) =>
        previous ? { ...previous, gap: 0 } : previous,
      );
    }

    setReconciliationResolved({
      method: input.method,
      note:
        input.method === "auto"
          ? adjustmentAmount <= 0.01
            ? "No Other reconciliation adjustment was required."
            : `Other adjustment recorded for PKR ${adjustmentAmount.toLocaleString()}.`
          : input.note,
    });

    if (input.method === "auto") {
      await refreshLedger();
    }
  }

  return {
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
  };
}
