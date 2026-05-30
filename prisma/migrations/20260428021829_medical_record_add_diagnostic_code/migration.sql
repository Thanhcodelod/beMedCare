-- AlterTable: schema declared diagnostic_code but no migration ever created it.
ALTER TABLE "medical_records" ADD COLUMN "diagnostic_code" TEXT;
