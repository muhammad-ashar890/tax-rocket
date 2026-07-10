"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FilingWizard } from "@/components/tax/filing-wizard";

import {
  createFilingDraftAction,
  updateFilingDraftAction,
} from "@/app/actions/filing";

function NewFilingPageContent() {
  const searchParams = useSearchParams();
  const resumeDraftId = searchParams.get("draftId") ?? undefined;

  async function createAction(formData: FormData) {
    // Calling the REAL Server Action that writes to our SQLite database
    const result = await createFilingDraftAction(formData);

    if (!result.success) {
      console.error("Failed to save to database");
    }

    return result; // RETURN the result back so wizard can grab the draftId
  }

  async function handleAutoSave(formData: FormData) {
    if (!resumeDraftId) return;

    const parsedData: any = {};
    const filerType = formData.get("filerType");
    if (filerType) parsedData.filerType = filerType;

    const businessStructure = formData.get("businessStructure");
    if (businessStructure) parsedData.businessStructure = businessStructure;

    const salaryPercentage = formData.get("salaryPercentage");
    if (salaryPercentage) parsedData.salaryPercentage = salaryPercentage;

    const incomeSources = formData.getAll("incomeSources");
    if (incomeSources.length > 0) parsedData.incomeSources = incomeSources;

    const readinessCompleted = formData.getAll("readinessCompleted");
    if (readinessCompleted.length > 0)
      parsedData.readinessCompleted = readinessCompleted;

    await updateFilingDraftAction(resumeDraftId, parsedData);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <FilingWizard
        createAction={createAction as any}
        resumeDraftId={resumeDraftId}
        onAutoSave={handleAutoSave}
      />
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
