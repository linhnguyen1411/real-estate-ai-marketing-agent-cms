-- Store the recoverable raw license key (encrypted) so each account can
-- re-open its single key instead of receiving a newly generated key.

ALTER TABLE "license_keys" ADD COLUMN IF NOT EXISTS "key_cipher" TEXT;

-- Enforce one active key per account. Legacy duplicates (created before this
-- migration) are revoked first, keeping the newest active key.
UPDATE "license_keys"
SET "status" = 'revoked', "revoked_at" = COALESCE("revoked_at", NOW())
WHERE "status" = 'active'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("user_id") "id"
    FROM "license_keys"
    WHERE "status" = 'active'
    ORDER BY "user_id", "created_at" DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS "license_keys_user_id_active_key"
  ON "license_keys"("user_id")
  WHERE "status" = 'active';
