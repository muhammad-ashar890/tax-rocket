"use client";

import { ApprovalPacket } from "@/components/tax/approval-packet";
import { StepHeading } from "@/components/tax/wizard-ui";

type WizardApprovalStepProps = Readonly<{
  draftId?: string;
  approvalConfirmed: boolean;
  packetVersion?: number;
  onApprovalChange: (checked: boolean) => void;
}>;

export function WizardApprovalStep({
  draftId,
  approvalConfirmed,
  packetVersion,
  onApprovalChange,
}: WizardApprovalStepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Approve your filing"
        description="Review your filing summary and provide final approval before proceeding to your filing packet."
      />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <ApprovalPacket
          draftId={draftId}
          onCancel={() => {}}
          onApprovalChange={onApprovalChange}
          showGenerateButton={false}
          initialApproved={approvalConfirmed}
          packetVersion={packetVersion ?? 1}
        />
      </div>
    </div>
  );
}
