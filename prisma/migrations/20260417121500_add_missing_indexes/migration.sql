-- DoctorDetails: public search filters on (is_verified=true) first, then
-- narrows by specialization.
CREATE INDEX IF NOT EXISTS "doctor_details_is_verified_specialization_idx"
  ON "doctor_details" ("is_verified", "specialization");

-- Appointments: replace single-column patient_id index with composite
-- that also supports "patient history sorted by date desc".
DROP INDEX IF EXISTS "appointments_patient_id_idx";
CREATE INDEX IF NOT EXISTS "appointments_patient_id_appointment_date_idx"
  ON "appointments" ("patient_id", "appointment_date");

-- Doctor's daily + status filter (PENDING / CONFIRMED / COMPLETED)
DROP INDEX IF EXISTS "appointments_doctor_id_appointment_date_idx";
CREATE INDEX IF NOT EXISTS "appointments_doctor_id_appointment_date_status_idx"
  ON "appointments" ("doctor_id", "appointment_date", "status");

-- MedicalRecord had no indexes on FK columns. Both lookups are
-- "ordered by created_at desc" which benefits from the composite.
CREATE INDEX IF NOT EXISTS "medical_records_patient_id_created_at_idx"
  ON "medical_records" ("patient_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "medical_records_doctor_id_created_at_idx"
  ON "medical_records" ("doctor_id", "created_at" DESC);

-- LeaveRequests: status is frequently filtered with (doctor_id, date)
DROP INDEX IF EXISTS "leave_requests_doctor_id_date_idx";
CREATE INDEX IF NOT EXISTS "leave_requests_doctor_id_date_status_idx"
  ON "leave_requests" ("doctor_id", "date", "status");
