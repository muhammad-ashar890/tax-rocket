-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FilingPacket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingDraftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "packetHash" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" DATETIME,
    "approvedByUserId" TEXT,
    "fileUrl" TEXT,
    "taxPayable" REAL NOT NULL DEFAULT 0,
    "refundDue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FilingPacket_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingPacket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FilingPacket" ("createdAt", "fileUrl", "filingDraftId", "id", "packetHash", "refundDue", "snapshotJson", "status", "taxPayable", "userId", "version") SELECT "createdAt", "fileUrl", "filingDraftId", "id", "packetHash", "refundDue", "snapshotJson", "status", "taxPayable", "userId", "version" FROM "FilingPacket";
DROP TABLE "FilingPacket";
ALTER TABLE "new_FilingPacket" RENAME TO "FilingPacket";
CREATE INDEX "FilingPacket_userId_idx" ON "FilingPacket"("userId");
CREATE UNIQUE INDEX "FilingPacket_filingDraftId_version_key" ON "FilingPacket"("filingDraftId", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
