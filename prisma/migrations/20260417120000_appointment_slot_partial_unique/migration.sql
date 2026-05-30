-- Partial unique index: same doctor + date + start_time cannot have more than
-- one active appointment. CANCELLED / NO_SHOW slots are free to rebook.
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_slot_active_unique"
  ON "appointments" ("doctor_id", "appointment_date", "start_time")
  WHERE "status" NOT IN ('CANCELLED', 'NO_SHOW');
