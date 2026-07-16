"use client";

import { FileText, Scale, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  WorkflowKpiCard,
  WorkflowKpiStrip,
} from "@/components/tax/workflow-page-shell";
import { StepHeading } from "@/components/tax/wizard-ui";

type FilingSummary = {
  income: number;
  expenses: number;
  assets: number;
  liabilities: number;
  documentCount: number;
  pendingDocumentCount: number;
  reconciliationStatus: string;
  reconciliationGap: number | null;
  taxableIncome: number | null;
  taxPayable: number | null;
  refundDue: number | null;
  taxCalculationStatus: string;
};

type WizardReviewStepProps = Readonly<{
  filingSummary: FilingSummary | null;
  filingSummaryError: string | null;
  taxCalculationError: string | null;
  calculatingTax: boolean;
  reconciliationResolved: boolean;
  draftId?: string;
  onCalculateTax: () => void;
}>;

export function WizardReviewStep({
  filingSummary,
  filingSummaryError,
  taxCalculationError,
  calculatingTax,
  reconciliationResolved,
  draftId,
  onCalculateTax,
}: WizardReviewStepProps) {
  const money = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "Pending"
      : `PKR ${value.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <StepHeading
        title="Review your filing"
        description="Review the totals saved against this filing before generating the packet."
      />

      {(filingSummaryError || taxCalculationError) && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {taxCalculationError ?? filingSummaryError}
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
        <WorkflowKpiCard
          label="Taxable income"
          value={money(filingSummary?.taxableIncome)}
        />
        <WorkflowKpiCard
          label="Tax payable"
          value={money(filingSummary?.taxPayable)}
          accent="amanah"
        />
        <WorkflowKpiCard
          label="Refund due"
          value={money(filingSummary?.refundDue)}
          accent="amanah"
        />
      </WorkflowKpiStrip>

      <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Tax calculation
          </p>
          <p className="text-xs text-muted-foreground">
            Status: {filingSummary?.taxCalculationStatus ?? "NOT_CALCULATED"}
          </p>
        </div>
        <Button
          type="button"
          onClick={onCalculateTax}
          disabled={calculatingTax || !draftId}
          className="gap-2"
        >
          {calculatingTax && <Loader2 className="h-4 w-4 animate-spin" />}
          {calculatingTax ? "Calculating..." : "Calculate Tax Estimate"}
        </Button>
      </div>

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
              reconciliationResolved
                ? "mt-3 border-amanah/25 bg-amanah/10 text-amanah"
                : "mt-3 border-[#B8872F]/35 bg-[#B8872F]/10 text-[#8A641F]"
            }
          >
            {reconciliationResolved ? "Resolved" : "Needs attention"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
