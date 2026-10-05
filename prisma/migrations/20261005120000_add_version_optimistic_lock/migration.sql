-- AlterTable User add version
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable CmsRecord add version
ALTER TABLE "cms_records" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
