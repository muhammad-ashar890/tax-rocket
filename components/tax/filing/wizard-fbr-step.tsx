"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepHeading } from "@/components/tax/wizard-ui";

type WizardFbrStepProps = Readonly<{
  draftId?: string;
}>;

export function WizardFbrStep({ draftId }: WizardFbrStepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="File with FBR"
        description="Confirm payment, then launch the supervised FBR Connect agent."
      />

      <div className="rounded-xl border border-amanah/20 bg-amanah/5 p-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amanah/10 text-amanah">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <p className="font-semibold text-foreground">
          FBR Connect — supervised filing
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your local Trusted Desktop Agent connects to Iris on your own machine.
          You'll personally enter any OTP, CAPTCHA, or PIN.
        </p>
        <Button asChild className="mt-4 gap-2">
          <a
            href={
              draftId
                ? `/tax/fbr-connect?draftId=${draftId}`
                : "/tax/fbr-connect"
            }
          >
            Launch FBR Connect <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
