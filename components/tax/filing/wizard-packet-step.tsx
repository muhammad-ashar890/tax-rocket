"use client";

import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  WorkflowKpiCard,
  WorkflowKpiStrip,
} from "@/components/tax/workflow-page-shell";
import { StepHeading } from "@/components/tax/wizard-ui";

type FilingPacketSummary = {
  id: string;
  version: number;
  packetHash: string;
  status: string;
  taxPayable: number;
  refundDue: number;
  pdfUrl?: string | null;
};

type WizardPacketStepProps = Readonly<{
  draftId?: string;
  filingPacket: FilingPacketSummary | null;
  filingSummary: {
    reconciliationGap: number | null;
    taxableIncome: number | null;
    taxPayable: number | null;
    refundDue: number | null;
    taxCalculationStatus: string;
  } | null;
  generatingPacket: boolean;
  generatingPdf: boolean;
  packetError: string | null;
  onGeneratePacket: () => void;
  onGeneratePdf: () => void;
}>;

export function WizardPacketStep({
  draftId,
  filingPacket,
  filingSummary,
  generatingPacket,
  generatingPdf,
  packetError,
  onGeneratePacket,
  onGeneratePdf,
}: WizardPacketStepProps) {
  const taxCalculationReady =
    filingSummary?.taxCalculationStatus === "ESTIMATE";
  const money = (value: number | null | undefined) =>
    !taxCalculationReady || value === null || value === undefined
      ? "Pending"
      : `PKR ${value.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="min-w-0">
          <StepHeading
            title="Your filing packet"
            description="Generate an immutable snapshot of your current filing data before approval."
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            onClick={onGeneratePacket}
            disabled={generatingPacket || !draftId}
            className="gap-2 bg-[#376952] text-white hover:bg-[#2e5a44]"
          >
            {generatingPacket ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {generatingPacket
              ? "Generating..."
              : filingPacket
                ? "Generate New Version"
                : "Generate Packet Snapshot"}
          </Button>

          {filingPacket &&
            (filingPacket.pdfUrl ? (
              <Button type="button" variant="outline" asChild className="gap-2">
                <a href={filingPacket.pdfUrl} download>
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onGeneratePdf}
                disabled={generatingPdf}
                className="gap-2"
              >
                {generatingPdf && <Loader2 className="h-4 w-4 animate-spin" />}
                {generatingPdf ? "Generating PDF..." : "Generate PDF"}
              </Button>
            ))}
        </div>
      </div>

      {packetError && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {packetError}
        </div>
      )}

      <WorkflowKpiStrip maxColumns={2}>
        <WorkflowKpiCard
          label="Packet version"
          value={filingPacket ? `v${filingPacket.version}` : "Not generated"}
        />
        <WorkflowKpiCard
          label="Packet hash"
          value={
            filingPacket ? `${filingPacket.packetHash.slice(0, 12)}…` : "—"
          }
          sub="SHA-256 snapshot fingerprint"
        />
        <WorkflowKpiCard
          label="Tax payable"
          value={money(filingSummary?.taxPayable)}
          accent="amanah"
        />
        <WorkflowKpiCard
          label="Refund due"
          value={money(filingSummary?.refundDue)}
          accent="amanah"
        />
        <WorkflowKpiCard
          label="Reconciliation gap"
          value={
            filingSummary?.reconciliationGap === null ||
            filingSummary?.reconciliationGap === undefined
              ? "Pending"
              : `PKR ${Math.abs(filingSummary.reconciliationGap).toLocaleString()}`
          }
          accent="mizan"
        />
      </WorkflowKpiStrip>

      {filingPacket && (
        <div className="rounded-xl border border-amanah/20 bg-amanah/5 p-4 text-sm text-amanah">
          Packet snapshot v{filingPacket.version} generated successfully.
          Approval can now be reviewed against this exact version.
        </div>
      )}
    </div>
  );
}
