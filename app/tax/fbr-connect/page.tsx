"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";
import { WizardSummaryPanel } from "@/components/tax/wizard-ui";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { getDraft, type DemoFilingDraft } from "@/lib/demo-store";

function FbrConnectContent() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  const [draft, setDraft] = useState<DemoFilingDraft | null>(null);

  useEffect(() => {
    if (draftId) setDraft(getDraft(draftId));
  }, [draftId]);

  const summaryRows = draft
    ? [
        { label: "Tax year", value: String(draft.taxYear) },
        { label: "Taxpayer", value: draft.taxpayerName },
        { label: "Filer", value: draft.filerType.replace(/_/g, " ") },
        { label: "Status", value: draft.status.replace(/_/g, " ") },
      ]
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* Sidebar added here */}
      <DashboardSidebar />

      <div className="lg:min-w-0">
        <div className="flex items-center gap-3">
          <TaxRocketLogo showWordmark={false} />
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              FBR Connect
            </h1>
            <p className="text-xs text-muted-foreground">
              Supervised filing hand-off to FBR Iris.
            </p>
          </div>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_280px]">
          <Card className="shadow-sm">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                  File with FBR
                </h2>
                <p className="text-sm text-muted-foreground sm:text-base">
                  A local agent on your own computer connects securely to FBR
                  Iris. You stay in control of every OTP, CAPTCHA, and PIN.
                </p>
              </div>

              <div className="rounded-xl border border-[#376952]/20 bg-[#376952]/5 p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#376952]/10 text-[#376952]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="font-semibold text-foreground">
                  You're always supervising
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  TaxRocket never sees or stores your OTP, CAPTCHA, or PIN.
                  Everything sensitive happens locally, in front of you.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  Local Trusted Desktop Agent connection status
                  {draftId ? ` for filing ${draftId}` : ""} goes here.
                </p>
                <p className="text-xs text-muted-foreground">
                  (Demo placeholder — wire in real agent-status polling +
                  Playwright automation trigger here)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  className="gap-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Connect to Iris
                </Button>
              </div>
            </CardContent>
          </Card>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <WizardSummaryPanel rows={summaryRows} title="Filing Summary" />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function FbrConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <FbrConnectContent />
    </Suspense>
  );
}
