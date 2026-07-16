"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Download,
  Landmark,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";
import { WizardSummaryPanel } from "@/components/tax/wizard-ui";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { getFilingDraftAction } from "@/app/actions/filing";
import { uploadFilingDocumentAction } from "@/app/actions/documents";
import {
  getBankStatementAction,
  saveBankStatementAction,
  type BankStatementInput,
} from "@/app/actions/bank-statements";
import {
  classifyBankTransactionsAction,
  reviewBankTransactionClassificationAction,
} from "@/app/actions/bank-classification";
import {
  getBankTransactionsAction,
  replaceBankTransactionsAction,
  type BankTransactionInput,
} from "@/app/actions/bank-transactions";

const DEMO_RECONCILIATION_GAP = 184500;

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

type BankDraftSummary = {
  id: string;
  taxYear: number;
  filerType: string | null;
  status: string;
  reconciliationGap: number | null;
};

const emptyRowDraft: BankRow = {
  date: "",
  description: "",
  debit: "",
  credit: "",
  balance: "",
};

function parseCsvRows(raw: string): BankRow[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const dataLines =
    lines.length > 0 && /date/i.test(lines[0]) ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const [date = "", description = "", debit = "", credit = "", balance = ""] =
      line.split(",").map((c) => c.trim());
    return { date, description, debit, credit, balance };
  });
}

function rowsToCsv(rows: BankRow[]): string {
  const header = "Date,Description,Debit,Credit,Balance";
  const body = rows.map((r) =>
    [r.date, r.description, r.debit, r.credit, r.balance].join(","),
  );
  return [header, ...body].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function BankIntelligenceContent() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  const { data: session } = useSession();
  const [draft, setDraft] = useState<BankDraftSummary | null>(null);

  const [rowDraft, setRowDraft] = useState<BankRow>(emptyRowDraft);
  const [rows, setRows] = useState<BankRow[]>([]);
  const [showCsvPaste, setShowCsvPaste] = useState(false);
  const [pastedRows, setPastedRows] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [savingRows, setSavingRows] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [reviewingTransactionId, setReviewingTransactionId] = useState<
    string | null
  >(null);
  const [classificationError, setClassificationError] = useState<string | null>(
    null,
  );
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [statementDocumentId, setStatementDocumentId] = useState<string | null>(
    null,
  );
  const [statementAccountLabel, setStatementAccountLabel] =
    useState("Primary account");
  const [statementOpeningBalance, setStatementOpeningBalance] = useState("");
  const [statementClosingBalance, setStatementClosingBalance] = useState("");
  const [statementPeriodStart, setStatementPeriodStart] = useState("");
  const [statementPeriodEnd, setStatementPeriodEnd] = useState("");
  const [savingStatement, setSavingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!draftId) return;

    let isMounted = true;

    Promise.all([
      getFilingDraftAction(draftId),
      getBankTransactionsAction(draftId),
      getBankStatementAction(draftId),
    ]).then(([draftResult, transactionResult, statementResult]) => {
      if (!isMounted) return;

      if (draftResult.success && draftResult.draft) {
        const existing = draftResult.draft as BankDraftSummary;
        setDraft(existing);
      }

      if (transactionResult.success) {
        setUploadedFileName(
          transactionResult.statementDocument?.fileName ?? null,
        );
        setRows(
          transactionResult.rows.map((row) => ({
            id: row.id,
            date: row.date,
            description: row.description,
            debit: row.debit,
            credit: row.credit,
            balance: row.balance,
            source: row.source,
            classificationStatus: row.classificationStatus,
            suggestedEntryType: row.suggestedEntryType,
            suggestedCategory: row.suggestedCategory,
          })),
        );
      }

      if (statementResult.success && statementResult.statement) {
        setStatementDocumentId(
          statementResult.statement.sourceDocumentId ?? null,
        );
        setStatementAccountLabel(statementResult.statement.accountLabel);
        setStatementOpeningBalance(
          String(statementResult.statement.openingBalance),
        );
        setStatementClosingBalance(
          String(statementResult.statement.closingBalance),
        );
        setStatementPeriodStart(statementResult.statement.periodStart);
        setStatementPeriodEnd(statementResult.statement.periodEnd);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [draftId]);

  const reconciliationResolved =
    draft?.reconciliationGap !== null && draft?.reconciliationGap !== undefined
      ? { method: "auto" as const }
      : null;
  const importedCount = rows.length;
  const canAddRow =
    rowDraft.date.trim().length > 0 &&
    (rowDraft.debit.trim() || rowDraft.credit.trim());

  const riskFlags = [
    !reconciliationResolved && {
      id: "gap",
      label: "Wealth reconciliation is unresolved",
      detail: `An unexplained credit of PKR ${DEMO_RECONCILIATION_GAP.toLocaleString()} needs a supported expense, liability, or year-end balance before Mizan can close.`,
    },
    !uploadedFileName &&
      importedCount === 0 && {
        id: "statement",
        label: "Bank statement not uploaded",
        detail:
          "Upload a statement or add rows below so transactions can be classified and closing balance captured.",
      },
  ].filter(Boolean) as { id: string; label: string; detail: string }[];

  const summaryRows = draft
    ? [
        { label: "Tax year", value: String(draft.taxYear) },
        {
          label: "Taxpayer",
          value: session?.user?.name || "Taxpayer",
        },
        {
          label: "Reconciliation",
          value: reconciliationResolved
            ? reconciliationResolved.method === "auto"
              ? "Auto-adjusted"
              : "Manually resolved"
            : "Unresolved",
        },
        { label: "Statement file", value: uploadedFileName ?? "Not uploaded" },
        {
          label: "Rows added",
          value: importedCount > 0 ? String(importedCount) : "0",
        },
      ]
    : [];

  async function handleClassifyTransactions() {
    if (!draftId || rows.length === 0) return;

    setClassifying(true);
    setClassificationError(null);

    const result = await classifyBankTransactionsAction(draftId);
    if (!result.success) {
      setClassificationError(result.error ?? "Failed to classify transactions");
      setClassifying(false);
      return;
    }

    const refreshed = await getBankTransactionsAction(draftId);
    if (refreshed.success) {
      setRows(
        refreshed.rows.map((row) => ({
          id: row.id,
          date: row.date,
          description: row.description,
          debit: row.debit,
          credit: row.credit,
          balance: row.balance,
          source: row.source,
          classificationStatus: row.classificationStatus,
          suggestedEntryType: row.suggestedEntryType,
          suggestedCategory: row.suggestedCategory,
        })),
      );
    }

    setClassifying(false);
  }

  async function handleReviewTransaction(
    transactionId: string,
    decision: "APPROVE" | "REJECT",
  ) {
    if (!draftId) return;

    setReviewingTransactionId(transactionId);
    setClassificationError(null);

    const result = await reviewBankTransactionClassificationAction(
      draftId,
      transactionId,
      decision,
    );

    if (!result.success) {
      setClassificationError(
        result.error ?? "Failed to review transaction suggestion",
      );
      setReviewingTransactionId(null);
      return;
    }

    const refreshed = await getBankTransactionsAction(draftId);
    if (refreshed.success) {
      setRows(
        refreshed.rows.map((row) => ({
          id: row.id,
          date: row.date,
          description: row.description,
          debit: row.debit,
          credit: row.credit,
          balance: row.balance,
          source: row.source,
          classificationStatus: row.classificationStatus,
          suggestedEntryType: row.suggestedEntryType,
          suggestedCategory: row.suggestedCategory,
        })),
      );
    }

    setReviewingTransactionId(null);
  }

  async function handleSaveStatement() {
    if (!draftId) return;

    const input: BankStatementInput = {
      accountLabel: statementAccountLabel,
      openingBalance: Number(statementOpeningBalance),
      closingBalance: Number(statementClosingBalance),
      periodStart: statementPeriodStart,
      periodEnd: statementPeriodEnd,
      sourceDocumentId: statementDocumentId ?? undefined,
    };

    setSavingStatement(true);
    setStatementError(null);
    const result = await saveBankStatementAction(draftId, input);
    setSavingStatement(false);

    if (!result.success) {
      setStatementError(result.error ?? "Failed to save statement balances");
    }
  }

  async function handleFileSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    if (!draftId) {
      setUploadError(
        "Open Bank Intelligence from an existing filing before uploading a statement.",
      );
      return;
    }

    setUploadingStatement(true);
    setUploadError(null);
    setSaveError(null);

    const uploadData = new FormData();
    uploadData.set("draftId", draftId);
    uploadData.set("documentType", "bank_statement");
    uploadData.set("file", file);

    const uploadResult = await uploadFilingDocumentAction(uploadData);

    if (!uploadResult.success) {
      setUploadError(uploadResult.error ?? "Failed to upload statement");
      setUploadingStatement(false);
      return;
    }

    setUploadedFileName(file.name);
    if (uploadResult.document?.id) {
      setStatementDocumentId(uploadResult.document.id);
    }

    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = await file.text();
      const parsedRows = parseCsvRows(text);
      if (parsedRows.length > 0) {
        await persistRows([...rows, ...parsedRows], "CSV");
      }
    }

    setUploadingStatement(false);
  }

  async function persistRows(nextRows: BankRow[], source = "MANUAL") {
    setRows(nextRows);
    setSaveError(null);

    if (!draftId) return;

    setSavingRows(true);
    const inputs: BankTransactionInput[] = nextRows.map((row) => ({
      date: row.date,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
      source,
    }));

    const result = await replaceBankTransactionsAction(draftId, inputs);
    setSavingRows(false);

    if (!result.success) {
      setSaveError(result.error ?? "Failed to save transaction rows");
    }
  }

  function handleAddRow() {
    if (!canAddRow) return;
    void persistRows([...rows, rowDraft]);
    setRowDraft(emptyRowDraft);
  }

  function handleRemoveRow(index: number) {
    void persistRows(rows.filter((_, i) => i !== index));
  }

  function handleImportCsvPaste() {
    const parsed = parseCsvRows(pastedRows);
    if (parsed.length === 0) return;
    void persistRows([...rows, ...parsed]);
    setPastedRows("");
    setShowCsvPaste(false);
  }

  function handleExportCsv() {
    if (rows.length === 0) return;
    downloadCsv(
      `bank-intelligence-${draft?.taxYear ?? "export"}.csv`,
      rowsToCsv(rows),
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* Sidebar added here */}
      <DashboardSidebar />

      <div className="lg:min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TaxRocketLogo showWordmark={false} />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Bank Intelligence
              </h1>
              <p className="text-xs text-muted-foreground">
                Detect salary, bank profit, tax payments, transfers, and
                unexplained credits from your bank statement.
              </p>
            </div>
          </div>
          {draft && (
            <Badge
              variant="outline"
              className="border-amanah/25 bg-amanah/10 text-amanah"
            >
              Tax Year {draft.taxYear}
            </Badge>
          )}
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-6">
            <Card className="shadow-sm border-gray-200">
              <CardContent className="space-y-5 p-6 sm:p-8">
                {(saveError ||
                  uploadError ||
                  classificationError ||
                  statementError) && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {classificationError ||
                      uploadError ||
                      statementError ||
                      saveError}
                  </div>
                )}

                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Upload bank statement
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload statements from multiple accounts — each is analyzed
                    separately, then combined for your filing.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.pdf,.xlsx,.xls,image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files)}
                />
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  {uploadedFileName ? (
                    <>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-amanah">
                        <CheckCircle2 className="h-4 w-4" />
                        {uploadedFileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        File saved. Non-CSV files are queued for OCR in the real
                        product.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        No bank statement uploaded yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You can still add rows manually below if needed.
                      </p>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 bg-[#376952] hover:bg-[#2e5a44] text-white"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingStatement}
                  >
                    {uploadingStatement ? (
                      <span className="animate-pulse">Uploading...</span>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        {uploadedFileName
                          ? "Replace Statement"
                          : "Upload Statement"}
                      </>
                    )}
                  </Button>
                </div>

                <div className="rounded-xl border border-[#376952]/20 bg-[#376952]/5 p-4">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Statement balances
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enter the actual opening and closing balances from the
                      statement.
                    </p>
                  </div>
                  {statementError && (
                    <p className="mb-3 text-xs text-destructive">
                      {statementError}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Account label"
                      value={statementAccountLabel}
                      onChange={(event) =>
                        setStatementAccountLabel(event.target.value)
                      }
                      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Opening balance"
                      value={statementOpeningBalance}
                      onChange={(event) =>
                        setStatementOpeningBalance(event.target.value)
                      }
                      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Closing balance"
                      value={statementClosingBalance}
                      onChange={(event) =>
                        setStatementClosingBalance(event.target.value)
                      }
                      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={statementPeriodStart}
                        onChange={(event) =>
                          setStatementPeriodStart(event.target.value)
                        }
                        className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                      />
                      <input
                        type="date"
                        value={statementPeriodEnd}
                        onChange={(event) =>
                          setStatementPeriodEnd(event.target.value)
                        }
                        className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveStatement}
                    disabled={savingStatement || !draftId}
                    className="mt-3 gap-2"
                  >
                    {savingStatement ? "Saving..." : "Save Statement Balances"}
                  </Button>
                </div>

                <div className="border-t pt-5">
                  <div className="mb-1 flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4 text-amanah" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Add a transaction manually
                    </h3>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Can&apos;t upload a statement right now? Add rows one at a
                    time instead — no file or special formatting needed.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-5">
                    <LabeledField label="Date">
                      <input
                        type="date"
                        value={rowDraft.date}
                        onChange={(e) =>
                          setRowDraft((p) => ({ ...p, date: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-200 bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#376952]"
                      />
                    </LabeledField>
                    <LabeledField label="Description" className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="e.g. Salary transfer"
                        value={rowDraft.description}
                        onChange={(e) =>
                          setRowDraft((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#376952]"
                      />
                    </LabeledField>
                    <LabeledField label="Debit (out)">
                      <input
                        type="number"
                        placeholder="0"
                        value={rowDraft.debit}
                        onChange={(e) =>
                          setRowDraft((p) => ({ ...p, debit: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-200 bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#376952]"
                      />
                    </LabeledField>
                    <LabeledField label="Credit (in)">
                      <input
                        type="number"
                        placeholder="0"
                        value={rowDraft.credit}
                        onChange={(e) =>
                          setRowDraft((p) => ({ ...p, credit: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-200 bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#376952]"
                      />
                    </LabeledField>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-5">
                    <LabeledField label="Balance after">
                      <input
                        type="number"
                        placeholder="0"
                        value={rowDraft.balance}
                        onChange={(e) =>
                          setRowDraft((p) => ({
                            ...p,
                            balance: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#376952]"
                      />
                    </LabeledField>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 gap-1.5"
                    disabled={!canAddRow}
                    onClick={handleAddRow}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                  </Button>
                  {!canAddRow && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Fill in a date and either a debit or credit amount to add
                      this row.
                    </p>
                  )}

                  {rows.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-gray-700">
                            {rows.length} row{rows.length > 1 ? "s" : ""} added
                          </p>
                          {savingRows && (
                            <span className="text-[11px] text-gray-500">
                              Saving...
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {draftId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 text-xs border-gray-200"
                              onClick={handleClassifyTransactions}
                              disabled={classifying || savingRows}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {classifying ? "Classifying..." : "Classify"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs border-gray-200"
                            onClick={handleExportCsv}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Export CSV
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-white shadow-sm text-gray-500">
                            <tr>
                              <th className="px-3 py-2 font-medium">Date</th>
                              <th className="px-3 py-2 font-medium">
                                Description
                              </th>
                              <th className="px-3 py-2 font-medium">Debit</th>
                              <th className="px-3 py-2 font-medium">Credit</th>
                              <th className="px-3 py-2 font-medium">Balance</th>
                              <th className="px-3 py-2 font-medium">
                                Suggestion
                              </th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {rows.map((row, index) => (
                              <tr key={index}>
                                <td className="px-3 py-2 text-gray-700">
                                  {row.date || "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-700">
                                  {row.description || "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-700">
                                  {row.debit || "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-700">
                                  {row.credit || "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-700">
                                  {row.balance || "—"}
                                </td>
                                <td className="px-3 py-2">
                                  {row.classificationStatus === "SUGGESTED" ? (
                                    <Badge
                                      variant="outline"
                                      className="border-amanah/25 bg-amanah/10 text-amanah"
                                    >
                                      {row.suggestedEntryType} ·{" "}
                                      {row.suggestedCategory}
                                    </Badge>
                                  ) : row.classificationStatus ===
                                    "APPROVED" ? (
                                    <Badge
                                      variant="outline"
                                      className="border-blue-200 bg-blue-50 text-blue-700"
                                    >
                                      Approved · Ledger
                                    </Badge>
                                  ) : row.classificationStatus ===
                                    "REJECTED" ? (
                                    <Badge
                                      variant="outline"
                                      className="border-red-200 bg-red-50 text-red-600"
                                    >
                                      Rejected
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-400">
                                      Unreviewed
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {row.id &&
                                      row.classificationStatus ===
                                        "SUGGESTED" && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleReviewTransaction(
                                                row.id!,
                                                "APPROVE",
                                              )
                                            }
                                            disabled={
                                              reviewingTransactionId === row.id
                                            }
                                            aria-label="Approve suggestion"
                                            title="Approve suggestion and create ledger entry"
                                            className="text-amanah transition-colors hover:text-amanah/70 disabled:opacity-50"
                                          >
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleReviewTransaction(
                                                row.id!,
                                                "REJECT",
                                              )
                                            }
                                            disabled={
                                              reviewingTransactionId === row.id
                                            }
                                            aria-label="Reject suggestion"
                                            title="Reject suggestion"
                                            className="text-red-500 transition-colors hover:text-red-400 disabled:opacity-50"
                                          >
                                            <XCircle className="h-3.5 w-3.5" />
                                          </button>
                                        </>
                                      )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRow(index)}
                                      aria-label="Remove row"
                                      className="text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowCsvPaste((v) => !v)}
                    className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    {showCsvPaste ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {showCsvPaste
                      ? "Hide"
                      : "Have many rows? Paste CSV text instead"}
                  </button>
                  {showCsvPaste && (
                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-xs text-gray-500">
                        Advanced option — paste CSV-style rows (Date,
                        Description, Debit, Credit, Balance), one per line.
                      </p>
                      <textarea
                        value={pastedRows}
                        onChange={(e) => setPastedRows(e.target.value)}
                        placeholder={
                          "Date,Description,Debit,Credit,Balance\n2026-06-30,Salary transfer,,250000,880000"
                        }
                        rows={4}
                        className="w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#376952]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="mt-2 gap-2"
                        disabled={pastedRows.trim().length === 0}
                        onClick={handleImportCsvPaste}
                      >
                        Import Pasted Rows
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <MiniInfoCard
                icon={ArrowLeftRight}
                title="Classifies transactions"
                desc="Salary, bank profit, tax payments, own-account transfers, and cash movement — detected automatically."
              />
              <MiniInfoCard
                icon={Landmark}
                title="Feeds Mizan"
                desc="Closing balance and unexplained credits carry straight into wealth reconciliation."
              />
              <MiniInfoCard
                icon={Download}
                title="Exportable"
                desc="Export the transaction list as CSV any time after adding rows."
              />
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <WizardSummaryPanel rows={summaryRows} title="Filing Summary" />

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-gray-800">
                  Open bank risk flags
                </h3>
              </div>
              {riskFlags.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-[#376952]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  No open bank risk flags.
                </p>
              ) : (
                <div className="space-y-3">
                  {riskFlags.map((flag) => (
                    <div
                      key={flag.id}
                      className="rounded-xl border border-red-200 bg-red-50 p-3"
                    >
                      <Badge
                        variant="outline"
                        className="mb-1.5 border-red-200 bg-white text-xs text-red-600"
                      >
                        open
                      </Badge>
                      <p className="text-sm font-medium text-gray-800">
                        {flag.label}
                      </p>
                      <p className="mt-0.5 text-xs text-red-600/80">
                        {flag.detail}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <Banknote className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  Recent bank activity
                </p>
                <p className="text-xs text-gray-500">
                  {importedCount > 0
                    ? `${importedCount} row(s) ready.`
                    : uploadedFileName
                      ? `${uploadedFileName} uploaded, awaiting analysis.`
                      : "No bank activity yet."}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function LabeledField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-[11px] font-medium text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function MiniInfoCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#376952]/10 text-[#376952]">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{desc}</p>
    </div>
  );
}

export default function BankIntelligencePage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-gray-500">Loading…</div>
      }
    >
      <BankIntelligenceContent />
    </Suspense>
  );
}