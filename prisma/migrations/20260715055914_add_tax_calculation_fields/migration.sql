-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FilingDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "filerType" TEXT,
    "businessStructure" TEXT,
    "incomeSources" TEXT NOT NULL DEFAULT '[]',
    "salaryPercentage" TEXT,
    "readinessChecks" TEXT NOT NULL DEFAULT '[]',
    "openingWealth" REAL,
    "closingWealth" REAL,
    "taxableIncome" REAL,
    "taxWithheld" REAL,
    "taxPayable" REAL,
    "refundDue" REAL,
    "taxCalculationStatus" TEXT NOT NULL DEFAULT 'NOT_CALCULATED',
    "reconciliationGap" REAL,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "reconciliationMethod" TEXT,
    "reconciliationNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FilingDraft" ("businessStructure", "closingWealth", "createdAt", "currentStep", "filerType", "id", "incomeSources", "openingWealth", "readinessChecks", "reconciliationGap", "reconciliationMethod", "reconciliationNote", "reconciliationStatus", "refundDue", "salaryPercentage", "status", "taxPayable", "taxYear", "updatedAt", "userId") SELECT "businessStructure", "closingWealth", "createdAt", "currentStep", "filerType", "id", "incomeSources", "openingWealth", "readinessChecks", "reconciliationGap", "reconciliationMethod", "reconciliationNote", "reconciliationStatus", "refundDue", "salaryPercentage", "status", "taxPayable", "taxYear", "updatedAt", "userId" FROM "FilingDraft";
DROP TABLE "FilingDraft";
ALTER TABLE "new_FilingDraft" RENAME TO "FilingDraft";
CREATE UNIQUE INDEX "FilingDraft_userId_taxYear_key" ON "FilingDraft"("userId", "taxYear");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
