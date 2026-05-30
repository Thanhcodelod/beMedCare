-- Persist SOS emergency calls (was in-memory Map → lost on restart,
-- no atomic accept, no multi-instance support).
CREATE TYPE "SosStatus" AS ENUM ('WAITING', 'ACCEPTED', 'CANCELLED');

CREATE TABLE "sos_calls" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_socket_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SosStatus" NOT NULL DEFAULT 'WAITING',
    "doctor_user_id" TEXT,
    "appointment_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sos_calls_room_id_key" ON "sos_calls" ("room_id");
CREATE UNIQUE INDEX "sos_calls_appointment_id_key" ON "sos_calls" ("appointment_id");
CREATE INDEX "sos_calls_status_created_at_idx" ON "sos_calls" ("status", "created_at");

ALTER TABLE "sos_calls"
  ADD CONSTRAINT "sos_calls_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
