-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('ONLINE', 'OFFLINE', 'EMERGENCY');

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_PROGRESS';

-- DropIndex
DROP INDEX "appointments_appointment_date_idx";

-- DropIndex
DROP INDEX "appointments_doctor_id_idx";

-- DropIndex
DROP INDEX "schedules_doctor_id_date_idx";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "appointment_type" "AppointmentType" NOT NULL DEFAULT 'OFFLINE',
ALTER COLUMN "appointment_date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "schedules" ALTER COLUMN "date" SET DATA TYPE DATE;

-- CreateIndex
CREATE INDEX "appointments_doctor_id_appointment_date_idx" ON "appointments"("doctor_id", "appointment_date");

-- CreateIndex
CREATE INDEX "appointments_schedule_id_start_time_idx" ON "appointments"("schedule_id", "start_time");

-- CreateIndex
CREATE INDEX "schedules_date_idx" ON "schedules"("date");
