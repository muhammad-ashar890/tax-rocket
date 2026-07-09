// app/tax/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  TaxpayerDashboard,
  type ActiveFilingSummary,
  type RecentActivityItem,
} from "@/components/tax/taxpayer-dashboard";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { DashboardInfoPanel } from "@/components/tax/dashboard-info-panel";
import { listDrafts } from "@/lib/demo-store";

export default function TaxDashboardPage() {
  const { data: session } = useSession();

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

      // Dynamic Activity Log with varied times and text
      const activities: RecentActivityItem[] = drafts.map((d, index) => {
        const timeAgo =
          index === 0 ? "Just now" : index === 1 ? "2 hours ago" : "Yesterday";
        const actionText =
          d.currentStep > 0
            ? `Updated filing for TY ${d.taxYear}`
            : `Started new filing for TY ${d.taxYear}`;
        return {
          id: d.id,
          label: actionText,
          timestamp: timeAgo,
          icon: d.currentStep > 5 ? "check" : "note",
        };
      });
      setRecentActivity(activities);
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

  const displayName = session?.user?.name || "Taxpayer";
  const userEmail = session?.user?.email || "No email";

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
      </div>

      <DashboardInfoPanel
        displayName={displayName}
        email={userEmail}
        taxYear={taxYear}
        primaryFiling={primaryFiling}
        hasApprovedFiling={hasApprovedFiling}
      />
    </div>
  );
}
