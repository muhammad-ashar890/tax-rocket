-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "cnic" TEXT,
    "ntn" TEXT,
    "phone" TEXT,
    "dateOfBirth" DATETIME,
    "address" TEXT,
    "city" TEXT,
    "defaultTaxYear" INTEGER,
    "notificationPreferences" TEXT NOT NULL DEFAULT '{}',
    "practicePreferences" TEXT NOT NULL DEFAULT '{}',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("address", "city", "cnic", "dateOfBirth", "defaultTaxYear", "email", "emailVerified", "id", "image", "name", "ntn", "phone") SELECT "address", "city", "cnic", "dateOfBirth", "defaultTaxYear", "email", "emailVerified", "id", "image", "name", "ntn", "phone" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_cnic_key" ON "User"("cnic");
CREATE UNIQUE INDEX "User_ntn_key" ON "User"("ntn");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
