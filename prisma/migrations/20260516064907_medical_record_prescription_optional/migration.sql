-- Some appointments don't need a prescription (routine check-ups,
-- follow-ups with no medication change). Allow prescription to be NULL
-- so the doctor can mark "Không cần kê đơn" instead of being forced to
-- write a placeholder string.
ALTER TABLE "medical_records" ALTER COLUMN "prescription" DROP NOT NULL;
