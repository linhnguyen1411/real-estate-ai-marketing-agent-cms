-- Drop legacy Facebook Page Connection storage.
-- Page access token is now read exclusively from FACEBOOK_PAGE_ACCESS_TOKEN.
DROP TABLE IF EXISTS "facebook_page_connections";
