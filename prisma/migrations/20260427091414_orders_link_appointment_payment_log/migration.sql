-- Order → Appointment optional link (so PAID webhook can auto-confirm)
ALTER TABLE "orders" ADD COLUMN "appointment_id" TEXT;

CREATE INDEX "orders_appointment_id_idx" ON "orders"("appointment_id");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Audit trail for SePay webhook deliveries
CREATE TABLE "payment_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_logs_order_id_idx" ON "payment_logs"("order_id");

ALTER TABLE "payment_logs"
  ADD CONSTRAINT "payment_logs_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
