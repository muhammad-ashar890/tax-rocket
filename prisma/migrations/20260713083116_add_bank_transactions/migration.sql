-- CreateTable
CREATE TABLE "BankTransaction" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransaction_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankTransaction_filingDraftId_idx" ON "BankTransaction"("filingDraftId");

-- CreateIndex
CREATE INDEX "BankTransaction_userId_idx" ON "BankTransaction"("userId");
