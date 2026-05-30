-- Drop any anonymous dev-test orders that were created before this column
-- existed. Safe for dev; don't reuse this migration in prod as-is.
DELETE FROM "orders";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "user_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- AddForeignKey
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
