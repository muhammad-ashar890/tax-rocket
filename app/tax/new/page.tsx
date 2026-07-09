"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FilingWizard } from "@/components/tax/filing-wizard";

// The entire filing journey — Setup questions, Upload, Ledgers,
// Reconciliation, Review, Filing Packet, Approval, FBR Connect — lives
// inside <FilingWizard> as one continuous rail. This page's only job is
// to supply the real `createAction` (called exactly once, the moment
// "Create Filing" is pressed) and, if a `?draftId=` query param is
// present (e.g. from the dashboard's "Continue Filing" link), tell the
// wizard to resume straight into the pipeline phase for that draft.
function NewFilingPageContent() {
  const searchParams = useSearchParams();
  const resumeDraftId = searchParams.get("draftId") ?? undefined;

  // Matches the exact `(formData: FormData) => Promise<void>` contract the
  // real `createAction` server action would have. In your real project
  // this is your existing server action that creates a TaxFilingDraft row
  // — nothing about its contract needs to change for this component.
  async function createAction(formData: FormData) {
    // Demo: no-op beyond what FilingWizard itself does with the local
    // draft record. In production this is where you'd persist the real
    // TaxFilingDraft via your backend.
    void formData;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <FilingWizard createAction={createAction} resumeDraftId={resumeDraftId} />
    </div>
  );
}

export default function NewFilingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <NewFilingPageContent />
    </Suspense>
  );
}
