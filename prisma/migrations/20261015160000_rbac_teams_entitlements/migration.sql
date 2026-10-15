-- ==============================================================================
-- Migration: 20261015160000_rbac_teams_entitlements
-- Purpose: Add Team, TeamMember, TeamPermissionOverride, RolePermission, Entitlement
-- Rollback note:
--   DROP TABLE IF EXISTS "entitlements";
--   DROP TABLE IF EXISTS "role_permissions";
--   DROP TABLE IF EXISTS "team_permission_overrides";
--   DROP TABLE IF EXISTS "team_members";
--   DROP TABLE IF EXISTS "teams";
--   ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
--   ALTER TABLE "users" DROP COLUMN IF EXISTS "token_version";
--   ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code";
--   ALTER TABLE "users" DROP COLUMN IF EXISTS "status";
-- ==============================================================================

-- 1. Alter Users table with non-destructive columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_key" ON "users"("referral_code") WHERE "referral_code" IS NOT NULL;

-- 2. Teams table
CREATE TABLE IF NOT EXISTS "teams" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lead_user_id" TEXT NOT NULL UNIQUE,
  "referral_code" TEXT NOT NULL UNIQUE,
  "is_platform_root" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index: Only one team can have is_platform_root = true across the entire platform
CREATE UNIQUE INDEX IF NOT EXISTS "teams_platform_root_idx" ON "teams"("is_platform_root") WHERE "is_platform_root" = true;

-- 3. Team Members table
CREATE TABLE IF NOT EXISTS "team_members" (
  "team_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL,
  "approved_by" TEXT,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("team_id", "user_id")
);

-- 4. Team Permission Overrides table (only narrows permissions, never widens)
CREATE TABLE IF NOT EXISTS "team_permission_overrides" (
  "team_id" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  PRIMARY KEY ("team_id", "permission_key")
);

-- 5. Role Permissions table (Default permission matrix)
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_key" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "premium_only" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("role_key", "permission_key")
);

-- 6. Entitlements table (Premium entitlements for user or team)
CREATE TABLE IF NOT EXISTS "entitlements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "features" JSONB NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "granted_by" TEXT
);

CREATE INDEX IF NOT EXISTS "entitlements_subject_type_subject_id_idx" ON "entitlements"("subject_type", "subject_id");

-- 7. Add team_id and listing_source to cms_records
ALTER TABLE "cms_records" ADD COLUMN IF NOT EXISTS "team_id" TEXT;
ALTER TABLE "cms_records" ADD COLUMN IF NOT EXISTS "listing_source" TEXT;
CREATE INDEX IF NOT EXISTS "cms_records_collection_team_id_idx" ON "cms_records"("collection", "team_id");
