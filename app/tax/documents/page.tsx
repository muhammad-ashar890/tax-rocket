"use client";

import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";

// Standalone Documents page — reachable from the site nav / dashboard
// quick link. Kept visually consistent with the rest of the redesigned
// product (logo header, card style) instead of the old horizontal
// FilingProgress bar layout.
export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <TaxRocketLogo showWordmark={false} />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Documents</h1>
          <p className="text-xs text-muted-foreground">
            All your uploaded documents across filings, in one place.
          </p>
        </div>
      </div>

      <Card className="mt-6 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Document vault goes here
          </p>
          <p className="text-xs text-muted-foreground">
            (Demo placeholder — wire in real TaxDocumentVault +
            BatchUploadWrapper here)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
