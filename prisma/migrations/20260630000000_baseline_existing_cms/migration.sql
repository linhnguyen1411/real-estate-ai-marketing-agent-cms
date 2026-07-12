-- Baseline for production CMS schema that existed before Prisma Migrate history.
-- Tables (cms_records, leads, facebook_*, blog_*, etc.) were created historically
-- via prisma db push. This migration is intentionally a no-op and must be marked
-- applied with: npx prisma migrate resolve --applied 20260630000000_baseline_existing_cms
-- before migrate deploy applies agent platform migrations.

SELECT 1;
