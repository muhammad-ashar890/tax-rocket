-- CreateTable
CREATE TABLE "FilingPacket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingDraftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "packetHash" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "fileUrl" TEXT,
    "taxPayable" REAL NOT NULL DEFAULT 0,
    "refundDue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FilingPacket_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingPacket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FilingPacket_userId_idx" ON "FilingPacket"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FilingPacket_filingDraftId_version_key" ON "FilingPacket"("filingDraftId", "version");
