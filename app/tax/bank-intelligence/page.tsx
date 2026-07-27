"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  getActiveFilingOptionsAction,
  getFilingDraftAction,
} from "@/app/actions/filing";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { WizardBankIntelligenceStep } from "@/components/tax/filing/wizard-bank-intelligence-step";
import { Card, CardContent } from "@/components/ui/card";

type ActiveFiling = {
  id: string;
  taxYear: number;
  status: string;
  updatedAt: string;
};

function BankIntelligencePageContent() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  const [activeFilings, setActiveFilings] = useState<ActiveFiling[]>([]);
  const [taxYear, setTaxYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(draftId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!draftId) {
      getActiveFilingOptionsAction().then((result) => {
        if (!mounted) return;
        if (result.success) {
          setActiveFilings(result.filings as ActiveFiling[]);
        } else {
          setError(result.error ?? "Failed to load active filings");
        }
      });
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    getFilingDraftAction(draftId).then((result) => {
      if (!mounted) return;
      setLoading(false);
      if (result.success && result.draft) {
        setTaxYear(result.draft.taxYear);
      } else {
        setError(result.error ?? "Filing draft not found");
      }
    });

    return () => {
      mounted = false;
    };
  }, [draftId]);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_1fr]">
      <DashboardSidebar />
      <main className="min-w-0">
        {loading ? (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">
              Loading filing...
            </CardContent>
          </Card>
        ) : draftId && taxYear ? (
          <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-6 rounded-lg border border-amanah/20 bg-amanah/5 p-3 text-sm text-amanah">
              Standalone workspace for the selected filing. Documents are
              uploaded and extracted from the Documents page.
            </div>
            <WizardBankIntelligenceStep draftId={draftId} taxYear={taxYear} />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h1 className="text-xl font-semibold text-foreground">
                  Select a filing
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose an active filing before managing bank balances and
                  transactions.
                </p>
                {error && (
                  <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
              </CardContent>
            </Card>

            {activeFilings.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeFilings.map((filing) => (
                  <a
                    key={filing.id}
                    href={`/tax/bank-intelligence?draftId=${filing.id}`}
                    className="rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-amanah/40 hover:bg-amanah/5"
                  >
                    <p className="font-semibold text-foreground">
                      Tax Year {filing.taxYear}
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {filing.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-3 text-xs text-amanah">Open filing →</p>
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No active filings found.
              </div>
            )}
          </div>
        )}
      </main>
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
      <BankIntelligencePageContent />
    </Suspense>
  );
}
