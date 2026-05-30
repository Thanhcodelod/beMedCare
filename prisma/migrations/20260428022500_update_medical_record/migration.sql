-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'WAITING_FOR_RESULTS';
ALTER TYPE "AppointmentStatus" ADD VALUE 'DISCHARGED';

-- CreateTable
CREATE TABLE "health_metrics" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "heart_rate" INTEGER,
    "blood_pressure" TEXT,
    "temperature" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,

    CONSTRAINT "health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_metrics_patient_id_date_idx" ON "health_metrics"("patient_id", "date");

-- AddForeignKey
ALTER TABLE "health_metrics" ADD CONSTRAINT "health_metrics_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
