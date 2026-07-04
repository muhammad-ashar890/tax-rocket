"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";
import { WizardSummaryPanel } from "@/components/tax/wizard-ui";
import { getDraft, type DemoFilingDraft } from "@/lib/demo-store";

// Standalone Bank Intelligence page — reachable from the dashboard's
// left nav. This is the bank-statement review workspace: detect
// salary, bank profit, tax payments, own-account transfers, cash
// movement, and unexplained credits from an uploaded statement (or a
// manual fallback when parsing fails), feeding straight into the
// wizard's Reconciliation step.
//
// Per direct feedback on the reference screenshot: the "Open risk
// flags" list there mixed bank-specific issues (unresolved
// reconciliation gap) with completely unrelated ones (missing rent
// agreement, missing CNIC/NICOP) under a heading that specifically said
// "unexplained credit issues" — a mismatch. This version only shows
// risk flags that are actually about the bank/reconciliation side of
// the filing. Unrelated document checklist items (CNIC, rent
// agreement, etc.) belong on the Documents page, not here.
//
// Layout fix: the reference screenshot buried the actual work (upload /
// manual-entry box) below two large explanation-only cards. Here the
// upload + manual workspace comes first; explanatory copy is folded
// into short captions instead of full cards.
//
// Fix (per direct feedback, round 1): "Upload Statement" was a dead
// button — now wired to a real file picker (CSV files get auto-parsed).
// Export CSV button added.
//
// Fix (per direct feedback, round 2):
//  - Export CSV lived only in the page header, easy to miss on first
//    visit. It's now duplicated right next to the imported rows table
//    where the data actually is, so it's impossible to miss once rows
//    exist.
//  - The manual entry was one big single CSV-style textarea, which
//    forces a normal user to know CSV syntax (commas, exact column
//    order) — not beginner-friendly. Replaced the primary manual path
//    with simple individual fields (Date / Description / Debit /
//    Credit / Balance) plus an "Add Row" button and an editable rows
//    table. The old CSV-paste textarea is kept only as a collapsed
//    "Paste CSV instead" advanced option for anyone who already has
//    rows in that format — not the first thing a beginner sees.
const DEMO_RECONCILIATION_GAP = 184500;

type BankRow = {
  date: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
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
  const [draft, setDraft] = useState<DemoFilingDraft | null>(null);

  const [rowDraft, setRowDraft] = useState<BankRow>(emptyRowDraft);
  const [rows, setRows] = useState<BankRow[]>([]);
  const [showCsvPaste, setShowCsvPaste] = useState(false);
  const [pastedRows, setPastedRows] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (draftId) setDraft(getDraft(draftId));
  }, [draftId]);

  const reconciliationResolved = draft?.reconciliation ?? null;
  const importedCount = rows.length;
  const canAddRow =
    rowDraft.date.trim().length > 0 &&
    (rowDraft.debit.trim() || rowDraft.credit.trim());

  // Only bank/reconciliation-relevant risk flags — no unrelated document
  // checklist items (those belong on the Documents page).
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
        { label: "Taxpayer", value: draft.taxpayerName },
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

  function handleFileSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    // Demo-only: real parsing would run OCR/CSV extraction on the file here.
    // For CSV files, try to actually read + import the rows so the demo feels real.
    if (file.name.toLowerCase().endsWith(".csv")) {
      file
        .text()
        .then((text) => setRows((prev) => [...prev, ...parseCsvRows(text)]));
    }
  }

  function handleAddRow() {
    if (!canAddRow) return;
    setRows((prev) => [...prev, rowDraft]);
    setRowDraft(emptyRowDraft);
  }

  function handleRemoveRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleImportCsvPaste() {
    const parsed = parseCsvRows(pastedRows);
    if (parsed.length === 0) return;
    setRows((prev) => [...prev, ...parsed]);
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
    <div className="mx-auto max-w-6xl">
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
          {/* ── The actual work, front and center ── */}
          <Card className="shadow-sm">
            <CardContent className="space-y-5 p-6 sm:p-8">
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
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadedFileName ? "Replace Statement" : "Upload Statement"}
                </Button>
              </div>

              {/* ── Beginner-friendly manual entry: one field per column, not a CSV blob ── */}
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
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                        setRowDraft((p) => ({ ...p, balance: e.target.value }))
                      }
                      className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

                {/* ── Rows table + inline Export, right where the data is ── */}
                {rows.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-xl border">
                    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">
                        {rows.length} row{rows.length > 1 ? "s" : ""} added
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={handleExportCsv}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-card text-muted-foreground">
                          <tr>
                            <th className="px-3 py-1.5 font-medium">Date</th>
                            <th className="px-3 py-1.5 font-medium">
                              Description
                            </th>
                            <th className="px-3 py-1.5 font-medium">Debit</th>
                            <th className="px-3 py-1.5 font-medium">Credit</th>
                            <th className="px-3 py-1.5 font-medium">Balance</th>
                            <th className="px-3 py-1.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {rows.map((row, index) => (
                            <tr key={index}>
                              <td className="px-3 py-1.5 text-foreground">
                                {row.date || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-foreground">
                                {row.description || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-foreground">
                                {row.debit || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-foreground">
                                {row.credit || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-foreground">
                                {row.balance || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(index)}
                                  aria-label="Remove row"
                                  className="text-muted-foreground hover:text-risk"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Advanced fallback, collapsed by default: paste CSV-style text ── */}
                <button
                  type="button"
                  onClick={() => setShowCsvPaste((v) => !v)}
                  className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
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
                  <div className="mt-2 rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Advanced option — paste CSV-style rows (Date, Description,
                      Debit, Credit, Balance), one per line.
                    </p>
                    <textarea
                      value={pastedRows}
                      onChange={(e) => setPastedRows(e.target.value)}
                      placeholder={
                        "Date,Description,Debit,Credit,Balance\n2026-06-30,Salary transfer,,250000,880000"
                      }
                      rows={4}
                      className="w-full rounded-lg border bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

          {/* ── What this feature does, kept short — not competing with the work above ── */}
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

          {/* ── Only bank/reconciliation-relevant risk flags ── */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-risk" />
              <h3 className="text-sm font-semibold text-foreground">
                Open bank risk flags
              </h3>
            </div>
            {riskFlags.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-amanah">
                <CheckCircle2 className="h-3.5 w-3.5" />
                No open bank risk flags.
              </p>
            ) : (
              <div className="space-y-3">
                {riskFlags.map((flag) => (
                  <div
                    key={flag.id}
                    className="rounded-xl border border-risk/25 bg-risk/5 p-3"
                  >
                    <Badge
                      variant="outline"
                      className="mb-1.5 border-risk/30 bg-risk/10 text-xs text-risk"
                    >
                      open
                    </Badge>
                    <p className="text-sm font-medium text-foreground">
                      {flag.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {flag.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Banknote className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Recent bank activity
              </p>
              <p className="text-xs text-muted-foreground">
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
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
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
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-amanah/10 text-amanah">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

export default function BankIntelligencePage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <BankIntelligenceContent />
    </Suspense>
  );
}
