import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  const drafts = user
    ? await prisma.filingDraft.findMany({
        where: {
          userId: user.id,
          status: { in: ["FILED", "APPROVED_FOR_FILING"] },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <DashboardSidebar />

      <div className="space-y-6 lg:min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Filing History</h1>
            <p className="mt-1 text-sm text-gray-500">
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
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="font-medium text-gray-800">
                    Tax Year {draft.taxYear}
                  </div>
                  <div className="mt-1 text-xs capitalize text-gray-500">
                    Status: {draft.status.replace(/_/g, " ")}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Updated {draft.updatedAt.toLocaleDateString("en-PK")}
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
