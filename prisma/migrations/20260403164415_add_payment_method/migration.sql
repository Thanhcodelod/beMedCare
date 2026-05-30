/*
  Warnings:

  - Added the required column `updated_at` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ADVANCE_PAYMENT', 'PAYMENT_AT_CLINIC');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'ADVANCE_PAYMENT',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
