#!/bin/bash
set -e
cd /var/www/real-estate-ai-cms
set -a
. ./.env
set +a
DB_URL="${DATABASE_URL%%\?*}"
psql "$DB_URL" -c '\d agent_api_credentials'
