-- 1. Bump column on users so JwtStrategy can invalidate old tokens after a
--    password change/reset.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);

-- 2. Single-use, time-bounded password reset tokens.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"          TEXT          NOT NULL,
  "user_id"     TEXT          NOT NULL,
  "token_hash"  TEXT          NOT NULL,
  "expires_at"  TIMESTAMP(3)  NOT NULL,
  "used_at"     TIMESTAMP(3),
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key"
  ON "password_reset_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx"
  ON "password_reset_tokens" ("user_id");

-- Used by a periodic cleanup job (and to scan-expire tokens cheaply).
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx"
  ON "password_reset_tokens" ("expires_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
