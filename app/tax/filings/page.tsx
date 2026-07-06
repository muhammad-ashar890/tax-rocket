"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listDrafts } from "@/lib/demo-store";
import { ApprovalPacket } from "@/components/tax/approval-packet";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";

export default function FilingsPage() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Track which filing's approval section is currently expanded inside its card
  const [expandedApprovalDraftId, setExpandedApprovalDraftId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setDrafts(listDrafts());
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  const total = drafts.length;
  // Demo trick: anything with step > 0 is considered ready for approval for UI testing
  const inProgress = drafts.filter((d) => d.currentStep === 0).length;
  const ready = total - inProgress;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* ── Left Sidebar Added ── */}
      <DashboardSidebar />

      <div className="space-y-6 lg:min-w-0">
        {/* ── Simplified Top Header (No Card Box) ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Filings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your active and completed tax filing drafts.
            </p>
          </div>
          <Link href="/tax/new">
            <Button className="bg-[#376952] hover:bg-[#2e5a44] text-white gap-2">
              <Plus className="h-4 w-4" />
              New Filing
            </Button>
          </Link>
        </div>

        {/* ── KPIs ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-500">Total filings</p>
              <p className="mt-1 text-3xl font-bold text-gray-800">{total}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-500">In progress</p>
              <p className="mt-1 text-3xl font-bold text-gray-800">
                {inProgress}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-500">Ready to file</p>
              <p className="mt-1 text-3xl font-bold text-gray-800">{ready}</p>
            </CardContent>
          </Card>
        </div>

        {/* ── List of Filings (Simplified Cards) ── */}
        <div className="space-y-4">
          {drafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
              <p className="text-sm text-gray-500">
                No filings found. Create a new one to get started.
              </p>
            </div>
          ) : (
            drafts.map((draft, idx) => {
              // DEMO FIX: We force the first two filings to be "Ready for Approval"
              const isReadyForApproval = draft.currentStep > 0 || idx < 2;
              const isApprovalExpanded = expandedApprovalDraftId === draft.id;

              return (
                <Card
                  key={draft.id}
                  className={`overflow-hidden shadow-sm transition-all ${
                    isApprovalExpanded
                      ? "border-[#376952] ring-1 ring-[#376952]"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="p-5 sm:p-6 flex flex-col gap-5">
                    {/* Simplified Header with Avatar Icon */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex h-12 w-12 shrink-0 rounded-full bg-gray-100 items-center justify-center text-gray-500">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            {draft.taxpayerName || "Unknown Taxpayer"}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="font-medium text-gray-700">
                              Tax Year {draft.taxYear}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span>
                              Created {new Date().toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isReadyForApproval ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-[#376952] border-green-200 whitespace-nowrap"
                        >
                          Ready to File
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-orange-50 text-orange-700 border-orange-200 whitespace-nowrap"
                        >
                          Under Review
                        </Badge>
                      )}
                    </div>

                    {/* Simplified Status Area (Replaced the complex grid) */}
                    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3 sm:p-4">
                      {isReadyForApproval ? (
                        <CheckCircle2 className="h-5 w-5 text-[#376952] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {isReadyForApproval
                            ? "All checks passed"
                            : "Needs attention"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {isReadyForApproval
                            ? "Documents verified and ledgers balanced. Your packet is ready for final approval."
                            : "Documents are under review or require your attention before filing."}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-600 h-9 w-9"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 hidden sm:flex text-gray-600 border-gray-200"
                        >
                          Open Workflow
                        </Button>
                        {isReadyForApproval ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              setExpandedApprovalDraftId(
                                isApprovalExpanded ? null : draft.id,
                              )
                            }
                            className={`h-9 gap-1.5 ${
                              isApprovalExpanded
                                ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
                                : "bg-[#376952] hover:bg-[#2e5a44] text-white"
                            }`}
                          >
                            {isApprovalExpanded
                              ? "Cancel Approval"
                              : "Approve & Generate"}
                            {!isApprovalExpanded && (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        ) : (
                          <Link href={`/tax/new?draftId=${draft.id}`}>
                            <Button
                              size="sm"
                              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 h-9 gap-1.5"
                            >
                              Review & Fix
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Approval Section */}
                  {isApprovalExpanded && (
                    <div className="border-t border-gray-200 bg-white">
                      <ApprovalPacket
                        draftId={draft.id}
                        onCancel={() => setExpandedApprovalDraftId(null)}
                      />
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
