import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Rocket } from "lucide-react";
import { getServerSession } from "next-auth/next";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import {
  FilingHistoryList,
  type FilingHistoryItem,
} from "@/components/tax/filing-history-list";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  const drafts = user
    ? await prisma.filingDraft.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          filingPackets: {
            where: { status: { not: "SUPERSEDED" } },
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              fileUrl: true,
              approvalStatus: true,
              taxPayable: true,
              refundDue: true,
            },
          },
        },
      })
    : [];

  const filings: FilingHistoryItem[] = drafts.map((draft) => {
    const packet = draft.filingPackets[0] ?? null;
    const taxCalculationReady = draft.taxCalculationStatus === "ESTIMATE";
    const reconciliationReady =
      draft.reconciliationStatus === "RESOLVED" &&
      Math.abs(draft.reconciliationGap ?? 0) <= 0.01;
    const approvalIsCurrent =
      draft.status === "APPROVED_FOR_FILING" &&
      draft.packetApprovalConfirmed &&
      taxCalculationReady &&
      reconciliationReady &&
      packet?.approvalStatus === "APPROVED";

    return {
      id: draft.id,
      taxYear: draft.taxYear,
      // Never display a stale APPROVED_FOR_FILING status when the current
      // draft still needs rules or reconciliation. The wizard is the source
      // of truth for the current filing state.
      status: approvalIsCurrent
        ? "APPROVED_FOR_FILING"
        : draft.taxCalculationStatus === "NEEDS_RULES"
          ? "NEEDS_RULES"
          : "IN_PROGRESS",
      filerType: draft.filerType,
      updatedAt: draft.updatedAt.toISOString(),
      packet: packet
        ? {
            ...packet,
            // Do not show a stored zero as a real tax result when the current
            // calculation is pending route-specific rules.
            taxPayable:
              approvalIsCurrent && taxCalculationReady
                ? packet.taxPayable
                : null,
            refundDue:
              approvalIsCurrent && taxCalculationReady
                ? packet.refundDue
                : null,
          }
        : null,
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <DashboardSidebar />

      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amanah/10 text-amanah">
              <History className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Filing History
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                View and reopen your saved, approved, and filed returns.
              </p>
            </div>
          </div>
          <Button asChild className="gap-2">
            <Link href="/tax/new">
              <Rocket className="h-4 w-4" />
              Start New Filing
            </Link>
          </Button>
        </div>

        <FilingHistoryList initialFilings={filings} />
      </div>
    </div>
  );
}
