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
      image: true,
      defaultTaxYear: true,
    },
  });

  const drafts = user
    ? await prisma.filingDraft.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          documents: {
            select: { extractionStatus: true },
          },
          bankTransactions: {
            select: { classificationStatus: true },
          },
          filingPackets: {
            where: { status: { not: "SUPERSEDED" } },
            orderBy: { version: "desc" },
            take: 1,
            select: { approvalStatus: true },
          },
        },
      })
    : [];

  const notifications = user
    ? await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  const unreadNotificationCount = user
    ? await prisma.notification.count({
        where: { userId: user.id, isRead: false },
      })
    : 0;

  function getPipelineStartIndex(draft: (typeof drafts)[number]) {
    let setupStepCount = 1; // Who is filing?
    const incomeSources = (() => {
      try {
        const parsed = JSON.parse(draft.incomeSources);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })();
    const needsIncomeSourceSelection =
      draft.filerType === "myself" ||
      (draft.filerType === "my_business" &&
        draft.businessStructure === "sole_proprietor");

    if (draft.filerType === "my_business") setupStepCount += 1;
    if (needsIncomeSourceSelection) setupStepCount += 1;
    if (
      needsIncomeSourceSelection &&
      incomeSources.includes("salary") &&
      incomeSources.length >= 2
    ) {
      setupStepCount += 1;
    }

    // Setup steps plus the Review & create step.
    return setupStepCount + 3;
  }

  const isCurrentlyApproved = (draft: (typeof drafts)[number]) => {
    if (draft.status === "FILED") return true;

    const documentsReady = draft.documents.every((document) =>
      ["COMPLETED", "MAPPED"].includes(document.extractionStatus),
    );
    const transactionsReady = draft.bankTransactions.every((transaction) =>
      ["APPROVED", "REJECTED", "TRANSFER", "CASH_MOVEMENT"].includes(
        transaction.classificationStatus,
      ),
    );

    return (
      draft.status === "APPROVED_FOR_FILING" &&
      draft.packetApprovalConfirmed &&
      draft.taxCalculationStatus === "ESTIMATE" &&
      draft.reconciliationStatus === "RESOLVED" &&
      Math.abs(draft.reconciliationGap ?? 0) <= 0.01 &&
      documentsReady &&
      transactionsReady &&
      draft.filingPackets[0]?.approvalStatus === "APPROVED"
    );
  };

  const activeDrafts = drafts.filter((draft) => !isCurrentlyApproved(draft));
  const approvedDrafts = drafts.filter((draft) => isCurrentlyApproved(draft));

  const dashboardStatus = (draft: (typeof drafts)[number]) => {
    if (isCurrentlyApproved(draft)) return draft.status;
    if (draft.taxCalculationStatus === "NEEDS_RULES") return "NEEDS_RULES";
    return "IN_PROGRESS";
  };

  const dashboardStepLabel = (draft: (typeof drafts)[number]) => {
    if (isCurrentlyApproved(draft)) return "File";

    const pipelineOffset = draft.currentStep - getPipelineStartIndex(draft);
    if (pipelineOffset >= 7) return "File";
    if (pipelineOffset >= 5) return "Approve";
    if (pipelineOffset >= 2) return "Review";
    if (pipelineOffset >= 0) return "Upload";
    return "Setup";
  };

  const filings: ActiveFilingSummary[] = activeDrafts.map((draft) => ({
    id: draft.id,
    taxYear: draft.taxYear,
    currentStep: draft.currentStep,
    pipelineStartIndex: getPipelineStartIndex(draft),
    currentStepLabel: dashboardStepLabel(draft),
    status: dashboardStatus(draft),
    taxpayerName: user?.name,
    reconciliationStatus: draft.reconciliationStatus,
  }));

  const approvedFilings: ActiveFilingSummary[] = approvedDrafts.map(
    (draft) => ({
      id: draft.id,
      taxYear: draft.taxYear,
      currentStep: draft.currentStep,
      pipelineStartIndex: getPipelineStartIndex(draft),
      currentStepLabel: dashboardStepLabel(draft),
      status: dashboardStatus(draft),
      taxpayerName: user?.name,
      reconciliationStatus: draft.reconciliationStatus,
    }),
  );

  const recentActivity: RecentActivityItem[] = drafts.map((draft) => ({
    id: draft.id,
    label: `Filing draft updated for TY ${draft.taxYear}`,
    timestamp: draft.updatedAt.toLocaleDateString("en-PK"),
    icon: draft.status === "FILED" ? "file" : "note",
  }));

  const displayName = user?.name || session.user?.name || "Taxpayer";
  const userEmail = user?.email || email;
  // Keep approved drafts visible so the dashboard can reopen them.
  const primaryFiling = filings[0] ?? approvedFilings[0] ?? null;
  const taxYear = primaryFiling?.taxYear ?? new Date().getFullYear();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_280px]">
      <DashboardSidebar />

      <div className="space-y-3 lg:min-w-0">
        <TaxpayerDashboard
          displayName={displayName}
          activeDraftCount={activeDrafts.length}
          approvedDraftCount={approvedDrafts.length}
          defaultTaxYear={user?.defaultTaxYear}
          activeFilings={filings}
          approvedFilings={approvedFilings}
          recentActivity={recentActivity}
        />
      </div>

      <DashboardInfoPanel
        displayName={displayName}
        email={userEmail}
        image={user?.image}
        taxYear={taxYear}
        primaryFiling={primaryFiling}
        hasApprovedFiling={approvedDrafts.length > 0}
        mizanStatus={primaryFiling?.reconciliationStatus}
        notifications={notifications.map((notification) => ({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          createdAt: notification.createdAt.toISOString(),
        }))}
        unreadNotificationCount={unreadNotificationCount}
      />
    </div>
  );
}
