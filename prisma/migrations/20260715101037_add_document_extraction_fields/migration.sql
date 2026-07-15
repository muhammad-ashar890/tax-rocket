-- AlterTable
ALTER TABLE "Document" ADD COLUMN "extractedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "extractedData" TEXT;
ALTER TABLE "Document" ADD COLUMN "extractionError" TEXT;
ALTER TABLE "Document" ADD COLUMN "extractionProvider" TEXT;
