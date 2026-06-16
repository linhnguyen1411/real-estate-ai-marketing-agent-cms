import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { AppSettings } from "../src/types";

type CmsCollection = "customers" | "properties" | "posts" | "inbox" | "automations";

interface CmsDatabase {
  companies: any[];
  users: any[];
  customers: any[];
  properties: any[];
  posts: any[];
  inbox: any[];
  automations: any[];
  settings: AppSettings;
  chat_history?: any[];
  generated_contents?: any[];
}

const dataDir = path.join(process.cwd(), "data");
const sqlitePath = path.join(dataDir, "cms.sqlite");

const defaultSettings: AppSettings = {
  ai_mode:
    process.env.DEFAULT_AI_MODE === "openai"
      ? "openai"
      : process.env.DEFAULT_AI_MODE === "gemini"
        ? "gemini"
        : process.env.DEFAULT_AI_MODE === "ollama"
          ? "ollama"
          : "auto",
  ollama_endpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434",
  ollama_model: process.env.OLLAMA_MODEL || "qwen3:8b",
  openai_model: process.env.OPENAI_MODEL || "gpt-5-mini",
  agent_tone: process.env.AGENT_TONE || "sang trọng và chuyên nghiệp",
  site_view_count: 0
};

let sqlite: Database.Database | null = null;

function getSqlite() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!sqlite) {
    sqlite = new Database(sqlitePath);
    sqlite.pragma("journal_mode = WAL");
    ensureSchema(sqlite);
  }

  return sqlite;
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      company_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cms_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      owner_user_id TEXT,
      sale_status TEXT,
      status TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_cms_records_collection_company ON cms_records(collection, company_id);
    CREATE INDEX IF NOT EXISTS idx_cms_records_collection_status ON cms_records(collection, status);
    CREATE INDEX IF NOT EXISTS idx_cms_records_sale_status ON cms_records(collection, sale_status);
    CREATE VIRTUAL TABLE IF NOT EXISTS cms_records_fts USING fts5(
      collection UNINDEXED,
      id UNINDEXED,
      search_text,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company_id TEXT,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_history_company_created ON chat_history(company_id, created_at);
    CREATE TABLE IF NOT EXISTS public_chat_guests (
      session_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      customer_id TEXT,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_public_chat_guests_updated ON public_chat_guests(updated_at);
    CREATE TABLE IF NOT EXISTS generated_contents (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      user_id TEXT,
      property_id TEXT,
      property_title TEXT,
      channel TEXT NOT NULL,
      raw_content TEXT NOT NULL,
      verified_content TEXT,
      status TEXT NOT NULL DEFAULT 'raw',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_generated_company_channel ON generated_contents(company_id, channel);
    CREATE INDEX IF NOT EXISTS idx_generated_property ON generated_contents(property_id);
    CREATE INDEX IF NOT EXISTS idx_generated_status ON generated_contents(status);
    CREATE TABLE IF NOT EXISTS crawler_jobs (
      id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      start_url TEXT NOT NULL DEFAULT '',
      keyword TEXT NOT NULL DEFAULT '',
      run_interval_minutes INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'active',
      company_id TEXT,
      last_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_crawler_jobs_status ON crawler_jobs(status);
    CREATE TABLE IF NOT EXISTS crawler_results (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      phone TEXT,
      source_url TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'unknown',
      lead_id TEXT,
      company_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(phone, source_url)
    );
    CREATE INDEX IF NOT EXISTS idx_crawler_results_job ON crawler_results(job_id);
    CREATE INDEX IF NOT EXISTS idx_crawler_results_created ON crawler_results(created_at);
    CREATE TABLE IF NOT EXISTS crawler_logs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      pages_scanned INTEGER NOT NULL DEFAULT 0,
      new_leads INTEGER NOT NULL DEFAULT 0,
      duplicates INTEGER NOT NULL DEFAULT 0,
      errors TEXT NOT NULL DEFAULT '[]',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_crawler_logs_job ON crawler_logs(job_id);
  `);

  const settings = db.prepare("SELECT key FROM settings WHERE key = 'app'").get();
  if (!settings) {
    db.prepare("INSERT INTO settings (key, data, updated_at) VALUES ('app', ?, ?)")
      .run(JSON.stringify(defaultSettings), new Date().toISOString());
  }

  const indexedCount = (db.prepare("SELECT COUNT(*) count FROM cms_records_fts").get() as any).count;
  const recordCount = (db.prepare("SELECT COUNT(*) count FROM cms_records").get() as any).count;
  if (indexedCount !== recordCount) {
    const rebuild = db.transaction(() => {
      db.prepare("DELETE FROM cms_records_fts").run();
      const insert = db.prepare("INSERT INTO cms_records_fts (collection, id, search_text) VALUES (?, ?, ?)");
      const rows = db.prepare("SELECT collection, id, data FROM cms_records").all() as any[];
      rows.forEach(row => insert.run(row.collection, row.id, buildSearchText(JSON.parse(row.data))));
    });
    rebuild();
  }
}

function buildSearchText(record: any) {
  return [
    record.title,
    record.name,
    record.type,
    record.location,
    record.description,
    record.rich_description,
    record.internal_notes,
    record.legal_status,
    record.direction,
    record.area,
    record.price,
    record.road_width,
    record.budget,
    record.status,
    record.sale_status,
    record.phone,
    ...(Array.isArray(record.phones) ? record.phones : []),
    ...(Array.isArray(record.possible_phones) ? record.possible_phones : []),
    record.email,
    record.source,
    record.interested_area,
    record.property_type,
    record.notes,
    record.ai_summary,
    ...(Array.isArray(record.selling_points) ? record.selling_points : [])
  ].filter(Boolean).join(" ");
}

function parseData(row: any) {
  return JSON.parse(row.data);
}

function getJsonRows(table: "companies" | "users") {
  return getSqlite()
    .prepare(`SELECT data FROM ${table} ORDER BY created_at DESC`)
    .all()
    .map(parseData);
}

function getRecords(collection: CmsCollection) {
  return getSqlite()
    .prepare("SELECT data FROM cms_records WHERE collection = ? ORDER BY created_at DESC")
    .all(collection)
    .map(parseData);
}

function upsertRecord(collection: CmsCollection, record: any) {
  const now = new Date().toISOString();
  getSqlite()
    .prepare(`
      INSERT INTO cms_records (collection, id, company_id, owner_user_id, sale_status, status, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        company_id = excluded.company_id,
        owner_user_id = excluded.owner_user_id,
        sale_status = excluded.sale_status,
        status = excluded.status,
        data = excluded.data,
        updated_at = excluded.updated_at
    `)
    .run(
      collection,
      record.id,
      record.company_id || null,
      record.owner_user_id || null,
      record.sale_status || null,
      record.status || null,
      JSON.stringify(record),
      record.created_at || now,
      now
    );

  getSqlite().prepare("DELETE FROM cms_records_fts WHERE collection = ? AND id = ?").run(collection, record.id);
  getSqlite().prepare("INSERT INTO cms_records_fts (collection, id, search_text) VALUES (?, ?, ?)")
    .run(collection, record.id, buildSearchText(record));
}

export function readDatabase(): CmsDatabase {
  const settingsRow = getSqlite().prepare("SELECT data FROM settings WHERE key = 'app'").get() as any;

  return {
    companies: getJsonRows("companies"),
    users: getJsonRows("users"),
    customers: getRecords("customers"),
    properties: getRecords("properties"),
    posts: getRecords("posts"),
    inbox: getRecords("inbox"),
    automations: getRecords("automations"),
    settings: settingsRow ? { ...defaultSettings, ...JSON.parse(settingsRow.data) } : defaultSettings,
    chat_history: getSqlite().prepare("SELECT * FROM chat_history ORDER BY created_at DESC LIMIT 200").all(),
    generated_contents: getSqlite().prepare("SELECT * FROM generated_contents ORDER BY created_at DESC LIMIT 200").all()
  };
}

export function writeDatabase(dbData: CmsDatabase) {
  const db = getSqlite();
  const now = new Date().toISOString();

  const write = db.transaction(() => {
    const companyStmt = db.prepare(`
      INSERT INTO companies (id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `);
    dbData.companies?.forEach(company => {
      companyStmt.run(company.id, JSON.stringify(company), company.created_at || now, now);
    });

    const userStmt = db.prepare(`
      INSERT INTO users (id, email, role, company_id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        role = excluded.role,
        company_id = excluded.company_id,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    dbData.users?.forEach(user => {
      userStmt.run(user.id, user.email, user.role, user.company_id || null, JSON.stringify(user), user.created_at || now, now);
    });

    (["customers", "properties", "posts", "inbox", "automations"] as CmsCollection[]).forEach(collection => {
      dbData[collection]?.forEach(record => upsertRecord(collection, record));
    });

    db.prepare(`
      INSERT INTO settings (key, data, updated_at)
      VALUES ('app', ?, ?)
      ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(JSON.stringify({ ...defaultSettings, ...dbData.settings }), now);
  });

  write();
}

export function saveChatMessage(input: {
  id?: string;
  user_id: string;
  company_id?: string;
  role: "user" | "model";
  message: string;
  created_at?: string;
}) {
  const createdAt = input.created_at || new Date().toISOString();
  const id = input.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  getSqlite()
    .prepare("INSERT INTO chat_history (id, user_id, company_id, role, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.user_id, input.company_id || null, input.role, input.message, createdAt);

  return { id, ...input, created_at: createdAt };
}

export function getChatHistoryByUser(userId: string, limit = 50) {
  return getSqlite()
    .prepare("SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as any[];
}

export function upsertPublicChatGuest(input: {
  session_id: string;
  name: string;
  phone: string;
  customer_id?: string;
}) {
  const now = new Date().toISOString();
  getSqlite().prepare(`
    INSERT INTO public_chat_guests (session_id, name, phone, customer_id, ai_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      customer_id = COALESCE(excluded.customer_id, public_chat_guests.customer_id),
      updated_at = excluded.updated_at
  `).run(input.session_id, input.name, input.phone, input.customer_id || null, now, now);
  return getPublicChatGuest(input.session_id);
}

export function getPublicChatGuest(sessionId: string) {
  return getSqlite()
    .prepare("SELECT * FROM public_chat_guests WHERE session_id = ?")
    .get(sessionId) as any | undefined;
}

export function getPublicChatGuests() {
  return getSqlite()
    .prepare(`
      SELECT
        guest.*,
        (
          SELECT message FROM chat_history
          WHERE user_id = 'public-' || guest.session_id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT created_at FROM chat_history
          WHERE user_id = 'public-' || guest.session_id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message_at,
        (
          SELECT COUNT(*) FROM chat_history
          WHERE user_id = 'public-' || guest.session_id
        ) AS message_count
      FROM public_chat_guests guest
      ORDER BY COALESCE(last_message_at, guest.updated_at) DESC
    `)
    .all() as any[];
}

export function updatePublicChatGuestAi(sessionId: string, aiEnabled: boolean) {
  getSqlite()
    .prepare("UPDATE public_chat_guests SET ai_enabled = ?, updated_at = ? WHERE session_id = ?")
    .run(aiEnabled ? 1 : 0, new Date().toISOString(), sessionId);
  return getPublicChatGuest(sessionId);
}

export function deleteChatHistoryByUserId(userId: string) {
  const result = getSqlite()
    .prepare("DELETE FROM chat_history WHERE user_id = ?")
    .run(userId);
  return result.changes;
}

export function deletePublicChatGuest(sessionId: string) {
  const result = getSqlite()
    .prepare("DELETE FROM public_chat_guests WHERE session_id = ?")
    .run(sessionId);
  return result.changes;
}

export function getChatHistorySessionMeta(userId: string) {
  return getSqlite()
    .prepare("SELECT company_id FROM chat_history WHERE user_id = ? LIMIT 1")
    .get(userId) as { company_id?: string | null } | undefined;
}

export function searchCmsRecords(
  collection: CmsCollection,
  tokens: string[],
  limit = 30,
  options?: { availableOnly?: boolean }
) {
  const clauses = ["records.collection = ?"];
  const params: any[] = [collection];
  if (options?.availableOnly) clauses.push("(records.sale_status IS NULL OR records.sale_status NOT IN ('sold', 'hidden'))");

  if (tokens.length > 0) {
    const matchQuery = tokens.map(token => `"${token.replace(/"/g, '""')}"`).join(" OR ");
    return getSqlite().prepare(`
      SELECT records.data
      FROM cms_records_fts fts
      JOIN cms_records records ON records.collection = fts.collection AND records.id = fts.id
      WHERE ${clauses.join(" AND ")} AND cms_records_fts MATCH ?
      ORDER BY bm25(cms_records_fts)
      LIMIT ?
    `).all(...params, matchQuery, limit).map(parseData);
  }

  return getSqlite().prepare(`
    SELECT records.data
    FROM cms_records records
    WHERE ${clauses.join(" AND ")}
    ORDER BY records.updated_at DESC
    LIMIT ?
  `).all(...params, limit).map(parseData);
}

export function saveGeneratedContent(input: {
  id?: string;
  company_id?: string;
  user_id?: string;
  property_id?: string;
  property_title?: string;
  channel: string;
  raw_content: string;
  verified_content?: string;
  status?: "raw" | "verified";
  created_at?: string;
}) {
  const createdAt = input.created_at || new Date().toISOString();
  const id = input.id || `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const status = input.status || "raw";

  getSqlite()
    .prepare(`
      INSERT INTO generated_contents
        (id, company_id, user_id, property_id, property_title, channel, raw_content, verified_content, status, created_at, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      input.company_id || null,
      input.user_id || null,
      input.property_id || null,
      input.property_title || null,
      input.channel,
      input.raw_content,
      input.verified_content || null,
      status,
      createdAt,
      status === "verified" ? createdAt : null
    );

  return { id, ...input, status, created_at: createdAt };
}

export function verifyGeneratedContent(id: string, verifiedContent: string) {
  const result = getSqlite()
    .prepare("UPDATE generated_contents SET verified_content = ?, status = 'verified', verified_at = ? WHERE id = ?")
    .run(verifiedContent, new Date().toISOString(), id);

  return result.changes > 0;
}

export function getDatabaseFilePath() {
  return sqlitePath;
}

export function getCustomers() {
  return getRecords("customers");
}

export function createCustomer(data: any) {
  const record = {
    ...data,
    id: data.id || `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: data.created_at || new Date().toISOString()
  };
  upsertRecord("customers", record);
  return record;
}

export function updateCustomer(id: string, data: any) {
  const current = getRecords("customers").find(record => record.id === id);
  if (!current) throw new Error("Customer not found");
  const updated = { ...current, ...data };
  upsertRecord("customers", updated);
  return updated;
}

export function deleteCustomer(id: string) {
  getSqlite().prepare("DELETE FROM cms_records WHERE collection = 'customers' AND id = ?").run(id);
  getSqlite().prepare("DELETE FROM cms_records_fts WHERE collection = 'customers' AND id = ?").run(id);
}

export function getProperties() {
  return getRecords("properties");
}

export function createProperty(data: any) {
  const record = { ...data, id: data.id || `p-${Date.now()}`, created_at: data.created_at || new Date().toISOString() };
  upsertRecord("properties", record);
  return record;
}

export function updateProperty(id: string, data: any) {
  const current = getRecords("properties").find(record => record.id === id);
  if (!current) throw new Error("Property not found");
  const updated = { ...current, ...data };
  upsertRecord("properties", updated);
  return updated;
}

export function deleteProperty(id: string) {
  getSqlite().prepare("DELETE FROM cms_records WHERE collection = 'properties' AND id = ?").run(id);
}

export function getPosts() {
  return getRecords("posts");
}

export function createPost(data: any) {
  const record = { ...data, id: data.id || `post-${Date.now()}`, created_at: data.created_at || new Date().toISOString() };
  upsertRecord("posts", record);
  return record;
}

export function updatePost(id: string, data: any) {
  const current = getRecords("posts").find(record => record.id === id);
  if (!current) throw new Error("Post not found");
  const updated = { ...current, ...data };
  upsertRecord("posts", updated);
  return updated;
}

export function deletePost(id: string) {
  getSqlite().prepare("DELETE FROM cms_records WHERE collection = 'posts' AND id = ?").run(id);
}

export function getInboxMessages() {
  return getRecords("inbox");
}

export function createInboxMessage(data: any) {
  const record = { ...data, id: data.id || `in-${Date.now()}`, created_at: data.created_at || new Date().toISOString() };
  upsertRecord("inbox", record);
  return record;
}

export function updateInboxMessage(id: string, data: any) {
  const current = getRecords("inbox").find(record => record.id === id);
  if (!current) throw new Error("Inbox message not found");
  const updated = { ...current, ...data };
  upsertRecord("inbox", updated);
  return updated;
}

export function getAutomations() {
  return getRecords("automations");
}

export function updateAutomation(id: string, data: any) {
  const current = getRecords("automations").find(record => record.id === id);
  if (!current) throw new Error("Automation not found");
  const updated = { ...current, ...data };
  upsertRecord("automations", updated);
  return updated;
}

export function getSettings() {
  const row = getSqlite().prepare("SELECT data FROM settings WHERE key = 'app'").get() as any;
  return row ? { ...defaultSettings, ...JSON.parse(row.data) } : defaultSettings;
}

export function updateSettings(data: Partial<AppSettings>) {
  const settings = { ...getSettings(), ...data };
  getSqlite().prepare(`
    INSERT INTO settings (key, data, updated_at)
    VALUES ('app', ?, ?)
    ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(JSON.stringify(settings), new Date().toISOString());
  return settings;
}

export function triggerAutomationEvent(event: string, detail: string) {
  const db = readDatabase();
  const now = new Date().toISOString();

  db.automations = db.automations.map(auto => {
    if (auto.status !== "active" || !auto.trigger_event?.toLowerCase().includes(event.toLowerCase())) {
      return auto;
    }

    return {
      ...auto,
      last_run: now,
      run_count: Number(auto.run_count || 0) + 1,
      logs: [`${now} - Triggered: [${detail}]`, ...(auto.logs || [])].slice(0, 20)
    };
  });

  writeDatabase(db);
}

export function getAllDataForContext() {
  return {
    customers: getCustomers(),
    properties: getProperties(),
    posts: getPosts(),
    settings: getSettings()
  };
}

function parseCrawlerJobRow(row: any) {
  return {
    id: row.id,
    source_name: row.source_name,
    start_url: row.start_url,
    keyword: row.keyword,
    run_interval_minutes: row.run_interval_minutes,
    status: row.status,
    company_id: row.company_id || undefined,
    last_run_at: row.last_run_at || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parseCrawlerResultRow(row: any) {
  return {
    id: row.id,
    job_id: row.job_id,
    source_name: row.source_name,
    title: row.title,
    text: row.text,
    phone: row.phone || undefined,
    source_url: row.source_url,
    intent: row.intent,
    lead_id: row.lead_id || undefined,
    company_id: row.company_id || undefined,
    created_at: row.created_at
  };
}

function parseCrawlerLogRow(row: any) {
  return {
    id: row.id,
    job_id: row.job_id,
    pages_scanned: row.pages_scanned,
    new_leads: row.new_leads,
    duplicates: row.duplicates,
    errors: JSON.parse(row.errors || '[]'),
    message: row.message,
    created_at: row.created_at
  };
}

export function getCrawlerJobs(companyId?: string) {
  const rows = companyId
    ? getSqlite().prepare("SELECT * FROM crawler_jobs WHERE company_id = ? OR company_id IS NULL ORDER BY created_at DESC").all(companyId)
    : getSqlite().prepare("SELECT * FROM crawler_jobs ORDER BY created_at DESC").all();
  return (rows as any[]).map(parseCrawlerJobRow);
}

export function getCrawlerJob(id: string) {
  const row = getSqlite().prepare("SELECT * FROM crawler_jobs WHERE id = ?").get(id) as any;
  return row ? parseCrawlerJobRow(row) : undefined;
}

export function getActiveCrawlerJobs() {
  return (getSqlite().prepare("SELECT * FROM crawler_jobs WHERE status = 'active' ORDER BY created_at DESC").all() as any[])
    .map(parseCrawlerJobRow);
}

export function createCrawlerJob(data: {
  source_name: string;
  start_url?: string;
  keyword?: string;
  run_interval_minutes?: number;
  status?: string;
  company_id?: string;
}) {
  const now = new Date().toISOString();
  const id = `crawl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  getSqlite().prepare(`
    INSERT INTO crawler_jobs (id, source_name, start_url, keyword, run_interval_minutes, status, company_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.source_name,
    data.start_url || '',
    data.keyword || '',
    data.run_interval_minutes ?? 60,
    data.status || 'active',
    data.company_id || null,
    now,
    now
  );
  return getCrawlerJob(id)!;
}

export function updateCrawlerJob(id: string, data: Partial<{
  source_name: string;
  start_url: string;
  keyword: string;
  run_interval_minutes: number;
  status: string;
  last_run_at: string;
}>) {
  const current = getCrawlerJob(id);
  if (!current) throw new Error('Crawler job not found');
  const now = new Date().toISOString();
  const updated = { ...current, ...data, updated_at: now };
  getSqlite().prepare(`
    UPDATE crawler_jobs SET
      source_name = ?, start_url = ?, keyword = ?, run_interval_minutes = ?,
      status = ?, last_run_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updated.source_name,
    updated.start_url,
    updated.keyword,
    updated.run_interval_minutes,
    updated.status,
    updated.last_run_at || null,
    now,
    id
  );
  return getCrawlerJob(id)!;
}

export function deleteCrawlerJob(id: string) {
  getSqlite().prepare("DELETE FROM crawler_jobs WHERE id = ?").run(id);
}

export function getCrawlerResults(options?: { jobId?: string; limit?: number }) {
  const limit = options?.limit ?? 100;
  const rows = options?.jobId
    ? getSqlite().prepare("SELECT * FROM crawler_results WHERE job_id = ? ORDER BY created_at DESC LIMIT ?").all(options.jobId, limit)
    : getSqlite().prepare("SELECT * FROM crawler_results ORDER BY created_at DESC LIMIT ?").all(limit);
  return (rows as any[]).map(parseCrawlerResultRow);
}

export function findCrawlerDuplicate(phone: string, sourceUrl: string) {
  if (!phone) return undefined;
  const row = getSqlite().prepare("SELECT * FROM crawler_results WHERE phone = ? AND source_url = ?").get(phone, sourceUrl) as any;
  return row ? parseCrawlerResultRow(row) : undefined;
}

export function findCrawlerResultByUrl(sourceUrl: string) {
  const row = getSqlite().prepare("SELECT * FROM crawler_results WHERE source_url = ?").get(sourceUrl) as any;
  return row ? parseCrawlerResultRow(row) : undefined;
}

export function findCustomerByPhone(phone: string) {
  if (!phone) return undefined;
  const normalized = phone.replace(/\D/g, '');
  const customers = getCustomers();
  return customers.find(c => c.phone && c.phone.replace(/\D/g, '') === normalized);
}

export function createCrawlerResult(data: {
  job_id: string;
  source_name: string;
  title: string;
  text: string;
  phone?: string;
  source_url: string;
  intent: string;
  lead_id?: string;
  company_id?: string;
}) {
  const id = `cres-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  getSqlite().prepare(`
    INSERT INTO crawler_results (id, job_id, source_name, title, text, phone, source_url, intent, lead_id, company_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.job_id,
    data.source_name,
    data.title,
    data.text,
    data.phone || null,
    data.source_url,
    data.intent,
    data.lead_id || null,
    data.company_id || null,
    now
  );
  return { id, ...data, created_at: now };
}

export function saveCrawlerLog(data: {
  job_id: string;
  pages_scanned: number;
  new_leads: number;
  duplicates: number;
  errors: string[];
  message: string;
}) {
  const id = `clog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  getSqlite().prepare(`
    INSERT INTO crawler_logs (id, job_id, pages_scanned, new_leads, duplicates, errors, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.job_id,
    data.pages_scanned,
    data.new_leads,
    data.duplicates,
    JSON.stringify(data.errors),
    data.message,
    now
  );
  return { id, ...data, created_at: now };
}

export function getCrawlerLogs(options?: { jobId?: string; limit?: number }) {
  const limit = options?.limit ?? 50;
  const rows = options?.jobId
    ? getSqlite().prepare("SELECT * FROM crawler_logs WHERE job_id = ? ORDER BY created_at DESC LIMIT ?").all(options.jobId, limit)
    : getSqlite().prepare("SELECT * FROM crawler_logs ORDER BY created_at DESC LIMIT ?").all(limit);
  return (rows as any[]).map(parseCrawlerLogRow);
}

function getTodayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isBlockError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('captcha') ||
    lower.includes('chặn') ||
    lower.includes('chan') ||
    lower.includes('blocked') ||
    lower.includes('bị chặn') ||
    lower.includes('google search') ||
    lower.includes('unusual traffic') ||
    lower.includes('403') ||
    lower.includes('429')
  );
}

export function getExtensionCollectStats() {
  const rows = getSqlite().prepare(`
    SELECT pages_scanned, new_leads, duplicates, message, created_at
    FROM crawler_logs
    WHERE job_id LIKE 'ext-auto-%'
    ORDER BY created_at DESC
  `).all() as any[];

  let totalPosts = 0;
  let totalNew = 0;
  let totalDup = 0;
  let totalFound = 0;

  rows.forEach(row => {
    totalPosts += Number(row.pages_scanned || 0);
    totalNew += Number(row.new_leads || 0);
    totalDup += Number(row.duplicates || 0);
    try {
      const meta = JSON.parse(row.message || '{}');
      totalFound += Number(meta.leads_found || 0);
    } catch {
      // skip
    }
  });

  const conversion = totalPosts > 0 ? Math.round((totalNew / totalPosts) * 1000) / 10 : 0;

  return {
    total_posts_scanned: totalPosts,
    total_leads_found: totalFound,
    total_new_leads: totalNew,
    total_duplicates: totalDup,
    conversion_rate: conversion,
    sessions_count: rows.length,
    last_session_at: rows[0]?.created_at
  };
}

export function getCrawlerHealth(companyId?: string) {
  const db = getSqlite();
  const todayStart = getTodayStartIso();

  const jobs = companyId
    ? (db.prepare("SELECT * FROM crawler_jobs WHERE company_id = ? OR company_id IS NULL").all(companyId) as any[])
    : (db.prepare("SELECT * FROM crawler_jobs").all() as any[]);

  const activeJobs = jobs.filter(j => j.status === 'active').length;

  const lastRunRow = db.prepare(`
    SELECT MAX(last_run_at) AS last_run_at FROM crawler_jobs
    ${companyId ? "WHERE company_id = ? OR company_id IS NULL" : ""}
  `).get(...(companyId ? [companyId] : [])) as { last_run_at?: string };

  const leadsTodayRow = db.prepare(`
    SELECT COALESCE(SUM(new_leads), 0) AS total FROM crawler_logs WHERE created_at >= ?
  `).get(todayStart) as { total: number };

  const logsToday = db.prepare(`
    SELECT job_id, errors FROM crawler_logs WHERE created_at >= ?
  `).all(todayStart) as Array<{ job_id: string; errors: string }>;

  let errorsToday = 0;
  const blockCountByJob = new Map<string, { count: number; lastError?: string }>();

  logsToday.forEach(log => {
    const parsedErrors: string[] = JSON.parse(log.errors || '[]');
    if (parsedErrors.length) errorsToday += parsedErrors.length;
    parsedErrors.forEach(err => {
      if (!isBlockError(err)) return;
      const current = blockCountByJob.get(log.job_id) || { count: 0 };
      current.count += 1;
      current.lastError = err;
      blockCountByJob.set(log.job_id, current);
    });
  });

  const jobNameById = new Map(jobs.map(j => [j.id, j.source_name]));
  const blockedJobs = Array.from(blockCountByJob.entries())
    .map(([job_id, info]) => ({
      job_id,
      source_name: jobNameById.get(job_id) || job_id,
      block_count: info.count,
      last_error: info.lastError
    }))
    .sort((a, b) => b.block_count - a.block_count);

  return {
    active_jobs: activeJobs,
    total_jobs: jobs.length,
    last_run_at: lastRunRow?.last_run_at || undefined,
    new_leads_today: Number(leadsTodayRow?.total || 0),
    errors_today: errorsToday,
    blocked_jobs: blockedJobs
  };
}
