"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Plus,
  Sparkles,
  XCircle,
} from "lucide-react";

import {
  classifyBankTransactionsAction,
  reviewBankTransactionClassificationAction,
} from "@/app/actions/bank-classification";
import {
  getBankStatementAction,
  saveBankStatementAction,
} from "@/app/actions/bank-statements";
import {
  addBankTransactionAction,
  getBankTransactionsAction,
} from "@/app/actions/bank-transactions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  WorkflowKpiCard,
  WorkflowKpiStrip,
} from "@/components/tax/workflow-page-shell";
import { StepHeading } from "@/components/tax/wizard-ui";
import { getTaxYearDateInputBounds } from "@/lib/tax/tax-year-period";

type BankRow = {
  id?: string;
  date: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  source?: string;
  classificationStatus?: string;
  suggestedEntryType?: string | null;
  suggestedCategory?: string | null;
};

type WizardBankIntelligenceStepProps = Readonly<{
  draftId?: string;
  taxYear: number;
  onReviewStateChange?: (ready: boolean) => void;
  onClassificationStateChange?: (classified: boolean) => void;
}>;

export function WizardBankIntelligenceStep({
  draftId,
  taxYear,
  onReviewStateChange,
  onClassificationStateChange,
}: WizardBankIntelligenceStepProps) {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [rowDraft, setRowDraft] = useState<BankRow>({
    date: "",
    description: "",
    debit: "",
    credit: "",
    balance: "",
  });
  const [accountLabel, setAccountLabel] = useState("Primary account");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const taxYearBounds = getTaxYearDateInputBounds(taxYear);

  function updateReviewState(nextRows: BankRow[]) {
    const ready = nextRows.every(
      (row) =>
        row.classificationStatus === "APPROVED" ||
        row.classificationStatus === "REJECTED" ||
        row.classificationStatus === "TRANSFER" ||
        row.classificationStatus === "CASH_MOVEMENT",
    );
    onReviewStateChange?.(ready);
  }

  async function refreshData() {
    if (!draftId) return;

    const [transactions, statement] = await Promise.all([
      getBankTransactionsAction(draftId),
      getBankStatementAction(draftId),
    ]);

    if (transactions.success) {
      const nextRows = transactions.rows as BankRow[];
      setRows(nextRows);
      updateReviewState(nextRows);
      // A classification run is complete once the system has produced at
      // least one classification decision. Unknown rows may remain
      // UNREVIEWED and can be handled later as transfers/cash movements.
      onClassificationStateChange?.(
        nextRows.length === 0 ||
          nextRows.some((row) => row.classificationStatus !== "UNREVIEWED"),
      );
    }

    if (statement.statement) {
      setAccountLabel(statement.statement.accountLabel);
      setOpeningBalance(String(statement.statement.openingBalance));
      setClosingBalance(String(statement.statement.closingBalance));
      setPeriodStart(statement.statement.periodStart);
      setPeriodEnd(statement.statement.periodEnd);
    }

    if (!statement.success) {
      setError(
        statement.error ?? "Bank statement does not match this tax year",
      );
    }
  }

  useEffect(() => {
    void refreshData();
  }, [draftId]);

  async function handleSaveStatement() {
    if (!draftId) return;
    setSaving(true);
    setError(null);

    const result = await saveBankStatementAction(draftId, {
      accountLabel,
      openingBalance: Number(openingBalance),
      closingBalance: Number(closingBalance),
      periodStart,
      periodEnd,
    });
    setSaving(false);

    if (!result.success)
      setError(result.error ?? "Failed to save statement balances");
  }

  async function handleAddRow() {
    if (!draftId) return;
    if (
      !rowDraft.date ||
      !rowDraft.description ||
      (!rowDraft.debit && !rowDraft.credit)
    ) {
      setError("Date, description, and debit or credit are required");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await addBankTransactionAction(draftId, rowDraft);
    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "Failed to add transaction");
      return;
    }

    setRowDraft({
      date: "",
      description: "",
      debit: "",
      credit: "",
      balance: "",
    });
    await refreshData();
    // The new row is unclassified. Keep Continue blocked even when older
    // rows already have persisted classification decisions.
    onClassificationStateChange?.(false);
  }

  async function handleClassify() {
    if (!draftId || rows.length === 0) return;
    setClassifying(true);
    setError(null);
    const result = await classifyBankTransactionsAction(draftId);
    setClassifying(false);
    if (!result.success) {
      setError(result.error ?? "Failed to classify transactions");
      return;
    }
    await refreshData();
    onClassificationStateChange?.(true);
  }

  async function handleReview(
    id: string,
    decision: "APPROVE" | "REJECT" | "TRANSFER" | "CASH_MOVEMENT",
  ) {
    if (!draftId) return;
    setReviewingId(id);
    setError(null);
    const result = await reviewBankTransactionClassificationAction(
      draftId,
      id,
      decision,
    );
    setReviewingId(null);
    if (!result.success) {
      setError(result.error ?? "Failed to review suggestion");
      return;
    }
    await refreshData();
  }

  return (
    <div className="space-y-6">
      <StepHeading
        title="Bank Intelligence"
        description="Confirm statement balances and review transactions before they feed your ledgers."
      />

      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <WorkflowKpiStrip maxColumns={2}>
        <WorkflowKpiCard
          label="Transactions"
          value={String(rows.length)}
          accent="amanah"
        />
        <WorkflowKpiCard
          label="Opening balance"
          value={
            openingBalance
              ? `PKR ${Number(openingBalance).toLocaleString()}`
              : "Not set"
          }
        />
        <WorkflowKpiCard
          label="Closing balance"
          value={
            closingBalance
              ? `PKR ${Number(closingBalance).toLocaleString()}`
              : "Not set"
          }
          accent="mizan"
        />
        <WorkflowKpiCard
          label="Status"
          value={saving ? "Saving..." : "Ready"}
        />
      </WorkflowKpiStrip>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Statement balances</h3>
            <p className="text-xs text-muted-foreground">
              Use the actual balances printed on the bank statement.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              placeholder="Account label"
              className="h-10 rounded-lg border px-3 text-sm"
            />
            <input
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              type="number"
              placeholder="Opening balance"
              className="h-10 rounded-lg border px-3 text-sm"
            />
            <input
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              type="number"
              placeholder="Closing balance"
              className="h-10 rounded-lg border px-3 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={periodStart}
                min={taxYearBounds.min}
                max={taxYearBounds.max}
                onChange={(e) => setPeriodStart(e.target.value)}
                type="date"
                className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
              />
              <input
                value={periodEnd}
                min={taxYearBounds.min}
                max={taxYearBounds.max}
                onChange={(e) => setPeriodEnd(e.target.value)}
                type="date"
                className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={handleSaveStatement}
            disabled={saving || !draftId}
          >
            Save Statement Balances
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Transactions</h3>
              <p className="text-xs text-muted-foreground">
                Green check = approve · arrows = internal transfer · amber X =
                exclude from ledger.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleClassify}
              disabled={classifying || saving || rows.length === 0}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {classifying ? "Classifying..." : "Classify"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input
              type="date"
              min={taxYearBounds.min}
              max={taxYearBounds.max}
              value={rowDraft.date}
              onChange={(e) =>
                setRowDraft((p) => ({ ...p, date: e.target.value }))
              }
              className="h-10 rounded-lg border px-3 text-sm"
            />
            <input
              value={rowDraft.description}
              onChange={(e) =>
                setRowDraft((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Description"
              className="h-10 rounded-lg border px-3 text-sm lg:col-span-2"
            />
            <input
              value={rowDraft.debit}
              onChange={(e) =>
                setRowDraft((p) => ({ ...p, debit: e.target.value }))
              }
              type="number"
              placeholder="Debit"
              className="h-10 rounded-lg border px-3 text-sm"
            />
            <input
              value={rowDraft.credit}
              onChange={(e) =>
                setRowDraft((p) => ({ ...p, credit: e.target.value }))
              }
              type="number"
              placeholder="Credit"
              className="h-10 rounded-lg border px-3 text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleAddRow}
              disabled={saving}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Debit</th>
                    <th className="px-3 py-2">Credit</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="px-3 py-2">Suggestion</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, index) => (
                    <tr key={row.id ?? `${row.description}-${index}`}>
                      <td className="px-3 py-2">{row.date || "—"}</td>
                      <td className="px-3 py-2">{row.description}</td>
                      <td className="px-3 py-2">{row.debit || "—"}</td>
                      <td className="px-3 py-2">{row.credit || "—"}</td>
                      <td className="px-3 py-2">{row.balance || "—"}</td>
                      <td className="px-3 py-2">
                        {row.classificationStatus === "SUGGESTED" ? (
                          <Badge
                            variant="outline"
                            className="border-amanah/25 bg-amanah/10 text-amanah"
                          >
                            {row.suggestedEntryType} · {row.suggestedCategory}
                          </Badge>
                        ) : row.classificationStatus === "POTENTIAL_INCOME" ? (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-700"
                          >
                            Potential income
                          </Badge>
                        ) : row.classificationStatus === "POTENTIAL_ASSET" ? (
                          <Badge
                            variant="outline"
                            className="border-purple-200 bg-purple-50 text-purple-700"
                          >
                            Potential asset
                          </Badge>
                        ) : row.classificationStatus ===
                          "POTENTIAL_LIABILITY" ? (
                          <Badge
                            variant="outline"
                            className="border-orange-200 bg-orange-50 text-orange-700"
                          >
                            Potential liability
                          </Badge>
                        ) : row.classificationStatus ===
                          "POTENTIAL_TRANSFER" ? (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-700"
                          >
                            Potential transfer
                          </Badge>
                        ) : row.classificationStatus ===
                          "POTENTIAL_CASH_MOVEMENT" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-700"
                          >
                            Potential cash movement
                          </Badge>
                        ) : row.classificationStatus === "APPROVED" ? (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-700"
                          >
                            Approved
                          </Badge>
                        ) : row.classificationStatus === "TRANSFER" ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            Internal transfer
                          </Badge>
                        ) : row.classificationStatus === "CASH_MOVEMENT" ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            Cash movement
                          </Badge>
                        ) : row.classificationStatus === "REJECTED" ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            Excluded
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            Unreviewed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {row.id &&
                            row.classificationStatus === "SUGGESTED" && (
                              <>
                                <button
                                  type="button"
                                  title="Approve suggestion"
                                  onClick={() =>
                                    handleReview(row.id!, "APPROVE")
                                  }
                                  disabled={reviewingId === row.id}
                                  className="text-amanah"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Exclude from ledger"
                                  onClick={() =>
                                    handleReview(row.id!, "REJECT")
                                  }
                                  disabled={reviewingId === row.id}
                                  className="text-amber-600"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          {row.id &&
                            [
                              "POTENTIAL_INCOME",
                              "POTENTIAL_ASSET",
                              "POTENTIAL_LIABILITY",
                              "POTENTIAL_TRANSFER",
                              "POTENTIAL_CASH_MOVEMENT",
                            ].includes(row.classificationStatus ?? "") && (
                              <>
                                {[
                                  "POTENTIAL_INCOME",
                                  "POTENTIAL_ASSET",
                                  "POTENTIAL_LIABILITY",
                                ].includes(row.classificationStatus ?? "") && (
                                  <button
                                    type="button"
                                    title={
                                      row.classificationStatus ===
                                      "POTENTIAL_INCOME"
                                        ? "Approve as income"
                                        : row.classificationStatus ===
                                            "POTENTIAL_ASSET"
                                          ? "Approve as asset"
                                          : "Approve as liability"
                                    }
                                    onClick={() =>
                                      handleReview(row.id!, "APPROVE")
                                    }
                                    disabled={reviewingId === row.id}
                                    className="text-amanah"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {row.classificationStatus ===
                                  "POTENTIAL_INCOME" ||
                                row.classificationStatus ===
                                  "POTENTIAL_TRANSFER" ? (
                                  <button
                                    type="button"
                                    title="Mark as internal transfer"
                                    onClick={() =>
                                      handleReview(row.id!, "TRANSFER")
                                    }
                                    disabled={reviewingId === row.id}
                                    className="text-blue-600"
                                  >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                  </button>
                                ) : row.classificationStatus ===
                                  "POTENTIAL_CASH_MOVEMENT" ? (
                                  <button
                                    type="button"
                                    title="Mark as cash movement"
                                    onClick={() =>
                                      handleReview(row.id!, "CASH_MOVEMENT")
                                    }
                                    disabled={reviewingId === row.id}
                                    className="text-amber-700"
                                  >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  title="Exclude from ledger"
                                  onClick={() =>
                                    handleReview(row.id!, "REJECT")
                                  }
                                  disabled={reviewingId === row.id}
                                  className="text-amber-600"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          {row.id &&
                            row.classificationStatus === "UNREVIEWED" && (
                              <button
                                type="button"
                                title="Exclude from ledger"
                                onClick={() => handleReview(row.id!, "REJECT")}
                                disabled={reviewingId === row.id}
                                className="text-amber-600"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
