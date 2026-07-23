-- Add persisted approval intent for the pre-packet approval step
ALTER TABLE "FilingDraft" ADD COLUMN "packetApprovalConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FilingDraft" ADD COLUMN "packetApprovalAt" DATETIME;
ALTER TABLE "FilingDraft" ADD COLUMN "packetApprovalByUserId" TEXT;
