"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TaxpayerDashboard,
  type ActiveFilingSummary,
  type RecentActivityItem,
} from "@/components/tax/taxpayer-dashboard";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { DashboardInfoPanel } from "@/components/tax/dashboard-info-panel";
import { clearAllDrafts, listDrafts } from "@/lib/demo-store";

// 3-column dashboard layout (left nav sidebar / center content / right
// info panel), styled after the Befiler reference the user shared —
// functional-only, no marketing/video/blog sections, no pricing cards,
// per the earlier decision. The center column (<TaxpayerDashboard>)
// keeps its exact original prop contract; the two new side columns are
// separate components composed here so nothing about the center
// component's public API changed.
export default function TaxDashboardPage() {
  const [filings, setFilings] = useState<ActiveFilingSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>(
    [],
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      const drafts = listDrafts();
      setFilings(
        drafts
          .filter((d) => d.status !== "approved_for_filing")
          .map((d) => ({
            id: d.id,
            taxYear: d.taxYear,
            currentStep: d.currentStep,
            taxpayerName: d.taxpayerName,
          })),
      );
      // One recent-activity row per draft (most recent first), instead
      // of always the same single hard-coded entry — so this actually
      // reflects however many filings exist in the demo store.
      setRecentActivity(
        drafts.map((d) => ({
          id: d.id,
          label: `Filing draft created for TY ${d.taxYear}`,
          timestamp: "Just now",
          icon: "note" as const,
        })),
      );
      setLoaded(true);
    };
    sync();
    window.addEventListener("taxrocket-demo-drafts-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("taxrocket-demo-drafts-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!loaded) return null;

  const displayName = "TX Dev";
  const primaryFiling = filings[0] ?? null;
  const hasApprovedFiling = false;
  const taxYear = primaryFiling?.taxYear ?? new Date().getFullYear();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_280px]">
      <DashboardSidebar />

      <div className="space-y-3 lg:min-w-0">
        <TaxpayerDashboard
          displayName={displayName}
          activeDraftCount={filings.length}
          approvedDraftCount={0}
          activeFilings={filings}
          recentActivity={recentActivity}
        />

        {/* Demo-only utility — lets you reset the localStorage-backed demo
            store after testing the wizard repeatedly, so the dashboard
            doesn't accumulate dozens of leftover draft filings. This has
            no equivalent in the real product (a real user's filing list
            is just their actual filings) — remove this button entirely
            once wired to a real backend. */}
        {filings.length > 0 && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => {
                if (
                  confirm(
                    `Clear all ${filings.length} demo filing(s)? This only affects this browser's demo data.`,
                  )
                ) {
                  clearAllDrafts();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear demo data ({filings.length})
            </Button>
          </div>
        )}
      </div>

      <DashboardInfoPanel
        displayName={displayName}
        email="tx.dev@example.com"
        taxYear={taxYear}
        primaryFiling={primaryFiling}
        hasApprovedFiling={hasApprovedFiling}
      />
    </div>
  );
}
