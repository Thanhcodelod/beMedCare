-- Persist in-call chat for audit + reload-survival
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_appointment_id_created_at_idx"
  ON "chat_messages" ("appointment_id", "created_at");

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit timestamp for when video/voice call ended (independent from
-- appointment.status — doctor still has to explicitly complete with form).
ALTER TABLE "appointments"
  ADD COLUMN "call_ended_at" TIMESTAMP(3);
