-- CreateTable
CREATE TABLE IF NOT EXISTS "license_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "max_devices" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "license_devices" (
    "id" TEXT NOT NULL,
    "license_key_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "license_keys_key_hash_key" ON "license_keys"("key_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "license_keys_user_id_idx" ON "license_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "license_devices_license_key_id_device_id_key" ON "license_devices"("license_key_id", "device_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "license_devices_device_id_idx" ON "license_devices"("device_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'license_devices_license_key_id_fkey'
    ) THEN
        ALTER TABLE "license_devices" ADD CONSTRAINT "license_devices_license_key_id_fkey" FOREIGN KEY ("license_key_id") REFERENCES "license_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
