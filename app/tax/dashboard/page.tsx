import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import {
  TaxpayerDashboard,
  type ActiveFilingSummary,
  type RecentActivityItem,
} from "@/components/tax/taxpayer-dashboard";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { DashboardInfoPanel } from "@/components/tax/dashboard-info-panel";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function TaxDashboardPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const drafts = user
    ? await prisma.filingDraft.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const approvedStatuses = ["APPROVED_FOR_FILING", "FILED"];
  const activeDrafts = drafts.filter(
    (draft) => !approvedStatuses.includes(draft.status),
  );
  const approvedDrafts = drafts.filter((draft) =>
    approvedStatuses.includes(draft.status),
  );

  const filings: ActiveFilingSummary[] = activeDrafts.map((draft) => ({
    id: draft.id,
    taxYear: draft.taxYear,
    currentStep: draft.currentStep,
    taxpayerName: user?.name,
  }));

  const recentActivity: RecentActivityItem[] = drafts.map((draft) => ({
    id: draft.id,
    label: `Filing draft updated for TY ${draft.taxYear}`,
    timestamp: draft.updatedAt.toLocaleDateString("en-PK"),
    icon: draft.status === "FILED" ? "file" : "note",
  }));

  const displayName = user?.name || session.user?.name || "Taxpayer";
  const userEmail = user?.email || email;
  const primaryFiling = filings[0] ?? null;
  const taxYear = primaryFiling?.taxYear ?? new Date().getFullYear();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_280px]">
      <DashboardSidebar />

      <div className="space-y-3 lg:min-w-0">
        <TaxpayerDashboard
          displayName={displayName}
          activeDraftCount={activeDrafts.length}
          approvedDraftCount={approvedDrafts.length}
          activeFilings={filings}
          recentActivity={recentActivity}
        />
      </div>

      <DashboardInfoPanel
        displayName={displayName}
        email={userEmail}
        taxYear={taxYear}
        primaryFiling={primaryFiling}
        hasApprovedFiling={approvedDrafts.length > 0}
      />
    </div>
  );
}
