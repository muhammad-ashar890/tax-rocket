"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  Rocket,
} from "lucide-react";
import Link from "next/link";

import { approveFilingDraftAction } from "@/app/actions/filing";
import { ApprovalPacket } from "@/components/tax/approval-packet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type FilingHistoryItem = {
  id: string;
  taxYear: number;
  status: string;
  filerType: string | null;
  updatedAt: string;
  packet: {
    id: string;
    version: number;
    fileUrl: string | null;
    approvalStatus: string;
    taxPayable: number;
    refundDue: number;
  } | null;
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "FILED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "APPROVED_FOR_FILING") {
    return "border-amanah/25 bg-amanah/10 text-amanah";
  }
  return "border-[#B8872F]/35 bg-[#B8872F]/10 text-[#8A641F]";
}

export function FilingHistoryList({
  initialFilings,
}: {
  initialFilings: FilingHistoryItem[];
}) {
  const [filings, setFilings] = useState(initialFilings);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApproval(filingId: string) {
    setApprovingId(filingId);
    setError(null);

    const result = await approveFilingDraftAction(filingId);
    setApprovingId(null);

    if (!result.success) {
      setError(result.error ?? "Failed to approve filing");
      return;
    }

    setFilings((previous) =>
      previous.map((filing) =>
        filing.id === filingId
          ? {
              ...filing,
              status: "APPROVED_FOR_FILING",
              packet: filing.packet
                ? { ...filing.packet, approvalStatus: "APPROVED" }
                : filing.packet,
            }
          : filing,
      ),
    );
    setExpandedId(null);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {filings.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">No filings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a filing to see it appear here.
          </p>
        </div>
      ) : (
        filings.map((filing) => {
          const packet = filing.packet;
          const canApprove =
            Boolean(packet) && packet?.approvalStatus !== "APPROVED";
          const isExpanded = expandedId === filing.id;

          return (
            <article
              key={filing.id}
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">
                        Tax Year {filing.taxYear}
                      </h2>
                      <Badge
                        variant="outline"
                        className={statusClass(filing.status)}
                      >
                        {statusLabel(filing.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      Updated{" "}
                      {new Date(filing.updatedAt).toLocaleDateString("en-PK")}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                    >
                      <Link href={`/tax/new?draftId=${filing.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Filing
                      </Link>
                    </Button>
                    {filing.status === "APPROVED_FOR_FILING" && (
                      <Button asChild size="sm" className="gap-1.5">
                        <Link href={`/tax/fbr-connect?draftId=${filing.id}`}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          FBR Connect
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Filer</p>
                    <p className="mt-1 text-sm font-medium capitalize">
                      {(filing.filerType ?? "Not selected").replaceAll(
                        "_",
                        " ",
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Latest packet
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {packet ? `v${packet.version}` : "Not generated"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tax payable</p>
                    <p className="mt-1 text-sm font-medium">
                      {packet
                        ? `PKR ${packet.taxPayable.toLocaleString()}`
                        : "Pending"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  {packet?.fileUrl ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                    >
                      <a href={`/api/packets/${packet.id}`} download>
                        <FileText className="h-3.5 w-3.5" />
                        Download Packet
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No PDF packet yet
                    </span>
                  )}

                  {canApprove && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : filing.id)
                      }
                      className="gap-1.5"
                    >
                      {isExpanded ? "Close Approval" : "Review & Approve"}
                      <Rocket className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && packet && (
                <div className="border-t bg-background">
                  <ApprovalPacket
                    draftId={filing.id}
                    initialApproved={packet.approvalStatus === "APPROVED"}
                    packetVersion={packet.version}
                    onApprovalChange={(checked) => {
                      if (checked) void handleApproval(filing.id);
                    }}
                    showGenerateButton={false}
                  />
                  {approvingId === filing.id && (
                    <div className="flex items-center gap-2 px-6 pb-5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
                      approval...
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
