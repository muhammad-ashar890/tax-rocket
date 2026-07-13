-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingDraftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryDate" DATETIME,
    "entryType" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceDocumentId" TEXT,
    "sourceTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LedgerEntry_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LedgerEntry_filingDraftId_idx" ON "LedgerEntry"("filingDraftId");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_idx" ON "LedgerEntry"("userId");

-- CreateIndex
CREATE INDEX "LedgerEntry_entryType_idx" ON "LedgerEntry"("entryType");
