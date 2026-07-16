"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  PenLine,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  WorkflowKpiCard,
  WorkflowKpiStrip,
} from "@/components/tax/workflow-page-shell";
import { StepHeading } from "@/components/tax/wizard-ui";

export type ReconciliationPreview = {
  openingWealth: number;
  closingWealth: number;
  totalIncome: number;
  totalExpenses: number;
  gap: number;
};

export type ReconciliationMethod = "auto" | "manual";

type WizardReconciliationStepProps = Readonly<{
  draftId?: string;
  reconciliationMethod: ReconciliationMethod | null;
  reconciliationNote: string;
  reconciliationResolved: {
    method: ReconciliationMethod;
    note?: string;
  } | null;
  reconciliationPreview: ReconciliationPreview | null;
  reconciliationError: string | null;
  saving: boolean;
  onMethodChange: (method: ReconciliationMethod) => void;
  onNoteChange: (note: string) => void;
  onConfirm: () => void;
}>;

export function WizardReconciliationStep({
  draftId,
  reconciliationMethod,
  reconciliationNote,
  reconciliationResolved,
  reconciliationPreview,
  reconciliationError,
  saving,
  onMethodChange,
  onNoteChange,
  onConfirm,
}: WizardReconciliationStepProps) {
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
                ? "Auto-adjustment selected"
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
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#8A641F]">
                {reconciliationPreview
                  ? `Choose how you'd like to resolve the ${gapLabel} gap.`
                  : "Add bank transactions with balances to calculate the Mizan gap."}
              </p>
              {!reconciliationPreview && draftId && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                >
                  <Link href={`/tax/bank-intelligence?draftId=${draftId}`}>
                    Open Bank Intelligence
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onMethodChange("auto")}
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all ${
                reconciliationMethod === "auto"
                  ? "border-amanah bg-amanah/5 shadow-sm"
                  : "border-border hover:border-amanah/35"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amanah/25 bg-amanah/10 text-amanah">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Auto-adjust</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mark the calculated gap for automatic adjustment review.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onMethodChange("manual")}
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all ${
                reconciliationMethod === "manual"
                  ? "border-amanah bg-amanah/5 shadow-sm"
                  : "border-border hover:border-amanah/35"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground">
                <PenLine className="h-6 w-6" />
              </span>
              <div>
                <p className="font-semibold text-foreground">
                  Resolve manually
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Explain the source of the gap yourself.
                </p>
              </div>
            </button>
          </div>

          {reconciliationMethod === "manual" && (
            <textarea
              value={reconciliationNote}
              onChange={(event) => onNoteChange(event.target.value)}
              rows={3}
              placeholder="Explain the gap..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          )}

          {reconciliationMethod && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onConfirm}
                disabled={
                  saving ||
                  !reconciliationPreview ||
                  (reconciliationMethod === "manual" &&
                    reconciliationNote.trim().length === 0)
                }
                className="gap-2"
              >
                {reconciliationMethod === "auto" ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {saving ? "Saving..." : "Confirm Resolution"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
