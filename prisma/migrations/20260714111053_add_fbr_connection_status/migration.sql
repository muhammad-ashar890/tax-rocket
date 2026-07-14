-- CreateTable
CREATE TABLE "FbrConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingDraftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "agentId" TEXT,
    "message" TEXT,
    "errorMessage" TEXT,
    "lastHeartbeat" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FbrConnection_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FbrConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FbrConnection_filingDraftId_key" ON "FbrConnection"("filingDraftId");

-- CreateIndex
CREATE INDEX "FbrConnection_userId_idx" ON "FbrConnection"("userId");

-- CreateIndex
CREATE INDEX "FbrConnection_status_idx" ON "FbrConnection"("status");
