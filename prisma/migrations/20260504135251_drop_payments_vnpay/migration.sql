-- VNPay payments are replaced by SePay orders. Drop the payments table
-- and the now-unused PaymentStatus enum.
DROP TABLE IF EXISTS "payments";
DROP TYPE IF EXISTS "PaymentStatus";
