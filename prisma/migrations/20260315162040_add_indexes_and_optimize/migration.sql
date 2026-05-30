-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_idx" ON "appointments"("doctor_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_date_idx" ON "appointments"("appointment_date");

-- CreateIndex
CREATE INDEX "doctor_details_specialization_idx" ON "doctor_details"("specialization");

-- CreateIndex
CREATE INDEX "schedules_doctor_id_date_idx" ON "schedules"("doctor_id", "date");
