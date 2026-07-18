import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { getUserDocumentsAction } from "@/app/actions/documents";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";
import { DocumentsLibrary } from "@/components/tax/documents-library";
import { authOptions } from "@/lib/auth";

export default async function DocumentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const result = await getUserDocumentsAction();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <DashboardSidebar />
      <div className="min-w-0">
        <DocumentsLibrary
          initialDocuments={result.success ? result.documents : []}
        />
      </div>
    </div>
  );
}
