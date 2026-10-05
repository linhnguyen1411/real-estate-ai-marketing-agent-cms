import { AppSettings } from "../src/types";
import { normalizeProjectName } from "../src/seo/propertyCatalog";
import { sortByCreatedAtDesc } from "../src/utils/propertySort";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./security/settingsCrypto";

type CmsCollection = "customers" | "properties" | "posts" | "inbox" | "automations";

export interface CmsDatabase {
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
  openai_model: process.env.OPENAI_MODEL || process.env.KIRA_MODEL || "kira-mini-1.0",
  agent_tone: process.env.AGENT_TONE || "sang trọng và chuyên nghiệp",
  site_view_count: 0,
  telegram_enabled: true,
  telegram_min_score: 70,
  telegram_classifications: ["buyer", "renter", "investor"],
  telegram_only_with_phone: false,
  telegram_include_phone: true,
  telegram_include_budget: true,
  telegram_include_location: true,
  telegram_include_link: true,
  agent_sync_enabled: true,
  agent_sync_batch_size: 10,
  agent_sync_timeout_ms: 20000,
  agent_sync_verify_tls: true,
  gemini_api_key: '',
  openai_api_key: '',
  finding_ai_gate_enabled: true,
};

let cache: CmsDatabase | null = null;
let readyPromise: Promise<void> | null = null;

function emptyDatabase(): CmsDatabase {
  return {
    companies: [],
    users: [],
    customers: [],
    properties: [],
    posts: [],
    inbox: [],
    automations: [],
    settings: { ...defaultSettings },
    chat_history: [],
    generated_contents: [],
  };
}

function cloneDb(db: CmsDatabase): CmsDatabase {
  return JSON.parse(JSON.stringify(db)) as CmsDatabase;
}

function requireCache(): CmsDatabase {
  if (!cache) {
    throw new Error("Database chưa sẵn sàng. Gọi ensureDatabaseReady() trước khi khởi động server.");
  }
  return cache;
}

export function buildSearchText(record: any) {
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
    record.email,
    record.source,
    record.interested_area,
    record.property_type,
    record.notes,
    record.ai_summary,
    ...(Array.isArray(record.selling_points) ? record.selling_points : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function parseIsoDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

async function loadCacheFromPostgres() {
  const [companies, users, settingsRow, chatHistory, generatedContents, cmsRecords, publicGuests] =
    await Promise.all([
    prisma.company.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.appSetting.findUnique({ where: { key: "app" } }),
    prisma.chatHistory.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.generatedContent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.cmsRecord.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.publicChatGuest.findMany({ orderBy: { updatedAt: "desc" } }),
  ]);

  const db = emptyDatabase();
  db.companies = companies
    .map((row) => {
      const data = (row.data as Record<string, unknown>) || {};
      return { ...data, id: data.id || row.id };
    })
    .filter((c) => Boolean(c.id));
  db.users = users
    .map((row) => {
      const data = (row.data as Record<string, unknown>) || {};
      return { ...data, id: data.id || row.id };
    })
    .filter((u) => Boolean(u.id));

  for (const row of cmsRecords) {
    const collection = row.collection as CmsCollection;
    if (!db[collection]) continue;
    db[collection].push(row.data as any);
  }

  const rawSettings = (settingsRow?.data as Record<string, unknown>) || {};
  const decryptedSettings: AppSettings = {
    ...defaultSettings,
    ...(rawSettings as unknown as Partial<AppSettings>),
    gemini_api_key: rawSettings.gemini_api_key ? decryptSecret(String(rawSettings.gemini_api_key), 'gemini') : '',
    openai_api_key: rawSettings.openai_api_key ? decryptSecret(String(rawSettings.openai_api_key), 'openai') : '',
    telegram_bot_token: rawSettings.telegram_bot_token ? decryptSecret(String(rawSettings.telegram_bot_token), 'telegram') : '',
    agent_sync_secret: rawSettings.agent_sync_secret ? decryptSecret(String(rawSettings.agent_sync_secret), 'agent_sync') : '',
  };
  db.settings = decryptedSettings;

  db.chat_history = chatHistory.map((row) => ({
    id: row.id,
    user_id: row.userId,
    company_id: row.companyId,
    role: row.role,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  }));

  db.generated_contents = generatedContents.map((row) => ({
    id: row.id,
    company_id: row.companyId,
    user_id: row.userId,
    property_id: row.propertyId,
    property_title: row.propertyTitle,
    channel: row.channel,
    raw_content: row.rawContent,
    verified_content: row.verifiedContent,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    verified_at: row.verifiedAt?.toISOString() || null,
  }));

  // Optimized N+1 elimination for public chat guests:
  let guestEnriched: any[] = [];
  if (publicGuests.length > 0) {
    const userIds = publicGuests.map((g) => `public-${g.sessionId}`);

    // Bulk query chat messages for these guests
    const allGuestChats = await prisma.chatHistory.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      select: { userId: true, message: true, createdAt: true },
    });

    const chatsByUser = new Map<string, { lastMessage: string | null; lastMessageAt: string | null; count: number }>();
    for (const chat of allGuestChats) {
      const entry = chatsByUser.get(chat.userId);
      if (!entry) {
        chatsByUser.set(chat.userId, {
          lastMessage: chat.message,
          lastMessageAt: chat.createdAt.toISOString(),
          count: 1,
        });
      } else {
        entry.count += 1;
      }
    }

    guestEnriched = publicGuests.map((guest) => {
      const userId = `public-${guest.sessionId}`;
      const stats = chatsByUser.get(userId) || { lastMessage: null, lastMessageAt: null, count: 0 };
      return {
        session_id: guest.sessionId,
        name: guest.name,
        phone: guest.phone,
        customer_id: guest.customerId,
        ai_enabled: guest.aiEnabled ? 1 : 0,
        created_at: guest.createdAt.toISOString(),
        updated_at: guest.updatedAt.toISOString(),
        last_message: stats.lastMessage,
        last_message_at: stats.lastMessageAt,
        message_count: stats.count,
      };
    });
  }
  (db as any).public_chat_guests = guestEnriched;

  db.properties = sortByCreatedAtDesc(db.properties);

  cache = db;
}

async function migrateLegacyPropertyProjectNames() {
  const db = requireCache();
  for (const prop of db.properties) {
    const normalized = normalizeProjectName(prop.project_name);
    if (!normalized || normalized === prop.project_name) continue;
    prop.project_name = normalized;
    upsertRecordInCache("properties", prop);
    await upsertRecordToPostgres("properties", prop);
  }
}

async function ensureDefaultSettings() {
  const existing = await prisma.appSetting.findUnique({ where: { key: "app" } });
  if (!existing) {
    await prisma.appSetting.create({
      data: { key: "app", data: defaultSettings as any },
    });
  }
}

export async function ensureDatabaseReady() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL bắt buộc (PostgreSQL). Ví dụ: postgresql://user:pass@localhost:5432/real_estate_ai"
    );
  }
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await ensureDefaultSettings();
        await loadCacheFromPostgres();
        try {
          await migrateLegacyPropertyProjectNames();
        } catch (error) {
          console.warn('[DB] Bỏ qua chuẩn hóa tên dự án lúc khởi động:', error);
        }
      } catch (error) {
        readyPromise = null;
        throw error;
      }
    })();
  }
  await readyPromise;
}

export class OptimisticLockError extends Error {
  statusCode = 409;
  constructor(message = 'Dữ liệu đã bị thay đổi bởi phiên làm việc khác (Conflict). Vui lòng tải lại và thử lại.') {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

export function getUserById(id: string): any | null {
  const db = requireCache();
  return db.users?.find((u: any) => u.id === id) || null;
}

export function getCustomerById(id: string): any | null {
  const db = requireCache();
  return db.customers?.find((c: any) => c.id === id) || null;
}

export function getPropertyById(id: string): any | null {
  const db = requireCache();
  return db.properties?.find((p: any) => p.id === id) || null;
}

export function readDatabase(): CmsDatabase {
  const raw = requireCache();
  // In development, freeze to prevent accidental mutations of shared cache
  if (process.env.NODE_ENV === 'development') {
    return cloneDb(raw);
  }
  return cloneDb(raw);
}

export async function upsertUser(user: any, expectedVersion?: number): Promise<any> {
  const now = new Date();
  const db = requireCache();
  const currentInCache = db.users?.find((u: any) => u.id === user.id);
  const currentVersion = Number(currentInCache?.version ?? 0);

  if (expectedVersion !== undefined && currentInCache && currentVersion !== expectedVersion) {
    throw new OptimisticLockError(`User ${user.id} version conflict (expected ${expectedVersion}, got ${currentVersion})`);
  }

  const nextVersion = currentVersion + 1;
  const userToSave = { ...user, version: nextVersion };

  // Write to Postgres FIRST if not in test mock
  if (!(process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL_TEST)) {
    if (currentInCache) {
      // Update with version check
      const result = await prisma.user.updateMany({
        where: {
          id: user.id,
          ...(expectedVersion !== undefined ? { version: expectedVersion } : {}),
        },
        data: {
          email: userToSave.email,
          role: userToSave.role,
          companyId: userToSave.company_id || null,
          data: userToSave,
          version: nextVersion,
          updatedAt: now,
        },
      });
      if (expectedVersion !== undefined && result.count === 0) {
        throw new OptimisticLockError(`User ${user.id} conflict during database update`);
      }
    } else {
      await prisma.user.create({
        data: {
          id: userToSave.id,
          email: userToSave.email,
          role: userToSave.role,
          companyId: userToSave.company_id || null,
          version: nextVersion,
          data: userToSave,
          createdAt: parseIsoDate(userToSave.created_at, now),
          updatedAt: now,
        },
      });
    }
  }

  // Update in cache ONLY after Postgres commit succeeds
  const idx = db.users.findIndex((u: any) => u.id === userToSave.id);
  if (idx >= 0) db.users[idx] = userToSave;
  else db.users.unshift(userToSave);

  return userToSave;
}

export async function deleteUser(id: string): Promise<void> {
  if (!(process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL_TEST)) {
    await prisma.user.deleteMany({ where: { id } });
  }
  const db = requireCache();
  db.users = db.users.filter((u: any) => u.id !== id);
}

export async function upsertCmsRecord(collection: CmsCollection, record: any, expectedVersion?: number): Promise<any> {
  const now = new Date();
  const createdAt = parseIsoDate(record.created_at, now);
  const searchText = buildSearchText(record);
  const db = requireCache();

  const currentInCache = db[collection]?.find((r: any) => r.id === record.id);
  const currentVersion = Number(currentInCache?.version ?? 0);

  if (expectedVersion !== undefined && currentInCache && currentVersion !== expectedVersion) {
    throw new OptimisticLockError(`Record ${collection}/${record.id} version conflict (expected ${expectedVersion}, got ${currentVersion})`);
  }

  const nextVersion = currentVersion + 1;
  const recordToSave = { ...record, version: nextVersion };

  // Write to Postgres FIRST
  if (!(process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL_TEST)) {
    if (currentInCache) {
      const result = await prisma.cmsRecord.updateMany({
        where: {
          collection,
          id: record.id,
          ...(expectedVersion !== undefined ? { version: expectedVersion } : {}),
        },
        data: {
          companyId: recordToSave.company_id || null,
          ownerUserId: recordToSave.owner_user_id || null,
          saleStatus: recordToSave.sale_status || null,
          status: recordToSave.status || null,
          data: recordToSave,
          searchText,
          version: nextVersion,
          updatedAt: now,
        },
      });
      if (expectedVersion !== undefined && result.count === 0) {
        throw new OptimisticLockError(`Record ${collection}/${record.id} conflict during database update`);
      }
    } else {
      await prisma.cmsRecord.create({
        data: {
          collection,
          id: recordToSave.id,
          companyId: recordToSave.company_id || null,
          ownerUserId: recordToSave.owner_user_id || null,
          saleStatus: recordToSave.sale_status || null,
          status: recordToSave.status || null,
          data: recordToSave,
          searchText,
          version: nextVersion,
          createdAt,
          updatedAt: now,
        },
      });
    }
  }

  // Update Cache AFTER commit
  upsertRecordInCache(collection, recordToSave);
  return recordToSave;
}

export async function deleteCmsRecord(collection: CmsCollection, id: string): Promise<void> {
  if (!(process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL_TEST)) {
    await prisma.cmsRecord.deleteMany({ where: { collection, id } });
  }
  const db = requireCache();
  db[collection] = db[collection].filter((item: any) => item.id !== id);
}

async function upsertRecordToPostgres(collection: CmsCollection, record: any) {
  if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL_TEST) {
    return;
  }
  const now = new Date();
  const createdAt = parseIsoDate(record.created_at, now);
  const searchText = buildSearchText(record);

  await prisma.cmsRecord.upsert({
    where: { collection_id: { collection, id: record.id } },
    create: {
      collection,
      id: record.id,
      companyId: record.company_id || null,
      ownerUserId: record.owner_user_id || null,
      saleStatus: record.sale_status || null,
      status: record.status || null,
      data: record,
      searchText,
      createdAt,
      updatedAt: now,
    },
    update: {
      companyId: record.company_id || null,
      ownerUserId: record.owner_user_id || null,
      saleStatus: record.sale_status || null,
      status: record.status || null,
      data: record,
      searchText,
      updatedAt: now,
    },
  });
}

function upsertRecordInCache(collection: CmsCollection, record: any) {
  const db = requireCache();
  const index = db[collection].findIndex((item: any) => item.id === record.id);
  if (index >= 0) db[collection][index] = record;
  else db[collection].unshift(record);
}

export async function writeDatabase(dbData: CmsDatabase) {
  cache = cloneDb(dbData);
  // When running isolated unit/integration tests with in-memory mock cache, skip Postgres transaction
  if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL_TEST) {
    return;
  }
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const company of dbData.companies || []) {
      if (!company?.id) {
        console.warn('[writeDatabase] skip company without id');
        continue;
      }
      await tx.company.upsert({
        where: { id: company.id },
        create: {
          id: company.id,
          data: company,
          createdAt: parseIsoDate(company.created_at, now),
          updatedAt: now,
        },
        update: { data: company, updatedAt: now },
      });
    }

    for (const user of dbData.users || []) {
      if (!user?.id) {
        console.warn('[writeDatabase] skip user without id');
        continue;
      }
      await tx.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.company_id || null,
          data: user,
          createdAt: parseIsoDate(user.created_at, now),
          updatedAt: now,
        },
        update: {
          email: user.email,
          role: user.role,
          companyId: user.company_id || null,
          data: user,
          updatedAt: now,
        },
      });
    }

    for (const collection of ["customers", "properties", "posts", "inbox", "automations"] as CmsCollection[]) {
      for (const record of dbData[collection] || []) {
        if (!record?.id) {
          console.warn(`[writeDatabase] skip ${collection} without id`);
          continue;
        }
        const createdAt = parseIsoDate(record.created_at, now);
        await tx.cmsRecord.upsert({
          where: { collection_id: { collection, id: record.id } },
          create: {
            collection,
            id: record.id,
            companyId: record.company_id || null,
            ownerUserId: record.owner_user_id || null,
            saleStatus: record.sale_status || null,
            status: record.status || null,
            data: record,
            searchText: buildSearchText(record),
            createdAt,
            updatedAt: now,
          },
          update: {
            companyId: record.company_id || null,
            ownerUserId: record.owner_user_id || null,
            saleStatus: record.sale_status || null,
            status: record.status || null,
            data: record,
            searchText: buildSearchText(record),
            updatedAt: now,
          },
        });
      }
    }

    await tx.appSetting.upsert({
      where: { key: "app" },
      create: { key: "app", data: { ...defaultSettings, ...dbData.settings } as any },
      update: { data: { ...defaultSettings, ...dbData.settings } as any },
    });
  }, { timeout: 120_000, maxWait: 30_000 });
}

export async function saveChatMessage(input: {
  id?: string;
  user_id: string;
  company_id?: string;
  role: "user" | "model";
  message: string;
  created_at?: string;
}) {
  const createdAt = parseIsoDate(input.created_at);
  const id = input.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    id,
    user_id: input.user_id,
    company_id: input.company_id || null,
    role: input.role,
    message: input.message,
    created_at: createdAt.toISOString(),
  };

  await prisma.chatHistory.create({
    data: {
      id,
      userId: input.user_id,
      companyId: input.company_id || null,
      role: input.role,
      message: input.message,
      createdAt,
    },
  });

  const db = requireCache();
  db.chat_history = [row, ...(db.chat_history || [])].slice(0, 200);

  if (input.user_id.startsWith('public-')) {
    await refreshPublicChatGuestsCache();
  }

  return row;
}

export function getChatHistoryByUser(userId: string, limit = 50) {
  return (requireCache().chat_history || [])
    .filter((row) => row.user_id === userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit);
}

export async function upsertPublicChatGuest(input: {
  session_id: string;
  name: string;
  phone: string;
  customer_id?: string;
}) {
  const now = new Date();
  await prisma.publicChatGuest.upsert({
    where: { sessionId: input.session_id },
    create: {
      sessionId: input.session_id,
      name: input.name,
      phone: input.phone,
      customerId: input.customer_id || null,
      aiEnabled: true,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      name: input.name,
      phone: input.phone,
      customerId: input.customer_id || undefined,
      updatedAt: now,
    },
  });
  await refreshPublicChatGuestsCache();
  return getPublicChatGuest(input.session_id);
}

export function getPublicChatGuest(sessionId: string) {
  const guests = getPublicChatGuests();
  return guests.find((guest) => guest.session_id === sessionId);
}

export function getPublicChatGuests() {
  return [...((requireCache() as any).public_chat_guests || [])];
}

export async function refreshPublicChatGuestsCache() {
  const guests = await prisma.publicChatGuest.findMany({ orderBy: { updatedAt: "desc" } });
  if (guests.length === 0) {
    (requireCache() as any).public_chat_guests = [];
    return [];
  }

  const userIds = guests.map((g) => `public-${g.sessionId}`);
  const allGuestChats = await prisma.chatHistory.findMany({
    where: { userId: { in: userIds } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, message: true, createdAt: true },
  });

  const chatsByUser = new Map<string, { lastMessage: string | null; lastMessageAt: string | null; count: number }>();
  for (const chat of allGuestChats) {
    const entry = chatsByUser.get(chat.userId);
    if (!entry) {
      chatsByUser.set(chat.userId, {
        lastMessage: chat.message,
        lastMessageAt: chat.createdAt.toISOString(),
        count: 1,
      });
    } else {
      entry.count += 1;
    }
  }

  const enriched = guests.map((guest) => {
    const userId = `public-${guest.sessionId}`;
    const stats = chatsByUser.get(userId) || { lastMessage: null, lastMessageAt: null, count: 0 };
    return {
      session_id: guest.sessionId,
      name: guest.name,
      phone: guest.phone,
      customer_id: guest.customerId,
      ai_enabled: guest.aiEnabled ? 1 : 0,
      created_at: guest.createdAt.toISOString(),
      updated_at: guest.updatedAt.toISOString(),
      last_message: stats.lastMessage,
      last_message_at: stats.lastMessageAt,
      message_count: stats.count,
    };
  });

  (requireCache() as any).public_chat_guests = enriched;
  return enriched;
}

export async function updatePublicChatGuestAi(sessionId: string, aiEnabled: boolean) {
  const now = new Date();
  await prisma.publicChatGuest.update({
    where: { sessionId },
    data: { aiEnabled, updatedAt: now },
  });
  await refreshPublicChatGuestsCache();
  return getPublicChatGuest(sessionId);
}

export async function deleteChatHistoryByUserId(userId: string) {
  const result = await prisma.chatHistory.deleteMany({ where: { userId } });
  const db = requireCache();
  db.chat_history = (db.chat_history || []).filter((row) => row.user_id !== userId);
  return result.count;
}

export async function deletePublicChatGuest(sessionId: string) {
  const result = await prisma.publicChatGuest.deleteMany({ where: { sessionId } });
  await refreshPublicChatGuestsCache();
  return result.count;
}

export function getChatHistorySessionMeta(userId: string) {
  const row = (requireCache().chat_history || []).find((item) => item.user_id === userId);
  return row ? { company_id: row.company_id } : undefined;
}

export function searchCmsRecords(
  collection: CmsCollection,
  tokens: string[],
  limit = 30,
  options?: { availableOnly?: boolean }
) {
  let records = [...requireCache()[collection]];
  if (options?.availableOnly) {
    records = records.filter(
      (record) => !["sold", "hidden"].includes(String(record.sale_status || "available"))
    );
  }

  if (tokens.length > 0) {
    const normalized = tokens.map((token) => token.toLowerCase());
    records = records
      .map((record) => {
        const text = buildSearchText(record).toLowerCase();
        const score = normalized.reduce(
          (sum, token) => sum + (text.includes(token) ? token.length : 0),
          0
        );
        return { record, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.record);
  } else {
    records.sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))
    );
  }

  return records.slice(0, limit);
}

export async function saveGeneratedContent(input: {
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
  const createdAt = parseIsoDate(input.created_at);
  const id = input.id || `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const status = input.status || "raw";

  await prisma.generatedContent.create({
    data: {
      id,
      companyId: input.company_id || null,
      userId: input.user_id || null,
      propertyId: input.property_id || null,
      propertyTitle: input.property_title || null,
      channel: input.channel,
      rawContent: input.raw_content,
      verifiedContent: input.verified_content || null,
      status,
      createdAt,
      verifiedAt: status === "verified" ? createdAt : null,
    },
  });

  const row = {
    id,
    ...input,
    status,
    created_at: createdAt.toISOString(),
    verified_at: status === "verified" ? createdAt.toISOString() : null,
  };
  const db = requireCache();
  db.generated_contents = [row, ...(db.generated_contents || [])].slice(0, 200);
  return row;
}

export async function verifyGeneratedContent(id: string, verifiedContent: string) {
  const verifiedAt = new Date();
  const result = await prisma.generatedContent.updateMany({
    where: { id },
    data: { verifiedContent, status: "verified", verifiedAt },
  });

  if (result.count > 0) {
    const db = requireCache();
    db.generated_contents = (db.generated_contents || []).map((row) =>
      row.id === id
        ? {
            ...row,
            verified_content: verifiedContent,
            status: "verified",
            verified_at: verifiedAt.toISOString(),
          }
        : row
    );
  }
  return result.count > 0;
}

export function getDatabaseFilePath() {
  return process.env.DATABASE_URL || "postgresql";
}

export function getCustomers() {
  return [...requireCache().customers];
}

export async function createCustomer(data: any) {
  const record = {
    ...data,
    id: data.id || `c-${Date.now()}`,
    created_at: data.created_at || new Date().toISOString(),
  };
  upsertRecordInCache("customers", record);
  await upsertRecordToPostgres("customers", record);
  return record;
}

export async function updateCustomer(id: string, data: any) {
  const current = requireCache().customers.find((record) => record.id === id);
  if (!current) throw new Error("Customer not found");
  const updated = { ...current, ...data };
  upsertRecordInCache("customers", updated);
  await upsertRecordToPostgres("customers", updated);
  return updated;
}

export async function deleteCustomer(id: string) {
  const db = requireCache();
  db.customers = db.customers.filter((record) => record.id !== id);
  await prisma.cmsRecord.deleteMany({ where: { collection: "customers", id } });
}

export function getProperties() {
  return sortByCreatedAtDesc(requireCache().properties);
}

export async function createProperty(data: any) {
  const record = {
    ...data,
    id: data.id || `p-${Date.now()}`,
    created_at: data.created_at || new Date().toISOString(),
  };
  upsertRecordInCache("properties", record);
  await upsertRecordToPostgres("properties", record);
  return record;
}

export async function updateProperty(id: string, data: any) {
  const current = requireCache().properties.find((record) => record.id === id);
  if (!current) throw new Error("Property not found");
  const updated = { ...current, ...data };
  upsertRecordInCache("properties", updated);
  await upsertRecordToPostgres("properties", updated);
  return updated;
}

export async function deleteProperty(id: string) {
  const db = requireCache();
  db.properties = db.properties.filter((record) => record.id !== id);
  await prisma.cmsRecord.deleteMany({ where: { collection: "properties", id } });
}

export function getPosts() {
  return [...requireCache().posts];
}

export async function createPost(data: any) {
  const record = {
    ...data,
    id: data.id || `post-${Date.now()}`,
    created_at: data.created_at || new Date().toISOString(),
  };
  upsertRecordInCache("posts", record);
  await upsertRecordToPostgres("posts", record);
  return record;
}

export async function updatePost(id: string, data: any) {
  const current = requireCache().posts.find((record) => record.id === id);
  if (!current) throw new Error("Post not found");
  const updated = { ...current, ...data };
  upsertRecordInCache("posts", updated);
  await upsertRecordToPostgres("posts", updated);
  return updated;
}

export async function deletePost(id: string) {
  const db = requireCache();
  db.posts = db.posts.filter((record) => record.id !== id);
  await prisma.cmsRecord.deleteMany({ where: { collection: "posts", id } });
}

export function getInboxMessages() {
  return [...requireCache().inbox];
}

export async function createInboxMessage(data: any) {
  const record = {
    ...data,
    id: data.id || `in-${Date.now()}`,
    created_at: data.created_at || new Date().toISOString(),
  };
  upsertRecordInCache("inbox", record);
  await upsertRecordToPostgres("inbox", record);
  return record;
}

export async function updateInboxMessage(id: string, data: any) {
  const current = requireCache().inbox.find((record) => record.id === id);
  if (!current) throw new Error("Inbox message not found");
  const updated = { ...current, ...data };
  upsertRecordInCache("inbox", updated);
  await upsertRecordToPostgres("inbox", updated);
  return updated;
}

export function getAutomations() {
  return [...requireCache().automations];
}

export async function updateAutomation(id: string, data: any) {
  const current = requireCache().automations.find((record) => record.id === id);
  if (!current) throw new Error("Automation not found");
  const updated = { ...current, ...data };
  upsertRecordInCache("automations", updated);
  await upsertRecordToPostgres("automations", updated);
  return updated;
}

export function getSettings(): AppSettings {
  return { ...requireCache().settings };
}

export async function updateSettings(data: Partial<AppSettings>) {
  const current = getSettings();
  const patch = { ...data } as Partial<AppSettings>;
  // Never wipe secrets with empty / masked placeholders from the form
  const wipeSecret = (v: unknown) =>
    v == null || v === '' || (typeof v === 'string' && (v.includes('…') || v.includes('****')));
  if (wipeSecret(patch.gemini_api_key)) delete patch.gemini_api_key;
  if (wipeSecret(patch.openai_api_key)) delete patch.openai_api_key;
  if (wipeSecret(patch.telegram_bot_token)) delete patch.telegram_bot_token;
  if (wipeSecret(patch.agent_sync_secret)) delete patch.agent_sync_secret;

  const settings = { ...current, ...patch };
  const db = requireCache();
  db.settings = settings;

  // Prepare database record with encrypted secrets
  const encryptedPayload: AppSettings = {
    ...settings,
    gemini_api_key: settings.gemini_api_key ? encryptSecret(settings.gemini_api_key, 'gemini') : '',
    openai_api_key: settings.openai_api_key ? encryptSecret(settings.openai_api_key, 'openai') : '',
    telegram_bot_token: settings.telegram_bot_token ? encryptSecret(settings.telegram_bot_token, 'telegram') : '',
    agent_sync_secret: settings.agent_sync_secret ? encryptSecret(settings.agent_sync_secret, 'agent_sync') : '',
  };

  await prisma.appSetting.upsert({
    where: { key: "app" },
    create: { key: "app", data: encryptedPayload as any },
    update: { data: encryptedPayload as any },
  });
  return settings;
}

export async function triggerAutomationEvent(event: string, detail: string) {
  const db = readDatabase();
  const now = new Date().toISOString();

  for (const auto of db.automations || []) {
    if (auto.status === "active" && auto.trigger_event?.toLowerCase().includes(event.toLowerCase())) {
      const updated = {
        ...auto,
        last_run: now,
        run_count: Number(auto.run_count || 0) + 1,
        logs: [`${now} - Triggered: [${detail}]`, ...(auto.logs || [])].slice(0, 20),
        updated_at: now,
      };
      await upsertCmsRecord("automations", updated, auto.version);
    }
  }
}

export function getAllDataForContext() {
  return {
    customers: getCustomers(),
    properties: getProperties(),
    posts: getPosts(),
    settings: getSettings(),
  };
}

export function setCacheForTesting(mockDb: Partial<CmsDatabase>) {
  cache = {
    ...emptyDatabase(),
    ...cloneDb(mockDb as CmsDatabase),
  };
  readyPromise = Promise.resolve();
}

export function resetCacheForTesting() {
  cache = null;
  readyPromise = null;
}

