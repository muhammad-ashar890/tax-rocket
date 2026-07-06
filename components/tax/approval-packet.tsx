import { useState } from "react";
import { CheckSquare, ShieldCheck, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ApprovalPacket({
  draftId,
  onCancel,
}: {
  draftId?: string;
  onCancel?: () => void;
}) {
  const [isApproved, setIsApproved] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGeneratePacket = async () => {
    if (!isApproved) return;
    setIsGenerating(true);
    // Simulate generation delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsGenerating(false);
    // Here logic for actual PDF download would go
    alert(`Packet PDF generated successfully for draft ${draftId}! (Demo)`);
    if (onCancel) onCancel();
  };

  return (
    <div className="p-5 sm:p-6 bg-[#376952]/[0.02]">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-5 w-5 text-[#376952]" />
        <h2 className="text-lg font-semibold text-gray-800">
          Final Approval & Generation
        </h2>
      </div>

      <p className="text-sm text-gray-500 mb-5">
        Please review and approve the packet. Generating the packet will
        download a PDF of your complete filing.
      </p>

      {/* Unified Approval Box */}
      <div
        className={`rounded-xl border p-4 transition-colors ${
          isApproved
            ? "border-[#376952] bg-white shadow-sm"
            : "border-gray-200 bg-white"
        }`}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative flex items-center pt-0.5">
            <input
              type="checkbox"
              className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-gray-300 checked:border-[#376952] checked:bg-[#376952] transition-all"
              checked={isApproved}
              onChange={(e) => setIsApproved(e.target.checked)}
            />
            <CheckSquare className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
          </div>
          <div>
            <p
              className={`text-sm font-medium ${isApproved ? "text-[#376952]" : "text-gray-700"}`}
            >
              I have reviewed and approve this filing packet
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-3xl">
              By checking this, I confirm that I understand the tax
              payable/refund result, wealth reconciliation, and cleared risk
              items. I consent to local, user-controlled portal automation using
              this exact approved packet (v1).
            </p>
          </div>
        </label>
      </div>

      {/* Generate Action inline */}
      <div className="mt-5 flex justify-end gap-3">
        <Button
          disabled={!isApproved || isGenerating}
          onClick={handleGeneratePacket}
          className="bg-[#376952] hover:bg-[#2e5a44] text-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Generate Packet PDF
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
