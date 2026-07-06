"use client";

import Link from "next/link";

import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderOpen,
  Link2,
  Rocket,
  Scale,
  Sparkles,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  WorkflowKpiCard,
  WorkflowKpiStrip,
} from "@/components/tax/workflow-page-shell";
import {
  FilingProgressPill,
  type FilingStep,
} from "@/components/tax/filing-progress";

/**
 * TaxpayerDashboard — the CENTER column of the dashboard (left nav
 * sidebar and right info panel now live in their own components,
 * `DashboardSidebar` / `DashboardInfoPanel`, composed together by
 * `app/tax/dashboard/page.tsx` into the 3-column Befiler-style layout).
 *
 * ⚠️ Backend contract — unchanged, additive-only:
 *   - `displayName`, `activeDraftCount`, `approvedDraftCount` keep the exact
 *     same names, types, and defaults as before, so every existing
 *     `<TaxpayerDashboard displayName={...} activeDraftCount={...} approvedDraftCount={...} />`
 *     call site keeps compiling with zero changes.
 *   - New props are all optional with safe fallbacks, so passing nothing
 *     extra reproduces a sensible (if less rich) dashboard.
 *
 * Mobile fix: recent-activity rows were overflowing on narrow screens
 * because the activity icon, label, and timestamp were all in a single
 * `flex items-center` row.  Below `sm` each row now stacks vertically
 * (icon + label on top, timestamp below, indented past the icon) so
 * even long timestamps never overflow the screen.
 */

export type RecentActivityItem = {
  id: string;
  label: string;
  timestamp: string; // pre-formatted string, formatting stays a server concern
  icon?: "upload" | "review" | "approve" | "file" | "note";
};

export type ActiveFilingSummary = {
  id: string;
  taxYear: number;
  currentStep: FilingStep;
  taxpayerName?: string | null;
};

type TaxpayerDashboardProps = {
  displayName: string;
  activeDraftCount?: number;
  approvedDraftCount?: number;
  /** Optional richer data — safe to omit, dashboard degrades gracefully. */
  activeFilings?: ActiveFilingSummary[];
  recentActivity?: RecentActivityItem[];
  isPractitioner?: boolean;
  clientCount?: number;
};

const activityIconMap: Record<
  NonNullable<RecentActivityItem["icon"]>,
  React.ElementType
> = {
  upload: Upload,
  review: FileText,
  approve: CheckCircle2,
  file: Rocket,
  note: Sparkles,
};

export function TaxpayerDashboard({
  displayName,
  activeDraftCount = 0,
  approvedDraftCount = 0,
  activeFilings = [],
  recentActivity = [],
  isPractitioner = false,
  clientCount,
}: TaxpayerDashboardProps) {
  const hasActiveFiling = activeDraftCount > 0;
  const hasApprovedFiling = approvedDraftCount > 0;
  const firstName = displayName.split(" ")[0] || displayName;
  const primaryFiling = activeFilings[0];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Warm welcome hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-amanah/10 via-card to-card p-6 shadow-sm md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amanah/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-col md:items-start md:justify-between">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="mb-3 border-amanah/25 bg-amanah/10 text-amanah"
            >
              <Sparkles className="mr-1.5 h-3 w-3" />
              {isPractitioner ? "Practitioner Daftar" : "Your Tax Daftar"}
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
              Hello, {firstName}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">
              {hasActiveFiling
                ? "Filing your tax return doesn't have to be stressful. Answer a few simple questions, upload your documents, and TaxRocket takes care of the rest."
                : "Filing your tax return doesn't have to be stressful. Answer a few simple questions, upload your documents, and TaxRocket takes care of the rest."}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row md:shrink-0">
            {hasActiveFiling ? (
              <Button asChild size="lg" className="gap-2 shadow-sm">
                <Link
                  href={
                    primaryFiling
                      ? `/tax/new?draftId=${primaryFiling.id}`
                      : "/tax/new"
                  }
                >
                  Continue Filing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="gap-2 shadow-sm">
                <Link href="/tax/new">
                  <Rocket className="h-4 w-4" />
                  Start New Filing
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href="/tax/guide">
                How it works
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Live progress preview of the primary active filing, right inside the hero. */}
        {primaryFiling && (
          <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                Tax Year {primaryFiling.taxYear}
                {primaryFiling.taxpayerName
                  ? ` · ${primaryFiling.taxpayerName}`
                  : ""}
              </p>
              <FilingProgressPill currentStep={primaryFiling.currentStep} />
            </div>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-amanah"
            >
              <Link href={`/tax/new?draftId=${primaryFiling.id}`}>
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </section>

      {/* ── Status KPI strip ──────────────────────────────────────── */}
      <WorkflowKpiStrip>
        <WorkflowKpiCard
          label="Active filings"
          value={String(activeDraftCount)}
          sub={
            hasActiveFiling ? "In progress right now" : "None yet — start below"
          }
          accent="amanah"
        />
        <WorkflowKpiCard
          label="Ready to file"
          value={String(approvedDraftCount)}
          sub={
            hasApprovedFiling
              ? "Approved & packet-ready"
              : "Approve a packet to unlock"
          }
          accent="mizan"
        />
        <WorkflowKpiCard
          label="Recent activity"
          value={String(recentActivity.length)}
          sub={
            recentActivity.length
              ? "Events in the last few days"
              : "Nothing yet"
          }
        />
        {isPractitioner ? (
          <WorkflowKpiCard
            label="Clients"
            value={String(clientCount ?? 0)}
            sub="Managed under your Daftar"
            accent="indus"
          />
        ) : (
          <WorkflowKpiCard
            label="Tax year"
            value={String(new Date().getFullYear())}
            sub="Default for new filings"
          />
        )}
      </WorkflowKpiStrip>

      {/* ── Primary CTA cards ─────────────────────────────────────── */}
      <section className="grid items-start gap-4 md:grid-cols-1">
        {hasActiveFiling ? (
          <Card className="border-amanah/25 bg-amanah/5 transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-amanah/10 p-2.5 text-amanah">
                  <FileText className="h-5 w-5" />
                </div>
                <Badge
                  variant="outline"
                  className="border-amanah/25 bg-amanah/10 text-amanah"
                >
                  {activeDraftCount} active
                </Badge>
              </div>
              <CardTitle className="mt-3 text-lg">
                Continue your filing
              </CardTitle>
              <CardDescription>
                You have {activeDraftCount} filing
                {activeDraftCount > 1 ? "s" : ""} in progress. Pick up right
                where you left off — nothing to redo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full gap-2">
                <Link
                  href={
                    primaryFiling
                      ? `/tax/new?draftId=${primaryFiling.id}`
                      : "/tax/new"
                  }
                >
                  Go to Filing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amanah/25 bg-amanah/5 transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="rounded-xl bg-amanah/10 p-2.5 text-amanah w-fit">
                <Rocket className="h-5 w-5" />
              </div>
              <CardTitle className="mt-3 text-lg">
                Start your first tax filing
              </CardTitle>
              <CardDescription>
                Takes about 5 minutes to set up. Answer a few simple questions,
                then upload your documents — our AI does the heavy lifting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full gap-2">
                <Link href="/tax/new">
                  <Upload className="h-4 w-4" />
                  Start Filing
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Recent activity ───────────────────────────────────────── */}
      {recentActivity.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity
          </h2>
          <Card>
            <CardContent className="divide-y p-0">
              {recentActivity.slice(0, 6).map((item) => {
                const Icon = activityIconMap[item.icon ?? "note"];
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-center sm:gap-3"
                  >
                    {/* Icon + label — always in one row */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                    </div>

                    {/* Timestamp: on mobile sits below label (indented past
                        the icon), on desktop stays inline at the end */}
                    <span className="flex items-center gap-1 self-start pl-11 text-xs text-muted-foreground sm:shrink-0 sm:self-auto sm:pl-0">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      {item.timestamp}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function QuickLinkCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amanah/30 hover:shadow-md"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amanah/10 text-amanah transition-colors group-hover:bg-amanah/15">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}
