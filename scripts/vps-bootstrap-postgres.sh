#!/bin/bash
# One-time: migrate legacy cms.sqlite on VPS -> local PostgreSQL, set DATABASE_URL.
# Run on VPS only (invoked by bootstrap-vps-db.ps1).
set -eu

APP_DIR="${APP_DIR:-/var/www/real-estate-ai-cms}"
SQLITE_PATH="${SQLITE_PATH:-$APP_DIR/data/cms.sqlite}"
DB_NAME="${DB_NAME:-real_estate_ai}"
DB_USER="${DB_USER:-real_estate_ai}"

cd "$APP_DIR"

if [ ! -f "$SQLITE_PATH" ]; then
  echo "Legacy file not found: $SQLITE_PATH" >&2
  exit 1
fi

if grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r')"
  echo "Using existing DATABASE_URL from .env"
else
  DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
  echo "==> Create PostgreSQL role/database"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"
  echo "DATABASE_URL=$DATABASE_URL"
fi

echo "==> Persist DATABASE_URL to .env"
if grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" .env
else
  echo "DATABASE_URL=$DATABASE_URL" >> .env
fi

echo "==> Apply Prisma schema"
npm install prisma@5.22.0 @prisma/client@5.22.0 --no-save >/dev/null 2>&1 || true
DATABASE_URL="$DATABASE_URL" npx prisma@5.22.0 db push --accept-data-loss --force-reset

echo "==> Import legacy SQLite data via Python"
python3 - "$SQLITE_PATH" "$DATABASE_URL" <<'PY'
import json
import sqlite3
import sys
from datetime import datetime

sqlite_path, database_url = sys.argv[1], sys.argv[2]
database_url = database_url.split('?')[0]

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'psycopg2-binary'])
    import psycopg2
    import psycopg2.extras

def parse_dt(value):
    if not value:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return datetime.utcnow()

def build_search_text(record):
    if isinstance(record, str):
        record = json.loads(record)
    parts = [
        record.get('title'), record.get('name'), record.get('type'), record.get('location'),
        record.get('description'), record.get('rich_description'), record.get('internal_notes'),
        record.get('legal_status'), record.get('direction'), record.get('area'), record.get('price'),
        record.get('road_width'), record.get('budget'), record.get('status'), record.get('sale_status'),
        record.get('phone'), record.get('email'), record.get('source'), record.get('interested_area'),
        record.get('property_type'), record.get('notes'), record.get('ai_summary'),
        *(record.get('selling_points') or []),
    ]
    return ' '.join(str(p) for p in parts if p)

src = sqlite3.connect(sqlite_path)
src.row_factory = sqlite3.Row
dst = psycopg2.connect(database_url)
cur = dst.cursor()

tables = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print('SQLite tables:', ', '.join(tables))

for table in [
    'lead_tags', 'lead_events', 'lead_sources', 'lead_scores', 'leads',
    'generated_contents', 'chat_history', 'public_chat_guests', 'cms_records',
    'users', 'companies', 'settings',
]:
    try:
        cur.execute(f'TRUNCATE TABLE "{table}" CASCADE')
    except Exception:
        dst.rollback()
        cur = dst.cursor()

for row in src.execute('SELECT * FROM companies'):
    cur.execute(
        'INSERT INTO companies (id, data, created_at, updated_at) VALUES (%s, %s::jsonb, %s, %s)',
        (row['id'], row['data'], parse_dt(row['created_at']), parse_dt(row['updated_at']))
    )

for row in src.execute('SELECT * FROM users'):
    cur.execute(
        'INSERT INTO users (id, email, role, company_id, data, created_at, updated_at) VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s)',
        (row['id'], row['email'], row['role'], row['company_id'], row['data'], parse_dt(row['created_at']), parse_dt(row['updated_at']))
    )

for row in src.execute('SELECT * FROM cms_records'):
    data = json.loads(row['data'])
    cur.execute(
        '''INSERT INTO cms_records
        (collection, id, company_id, owner_user_id, sale_status, status, data, search_text, created_at, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)''',
        (row['collection'], row['id'], row['company_id'], row['owner_user_id'], row['sale_status'], row['status'],
         row['data'], build_search_text(data), parse_dt(row['created_at']), parse_dt(row['updated_at']))
    )

for row in src.execute('SELECT * FROM settings'):
    cur.execute(
        'INSERT INTO settings (key, data, updated_at) VALUES (%s, %s::jsonb, %s)',
        (row['key'], row['data'], parse_dt(row['updated_at']))
    )

for row in src.execute('SELECT * FROM chat_history'):
    cur.execute(
        'INSERT INTO chat_history (id, user_id, company_id, role, message, created_at) VALUES (%s,%s,%s,%s,%s,%s)',
        (row['id'], row['user_id'], row['company_id'], row['role'], row['message'], parse_dt(row['created_at']))
    )

for row in src.execute('SELECT * FROM public_chat_guests'):
    cur.execute(
        '''INSERT INTO public_chat_guests
        (session_id, name, phone, customer_id, ai_enabled, created_at, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s)''',
        (row['session_id'], row['name'], row['phone'], row['customer_id'], bool(row['ai_enabled']),
         parse_dt(row['created_at']), parse_dt(row['updated_at']))
    )

for row in src.execute('SELECT * FROM generated_contents'):
    cur.execute(
        '''INSERT INTO generated_contents
        (id, company_id, user_id, property_id, property_title, channel, raw_content, verified_content, status, created_at, verified_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        (row['id'], row['company_id'], row['user_id'], row['property_id'], row['property_title'], row['channel'],
         row['raw_content'], row['verified_content'], row['status'], parse_dt(row['created_at']),
         parse_dt(row['verified_at']) if row['verified_at'] else None)
    )

if 'leads' in tables:
    for row in src.execute('SELECT * FROM leads'):
        cur.execute(
            '''INSERT INTO leads
            (id, name, phone, email, city, interest_type, budget_range, source, channel,
             utm_source, utm_medium, utm_campaign, page_path, magnet_slug, investor_score, status,
             access_token, emails_sent, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (row['id'], row['name'], row['phone'], row['email'], row['city'], row['interest_type'], row['budget_range'],
             row['source'], row['channel'], row['utm_source'], row['utm_medium'], row['utm_campaign'], row['page_path'],
             row['magnet_slug'], row['investor_score'], row['status'], row['access_token'], row['emails_sent'],
             parse_dt(row['created_at']), parse_dt(row['updated_at']))
        )

if 'lead_scores' in tables:
    for row in src.execute('SELECT * FROM lead_scores'):
        cur.execute(
            'INSERT INTO lead_scores (id, lead_id, total_score, breakdown, created_at) VALUES (%s,%s,%s,%s::jsonb,%s)',
            (row['id'], row['lead_id'], row['total_score'], row['breakdown'], parse_dt(row['created_at']))
        )

if 'lead_sources' in tables:
    for row in src.execute('SELECT * FROM lead_sources'):
        cur.execute(
            '''INSERT INTO lead_sources
            (id, lead_id, channel, referrer, landing_page, utm_source, utm_medium, utm_campaign, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (row['id'], row['lead_id'], row['channel'], row.get('referrer'), row.get('landing_page'),
             row['utm_source'], row['utm_medium'], row['utm_campaign'], parse_dt(row['created_at']))
        )

if 'lead_events' in tables:
    for row in src.execute('SELECT * FROM lead_events'):
        cur.execute(
            'INSERT INTO lead_events (id, lead_id, session_id, event_type, event_data, page_path, created_at) VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s)',
            (row['id'], row['lead_id'], row['session_id'], row['event_type'], row['event_data'], row['page_path'], parse_dt(row['created_at']))
        )

if 'lead_tags' in tables:
    for row in src.execute('SELECT * FROM lead_tags'):
        try:
            cur.execute(
                'INSERT INTO lead_tags (id, lead_id, tag, created_at) VALUES (%s,%s,%s,%s)',
                (row['id'], row['lead_id'], row['tag'], parse_dt(row['created_at']))
            )
        except Exception:
            pass

dst.commit()
cur.close()
dst.close()
src.close()
print('Import OK')
PY

echo "==> Restart PM2"
pm2 restart real-estate-ai-cms --update-env || true

echo "VPS PostgreSQL bootstrap complete."
