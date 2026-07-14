-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingDraftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionDate" DATETIME,
    "description" TEXT NOT NULL,
    "debit" REAL,
    "credit" REAL,
    "balance" REAL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceDocumentId" TEXT,
    "classificationStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "suggestedEntryType" TEXT,
    "suggestedCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransaction_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("balance", "createdAt", "credit", "debit", "description", "filingDraftId", "id", "source", "sourceDocumentId", "transactionDate", "updatedAt", "userId") SELECT "balance", "createdAt", "credit", "debit", "description", "filingDraftId", "id", "source", "sourceDocumentId", "transactionDate", "updatedAt", "userId" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE INDEX "BankTransaction_filingDraftId_idx" ON "BankTransaction"("filingDraftId");
CREATE INDEX "BankTransaction_userId_idx" ON "BankTransaction"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
