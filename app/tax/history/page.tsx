import { PrismaClient } from "@prisma/client";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";

const prisma = new PrismaClient();

export default async function HistoryPage() {
  // Fetch filed/completed drafts from database
  const drafts = await prisma.filingDraft.findMany({
    where: {
      // Ab hum yahan approved filings bhi dikhayenge demo ke liye
      status: { in: ["FILED", "APPROVED_FOR_FILING"] },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <DashboardSidebar />

      <div className="space-y-6 lg:min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Filing History</h1>
            <p className="text-sm text-gray-500 mt-1">
              View your past, completed, and submitted filings.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-gray-500">No completed filings yet.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className="border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="font-medium text-gray-800">
                    Tax Year {d.taxYear}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Status: {d.status.replace(/_/g, " ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
