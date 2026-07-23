import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'node:child_process';
import type { Server } from 'node:http';
import { 
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProperties, createProperty, updateProperty, deleteProperty,
  getPosts, createPost, updatePost, deletePost,
  getInboxMessages, createInboxMessage, updateInboxMessage,
  getAutomations, updateAutomation,
  getSettings, updateSettings,
  readDatabase, writeDatabase,
  saveChatMessage, getChatHistoryByUser, searchCmsRecords, saveGeneratedContent, verifyGeneratedContent,
  getAllDataForContext,
  getPublicChatGuest,
  getPublicChatGuests,
  updatePublicChatGuestAi,
  upsertPublicChatGuest,
  deleteChatHistoryByUserId,
  deletePublicChatGuest,
  getChatHistorySessionMeta,
  ensureDatabaseReady
} from './server/dbHelper';
import { checkDatabaseConnection } from './server/prisma';
import { 
  analyzeCustomerWithAI, 
  generatePropertyMarketingContent, 
  buildPropertySeo,
  appendStandardHashtags,
  generateAILiveChatReply, 
  generateAIConsultantReply,
  generateText,
  getAIProviderStatus
} from './server/aiService';
import { AuthUser, Customer, Property, Post, InboxMessage, AutomationTask, User, AppSettings } from './src/types';
import type { AgentTier } from './src/utils/agentTier';
import { resolveAgentTier, slugifyAgentProfile } from './src/utils/agentTier';
import { mergePostHashtags, mergeKeywordLists, hashtagsToKeywords, getPropertyContentForHashtags, collectSiteSeoKeywords as buildSiteSeoKeywords, getPropertySeoKeywordsFromContent } from './src/utils/hashtags';
import { saveImageFromDataUrl } from './server/blog/imageStorage';
import { getPageMetaByPath } from './src/seo/pageMeta';
import { buildSitemapEntries, entriesToXml, sitemapIndexXml } from './src/seo/sitemap';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
  buildPropertySchemas,
} from './src/seo/schemas';
import { isReservedSlug } from './src/seo/routes';
import { sortByCreatedAtDesc } from './src/utils/propertySort';
import { parseListQuery, paginateItems, matchesSearchText } from './server/listPagination';
import { buildCompanyScopeFilter, getAgentDashboardCounts } from './server/agent/agentDb';
import { prisma } from './server/prisma';
import { getPropertySaleStatus } from './src/utils/propertyStatus';
import { countInvestorLeads } from './server/investorLeadDb';
import { createInvestorLeadPublicRouter, registerInvestorLeadAdminRoutes } from './server/investorLeadRoutes';
import { registerBlogAdminRoutes, registerBlogPublicRoutes } from './server/blogRoutes';
import { getBlogPostBySlug, getPublishedBlogPostsForSitemap } from './server/blogDb';
import { resolveBlogShareImage, guessImageMimeType } from './src/seo/shareImage';
import { ogImageDimensions, readImageDimensionsFromBuffer } from './server/seo/ogImageMeta';
import {
  registerShortLinkAdminRoutes,
  registerShortLinkPublicRoutes,
  registerShortLinkRedirect,
} from './server/shortLink/shortLinkRoutes';
import { processLeadCapture } from './server/investorLeadService';
import { cacheControlMiddleware, createDistStaticOptions, createPublicStaticOptions } from './server/middleware/staticAssets';
import { getCached, setCached, clearCacheKey } from './server/cache/publicCache';
import { filterPublicProperties } from './server/publicPropertyMapper';
import { LEAD_MAGNETS } from './src/leadGen/leadMagnets';
import { registerFacebookWebhookRoutes, registerFacebookAdminRoutes } from './server/facebookRoutes';
import { registerAgentAdminRoutes } from './server/agent/agentRoutes';
import { registerAgentIngestRoutes } from './server/agentIngest/ingestRoutes';
import { registerSocialPublishingRoutes } from './server/modules/social-publishing/api/socialPublishingRoutes';
import { registerPlanningRoutes } from './server/modules/planning';
import { registerLeadAcquisitionRoutes } from './server/modules/lead-acquisition';
import { registerSalesLayerRoutes } from './server/modules/sales-layer';
import {
  registerRuntimeAgentRoutes,
  registerTelegramControlPlaneRoutes,
  startTelegramControlPlane,
  stopTelegramControlPlane,
} from './server/modules/control-plane';
import {
  maskSettingsSecrets,
  sendTestTelegram,
} from './server/notifications/telegramNotificationService';
import { testVpsConnection } from './server/agentSync/vpsClient';
import {
  startAgentSyncOutboxWorker,
  stopAgentSyncOutboxWorker,
} from './server/agentSync/outboxWorker';
import { getSyncOutboxStats, processOutboxBatch } from './server/agentSync/outboxService';
import { getAgentSchedulerStatus, startAgentScheduler, stopAgentScheduler } from './server/agent/agentScheduler';

/** Env truthy when unset uses `defaultWhenUnset` (production-safe defaults). */
function envFlagEnabled(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultWhenUnset;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

const FACEBOOK_GRAPH_LEGACY_ENABLED = envFlagEnabled('FACEBOOK_GRAPH_LEGACY_ENABLED', true);
const AGENT_ENABLED = envFlagEnabled('AGENT_ENABLED', true);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.set('trust proxy', true);
app.use(compression({ level: 6 }));
app.use(cacheControlMiddleware);

app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || '25mb',
  verify: (req, _res, buf) => {
    const url = req.url || '';
    if (url.startsWith('/webhooks/facebook') || url.startsWith('/api/agent-ingest/')) {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    }
  },
}));

if (FACEBOOK_GRAPH_LEGACY_ENABLED) {
  registerFacebookWebhookRoutes(app);
} else {
  console.warn('[facebook] Graph webhook routes disabled (FACEBOOK_GRAPH_LEGACY_ENABLED=false)');
}

const publicAssetsPath = path.join(process.cwd(), 'public');
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicAssetsPath, 'logo.jpg'));
});
app.use(express.static(publicAssetsPath, createPublicStaticOptions()));

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ status: 'error', message: 'JSON request không hợp lệ.' });
    return;
  }
  next(err);
});

// Log API requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API REQUEST] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();
  const scheduler = getAgentSchedulerStatus();
  res.json({
    status: dbStatus.ok ? 'success' : 'degraded',
    data: {
      service: 'real-estate-ai-marketing-agent-cms',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus.message,
      aiProvider: process.env.DEFAULT_AI_MODE || 'db-settings',
      scheduler: {
        enabled: scheduler.enabled,
        running: scheduler.running,
        tickIntervalMs: scheduler.tickIntervalMs,
        lastTickAt: scheduler.lastTickAt,
        lastError: scheduler.lastError,
        lastTickResult: scheduler.lastTickResult
          ? {
              skipped: scheduler.lastTickResult.skipped,
              reason: scheduler.lastTickResult.reason,
              sourcesDue: scheduler.lastTickResult.sourcesDue,
              jobsCreated: scheduler.lastTickResult.jobsCreated,
              jobsSkippedDuplicate: scheduler.lastTickResult.jobsSkippedDuplicate,
            }
          : null,
      },
    }
  });
});

const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-only-auth-secret-change-me';

function toAuthUser(user: User, db: any): AuthUser {
  const company = db.companies?.find((item: any) => item.id === user.company_id);
  const publicSlug = user.public_slug || `${slugifyAgentProfile(user.name)}-${user.id.slice(-4)}`;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company_id: user.company_id,
    company_name: company?.name,
    phone: user.phone,
    avatar_url: user.avatar_url,
    bio: user.bio,
    agent_tier: resolveAgentTier(user),
    public_slug: publicSlug,
    show_public_profile: user.show_public_profile !== false,
  };
}

function toPublicAgentProfile(user: User, db: any, propertyCount = 0): any {
  const auth = toAuthUser(user, db);
  if (user.status !== 'active' || user.show_public_profile === false) return null;
  return {
    id: auth.id,
    name: auth.name,
    phone: auth.phone,
    avatar_url: auth.avatar_url,
    bio: auth.bio,
    agent_tier: auth.agent_tier,
    public_slug: auth.public_slug,
    company_name: auth.company_name,
    property_count: propertyCount,
    profile_url: `/moi-gioi/${auth.public_slug}`,
  };
}

function countPublicAgentProperties(db: any, userId: string): number {
  return filterPublicProperties(db.properties || []).filter((property: Property) => {
    const creatorId = property.created_by_user_id || property.owner_user_id;
    return creatorId === userId;
  }).length;
}

function assertUniquePublicSlug(db: any, slug: string, userId: string, res: Response): boolean {
  const normalized = slugifyAgentProfile(slug);
  if (!normalized) {
    res.status(400).json({ status: 'error', message: 'Đường dẫn hồ sơ không hợp lệ.' });
    return false;
  }
  const conflict = (db.users || []).some((user: User) => (
    user.id !== userId
    && user.public_slug
    && user.public_slug.toLowerCase() === normalized
  ));
  if (conflict) {
    res.status(409).json({ status: 'error', message: 'Đường dẫn hồ sơ đã được sử dụng.' });
    return false;
  }
  return true;
}

function signToken(user: AuthUser): string {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    company_id: user.company_id,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token: string): { sub: string; exp: number } | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!decoded.exp || decoded.exp < Date.now()) return null;
  return decoded;
}

function getAuthUser(req: Request): AuthUser {
  return (req as any).authUser;
}

function scopeCollection<T extends { company_id?: string; owner_user_id?: string; assigned_member_ids?: string[] }>(items: T[], req: Request): T[] {
  const user = getAuthUser(req);
  if (user.role === 'owner') return items;
  if (user.role === 'company') {
    return items.filter(item => !item.company_id || item.company_id === user.company_id);
  }
  return items.filter(item => {
    const itemCompanyId = item.company_id || user.company_id;
    return itemCompanyId === user.company_id && (item.assigned_member_ids || []).includes(user.id);
  });
}

function canAccessResource(resource: { company_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (user.role === 'owner') return true;
  if (user.role === 'company') {
    return !resource.company_id || resource.company_id === user.company_id;
  }
  const companyId = resource.company_id || user.company_id;
  return companyId === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

function canManageResource(resource: { company_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (user.role === 'owner') return true;
  if (user.role === 'company') {
    return !resource.company_id || resource.company_id === user.company_id;
  }
  const companyId = resource.company_id || user.company_id;
  return companyId === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

function accessDefaults(req: Request, body: any = {}) {
  const user = getAuthUser(req);
  const company_id = user.role === 'owner' ? (body.company_id || 'comp-da-nang') : user.company_id;
  return {
    company_id,
    owner_user_id: user.role === 'company' ? user.id : body.owner_user_id || user.id,
    assigned_member_ids: user.role === 'member' ? [user.id] : (Array.isArray(body.assigned_member_ids) ? body.assigned_member_ids : [])
  };
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function extractQueryTokens(message: string) {
  const tokens = normalizeText(message)
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 2 && ![
      'toi', 'minh', 'can', 'tim', 'cho', 'hoi', 've', 'co', 'khong', 'duoc', 'gia',
      'nha', 'dat', 'bds', 'bat', 'dong', 'san', 'anh', 'chi', 'em', 'muon'
    ].includes(token));
  return Array.from(new Set(tokens)).slice(0, 20);
}

function extractBudget(message: string) {
  const normalized = normalizeText(message);
  const mixedBudget = normalized.match(/(\d+)\s*(?:ty|ti)\s*(\d+)/);
  if (mixedBudget) {
    return Number(`${mixedBudget[1]}.${mixedBudget[2]}`);
  }
  const matches = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(ty|ti|billion)?/g)]
    .map(match => Number(match[1].replace(',', '.')))
    .filter(value => Number.isFinite(value) && value > 0);
  return matches.length ? Math.max(...matches) : null;
}

function textScore(record: any, tokens: string[]) {
  if (!tokens.length) return 0;
  const haystack = normalizeText(JSON.stringify(record));
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function detectQueryIntent(message: string) {
  const normalized = normalizeText(message);
  if (/(khach|lead|crm|so dien thoai|phone)/.test(normalized)) return 'customers';
  if (/(bai dang|post|content|facebook|zalo|tiktok|website)/.test(normalized)) return 'posts';
  if (/(inbox|tin nhan|phan hoi)/.test(normalized)) return 'inbox';
  if (/(automation|tu dong|kich ban)/.test(normalized)) return 'automations';
  return 'properties';
}

function isGreetingOnlyMessage(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const hasSearchIntent = /(gia|bao nhieu|ty|trieu|m2|dien tich|phap ly|so hong|so do|vi tri|o dau|dia chi|nha|dat|can ho|shophouse|shop house|du an|dau tu|mua bds|ban nha|ban dat|thue|xem|tu van|hoa xuan|sonata|song han|bien)/.test(normalized);
  if (hasSearchIntent) return false;

  const asksIdentity = /(^|\s)(ban|em)?\s*(ten gi|la ai|la ai vay|ten la gi)(\s|$)/.test(normalized);
  const startsWithGreeting = /^(xin chao|chao|hello|hi|alo|aloo)\b/.test(normalized);
  if (startsWithGreeting && (asksIdentity || normalized.split(/\s+/).length <= 8)) return true;

  return /^(test|ok|cam on|thanks|thank you)(\s+(em|anh|chi|ban|shop|ad|admin|nhe|a|nha))*[.!?]*$/.test(normalized);
}

function isWeatherQuestion(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  return /(thoi tiet|du bao|weather|troi hom nay|hom nay troi|troi.*(mua|nang|lanh|nong)|ti.t)/.test(normalized);
}

function hasPublicRealEstateIntent(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const phraseIntent = /(bds|bat dong san|can ho|chung cu|shophouse|shop house|du an|mat tien|mat bang|kho bai|o dau|vi tri|dia chi|khu vuc|hoa xuan|hoa quy|son tra|lien chieu|ngu hanh son|sonata|song han|phao hoa|bao nhieu|ngan sach|dien tich|phap ly|so hong|so do|hoan cong|ban nha|ban dat|cho thue|dau tu|kinh doanh|homestay|xem nha|xem dat|lich xem|tu van)/.test(normalized);
  const wordIntent = /\b(nha|dat|lo|nen|xay|bien|gia|ty|ti|trieu|m2|mua|thue|spa)\b/.test(normalized);
  return phraseIntent || wordIntent;
}

async function generatePublicSmallTalkReply(message: string, recentHistory: string) {
  try {
    return await generateText(
      [
        'Bạn là Lily, trợ lý tư vấn bất động sản Đà Nẵng trên website Estoria.',
        'Tin nhắn hiện tại không có intent bất động sản rõ ràng.',
        'Hãy trả lời tự nhiên, vui vẻ, ngắn gọn bằng tiếng Việt trong 2-4 câu.',
        'Nếu người dùng hỏi chuyện thường thức, thời tiết, chào hỏi, đùa vui hoặc hỏi bâng quơ thì trả lời ở mức hữu ích vừa đủ.',
        'Không bịa dữ liệu realtime, tin tức mới, giá thị trường realtime, y tế/pháp lý/tài chính chuyên sâu. Nếu thiếu dữ liệu realtime thì nói rõ là em chưa có dữ liệu realtime.',
        'Luôn kết thúc bằng một câu chuyển hướng mềm về mua bán BĐS Đà Nẵng, ví dụ hỏi khách đang quan tâm nhà phố, đất nền, căn hộ, shophouse, khu vực hoặc ngân sách nào.',
        'Không giới thiệu sản phẩm cụ thể khi chưa có intent BĐS.'
      ].join('\n'),
      [
        `Lịch sử gần nhất:\n${recentHistory || 'Chưa có lịch sử.'}`,
        '',
        `Tin nhắn khách:\n${message}`
      ].join('\n'),
      { temperature: 0.7, timeoutMs: 12000 }
    );
  } catch (error) {
    console.error('Public small talk AI failed, using static redirect:', error instanceof Error ? error.message : error);
    return [
      'Dạ, câu này em trả lời nhanh trong phạm vi hỗ trợ được thôi ạ.',
      'Hiện em phù hợp nhất để hỗ trợ lọc BĐS Đà Nẵng theo khu vực, ngân sách, pháp lý và lịch xem thực tế.',
      'Anh/chị đang quan tâm nhà phố, đất nền, căn hộ hay shophouse để em tư vấn đúng hơn ạ?'
    ].join('\n\n');
  }
}

function compactProperty(property: Property) {
  return {
    id: property.id,
    title: property.title,
    type: property.type,
    location: property.location,
    area: property.area,
    price: property.price,
    legal_status: property.legal_status,
    direction: property.direction,
    road_width: property.road_width,
    sale_status: property.sale_status || 'available',
    description: String(property.rich_description || property.description || '').slice(0, 700),
    selling_points: (property.selling_points || []).slice(0, 6),
    internal_notes: String(property.internal_notes || '').slice(0, 300)
  };
}

const publicListingsPath = '/';

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function getPropertySlug(property: Property) {
  return `${slugify(property.title)}-${property.id}`;
}

function getPropertyPath(property: Property) {
  return `/${encodeURIComponent(getPropertySlug(property))}`;
}

function compactCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    source: customer.source,
    budget: customer.budget,
    interested_area: customer.interested_area,
    property_type: customer.property_type,
    status: customer.status,
    lead_score: customer.lead_score,
    notes: String(customer.notes || '').slice(0, 400),
    ai_summary: String(customer.ai_summary || '').slice(0, 400)
  };
}

function rankProperties(properties: Property[], message: string, limit = 5) {
  const tokens = extractQueryTokens(message);
  const budget = extractBudget(message);

  return properties
    .map(property => {
      const tokenScore = textScore(compactProperty(property), tokens);
      const budgetDistance = budget ? Math.abs(Number(property.price) - budget) : 0;
      const withinBudget = budget ? Number(property.price) <= budget * 1.15 : true;
      const availableBonus = property.sale_status === 'sold' ? -20 : 2;
      return {
        property,
        score: tokenScore * 12 + (withinBudget ? 4 : -budgetDistance * 3) + availableBonus
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.property);
}

function formatPublicPropertySuggestions(properties: Property[]) {
  if (!properties.length) {
    return 'Hiện danh sách BĐS chưa có sản phẩm công khai phù hợp để em gửi anh/chị.';
  }

  return properties.map((property, index) => {
    const cleanSnippet = (value: unknown, maxLength: number) => {
      const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
      return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
    };
    const sellingPoints = (property.selling_points || [])
      .map(point => cleanSnippet(point, 90))
      .filter(Boolean)
      .slice(0, 3);
    const description = cleanSnippet(property.description, 220);
    return [
      `### ${index + 1}. ${property.title}`,
      `- 📍 **Vị trí:** ${property.location}`,
      `- 💰 **Giá:** ${property.price} tỷ`,
      `- 📐 **Diện tích:** ${property.area}m²`,
      `- 📄 **Pháp lý:** ${property.legal_status}`,
      sellingPoints.length ? `- ✨ **Điểm đáng chú ý:** ${sellingPoints.join(' • ')}` : '',
      description ? `- 📝 **Mô tả nhanh:** ${description}` : '',
      `- 🔗 [**Xem chi tiết sản phẩm**](${getPropertyPath(property)})`
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function buildAssistantDbContext(db: any, req: Request, message: string) {
  const tokens = extractQueryTokens(message);
  const budget = extractBudget(message);
  const intent = detectQueryIntent(message);
  const customers = scopeCollection<Customer>(db.customers, req);
  const properties = scopeCollection<Property>(db.properties, req);
  const posts = scopeCollection<Post>(db.posts, req);
  const inbox = scopeCollection<InboxMessage>(db.inbox, req);
  const automations = scopeCollection<AutomationTask>(db.automations, req);
  const user = getAuthUser(req);
  const generatedContents = (db.generated_contents || []).filter((item: any) => {
    if (user.role === 'owner') return true;
    return item.company_id === user.company_id;
  });

  const rank = <T extends any>(items: T[], fallbackSort?: (a: T, b: T) => number) => items
    .map(item => ({ item, score: textScore(item, tokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return fallbackSort ? fallbackSort(a.item, b.item) : 0;
    })
    .map(entry => entry.item);

  const propertyMatches = rankProperties(properties, message, intent === 'properties' ? 5 : 2).map(compactProperty);
  const customerMatches = rank(customers, (a: Customer, b: Customer) => (b.lead_score || 0) - (a.lead_score || 0))
    .slice(0, intent === 'customers' ? 5 : 2)
    .map(compactCustomer);
  const postMatches = rank(posts, (a: Post, b: Post) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, intent === 'posts' ? 5 : 2)
    .map((post: Post) => ({
      id: post.id,
      title: post.title,
      platform: post.platform,
      status: post.status,
      property_title: post.property_title,
      content: String(post.content || '').slice(0, 500),
      created_at: post.created_at
    }));
  const inboxMatches = intent === 'inbox'
    ? rank(inbox, (a: InboxMessage, b: InboxMessage) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((item: InboxMessage) => ({
        id: item.id,
        sender_name: item.sender_name,
        platform: item.platform,
        intent: item.intent,
        status: item.status,
        message: String(item.message || '').slice(0, 400)
      }))
    : [];
  const contentMatches = intent === 'posts' ? rank(generatedContents).slice(0, 3).map((item: any) => ({
    id: item.id,
    channel: item.channel,
    property_title: item.property_title,
    status: item.status,
    raw_content: String(item.raw_content || '').slice(0, 500)
  })) : [];

  return {
    scope: {
      role: user.role,
      company_id: user.company_id,
      totalCustomers: customers.length,
      totalProperties: properties.length,
      totalPosts: posts.length,
      totalInbox: inbox.length,
      totalAutomations: automations.length,
      totalGeneratedContents: generatedContents.length
    },
    query: { intent, tokens, budget },
    customers: customerMatches,
    properties: propertyMatches,
    posts: postMatches,
    inbox: inboxMatches,
    automations: intent === 'automations' ? automations.slice(0, 5).map((item: AutomationTask) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      trigger_event: item.trigger_event,
      run_count: item.run_count,
      last_run: item.last_run
    })) : [],
    generatedContents: contentMatches
  };
}

function buildAssistantFallback(context: any) {
  const propertyLines = context.properties.slice(0, 5).map((property: Property) =>
    `- ${property.title}: ${property.location}, ${property.area}m2, ${property.price} tỷ, ${property.legal_status}, ${property.sale_status === 'sold' ? 'đã bán' : 'đang bán'}.`
  );
  const customerLines = context.customers.slice(0, 5).map((customer: Customer) =>
    `- ${customer.name}: ${customer.phone}, nhu cầu ${customer.property_type} tại ${customer.interested_area}, ngân sách ${customer.budget} tỷ, score ${customer.lead_score}.`
  );
  const postLines = context.posts.slice(0, 4).map((post: Post) =>
    `- [${post.platform}] ${post.title}: ${post.status}.`
  );

  return [
    'Em đã truy vấn database theo quyền hiện tại.',
    `Phạm vi dữ liệu: ${context.scope.totalCustomers} khách, ${context.scope.totalProperties} BĐS, ${context.scope.totalPosts} bài đăng, ${context.scope.totalInbox} inbox.`,
    context.query.budget ? `Ngân sách phát hiện: khoảng ${context.query.budget} tỷ.` : '',
    propertyLines.length ? `\nBĐS liên quan:\n${propertyLines.join('\n')}` : '\nChưa tìm thấy BĐS liên quan trong phạm vi quyền.',
    customerLines.length ? `\nKhách hàng liên quan:\n${customerLines.join('\n')}` : '',
    postLines.length ? `\nBài đăng liên quan:\n${postLines.join('\n')}` : '',
    '\nAI provider đang bận hoặc timeout nên em trả kết quả truy vấn DB trực tiếp trước.'
  ].filter(Boolean).join('\n');
}

function requireOwner(req: Request, res: Response): boolean {
  if (getAuthUser(req).role !== 'owner') {
    res.status(403).json({ status: 'error', message: 'Chỉ Owner có quyền thực hiện thao tác này.' });
    return false;
  }
  return true;
}

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const db = readDatabase();
  const user = db.users?.find(item => item.email === email && item.password === password && item.status === 'active');

  if (!user) {
    res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
    return;
  }

  const authUser = toAuthUser(user, db);
  res.json({ status: 'success', data: { token: signToken(authUser), user: authUser } });
});

app.get('/api/public/properties', (req: Request, res: Response) => {
  const cached = getCached<{
    status: string;
    data: Property[];
    meta: { projectDisplayOrder?: string[] };
  }>('public-properties');
  if (cached) {
    res.json(cached);
    return;
  }

  const settings = getSettings();
  const payload = {
    status: 'success',
    data: filterPublicProperties(getProperties()),
    meta: {
      projectDisplayOrder: settings.project_display_order?.length
        ? settings.project_display_order
        : undefined,
    },
  };
  setCached('public-properties', payload, 120_000);
  res.json(payload);
});

app.get('/api/public/homepage', async (req: Request, res: Response) => {
  const cached = getCached<{
    status: string;
    data: Record<string, unknown>;
  }>('public-homepage');
  if (cached) {
    res.json(cached);
    return;
  }

  const settings = getSettings();
  const publicProperties = filterPublicProperties(getProperties());
  let latestPosts: Array<{ slug: string; publishedAt: string | null }> = [];
  try {
    const posts = await getPublishedBlogPostsForSitemap();
    latestPosts = posts.slice(0, 6).map(post => ({
      slug: post.slug,
      publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
    }));
  } catch (error) {
    console.error('[homepage] blog query failed:', error);
  }

  const payload = {
    status: 'success',
    data: {
      properties: publicProperties,
      projectDisplayOrder: settings.project_display_order?.length
        ? settings.project_display_order
        : undefined,
      latestPosts,
      leadMagnets: LEAD_MAGNETS,
    },
  };
  setCached('public-homepage', payload, 180_000);
  res.json(payload);
});

app.get('/api/public/seo', async (req: Request, res: Response) => {
  const keywords = buildSiteSeoKeywords(
    getProperties().filter((property: Property) => !['sold', 'hidden'].includes(property.sale_status || 'available')),
    DEFAULT_SEO_KEYWORDS
  );
  await updateSettings({ seo_keywords: keywords });
  res.json({ status: 'success', data: { keywords } });
});

app.get('/api/public/agents', (req: Request, res: Response) => {
  const db = readDatabase();
  const agents = (db.users || [])
    .map((user: User) => toPublicAgentProfile(user, db, countPublicAgentProperties(db, user.id)))
    .filter(Boolean)
    .sort((a: any, b: any) => b.property_count - a.property_count || a.name.localeCompare(b.name, 'vi'));
  res.json({ status: 'success', data: agents });
});

app.get('/api/public/agents/by-user/:userId', (req: Request, res: Response) => {
  const db = readDatabase();
  const user = (db.users || []).find((item: User) => item.id === req.params.userId);
  if (!user) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy môi giới.' });
    return;
  }
  const profile = toPublicAgentProfile(user, db, countPublicAgentProperties(db, user.id));
  if (!profile) {
    res.status(404).json({ status: 'error', message: 'Hồ sơ môi giới không công khai.' });
    return;
  }
  res.json({ status: 'success', data: profile });
});

app.get('/api/public/agents/:slug', (req: Request, res: Response) => {
  const db = readDatabase();
  const slug = slugifyAgentProfile(req.params.slug);
  const user = (db.users || []).find((item: User) => {
    const itemSlug = item.public_slug || `${slugifyAgentProfile(item.name)}-${item.id.slice(-4)}`;
    return itemSlug.toLowerCase() === slug;
  });
  if (!user) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy môi giới.' });
    return;
  }
  const profile = toPublicAgentProfile(user, db, countPublicAgentProperties(db, user.id));
  if (!profile) {
    res.status(404).json({ status: 'error', message: 'Hồ sơ môi giới không công khai.' });
    return;
  }

  const properties = filterPublicProperties(getProperties()).filter((property: Property) => {
    const creatorId = property.created_by_user_id || property.owner_user_id;
    return creatorId === user.id;
  });

  res.json({ status: 'success', data: { ...profile, properties } });
});

// ----------------------------------------------------
// Public traffic tracking (register early, before static/vite fallbacks)
// ----------------------------------------------------
app.post('/api/public/track-view', async (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const propertyId = String(req.body?.propertyId || '').trim();
  const trackingType = String(req.body?.type || '').trim();

  let settings = getSettings();
  let property: Property | undefined;

  if (trackingType === 'site' || !propertyId) {
    settings = await updateSettings({
      site_view_count: Number(settings.site_view_count || 0) + 1,
      last_site_view_at: now
    } as AppSettings);
  }

  if (propertyId) {
    const current = getProperties().find((item: Property) => item.id === propertyId);
    if (current) {
      property = await updateProperty(propertyId, {
        public_view_count: Number(current.public_view_count || 0) + 1,
        last_public_view_at: now
      }) as Property;
    }
  }

  res.json({
    status: 'success',
    data: {
      tracked: true,
      siteViews: Number(settings.site_view_count || 0),
      lastSiteViewAt: settings.last_site_view_at,
      property: property
        ? {
            id: property.id,
            public_view_count: Number(property.public_view_count || 0),
            last_public_view_at: property.last_public_view_at
          }
        : null
    }
  });
});

app.get('/api/public/chat/history', (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  if (!sessionId) {
    res.status(400).json({ status: 'error', message: 'Thiếu mã phiên trò chuyện.' });
    return;
  }

  const history = getChatHistoryByUser(`public-${sessionId}`, 50)
    .slice(0, 50)
    .reverse();
  const guest = getPublicChatGuest(sessionId);

  res.json({
    status: 'success',
    data: history,
    guest: guest
      ? {
          session_id: guest.session_id,
          name: guest.name,
          phone: guest.phone
        }
      : null
  });
});

app.post('/api/public/chat/guest', async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const phone = String(req.body?.phone || '').trim().replace(/[^\d+.\-\s]/g, '').slice(0, 40);

  if (!sessionId || !name || !phone) {
    res.status(400).json({ status: 'error', message: 'Vui lòng nhập họ tên và số điện thoại để bắt đầu chat.' });
    return;
  }

  const customerId = `guest-${sessionId}`;
  const existingCustomer = getCustomers().find(customer => customer.id === customerId);
  if (!existingCustomer) {
    await createCustomer({
      id: customerId,
      name,
      phone,
      email: '',
      source: 'website',
      budget: 0,
      interested_area: '',
      property_type: 'Khác',
      status: 'new',
      notes: `Guest chat session: ${sessionId}`,
      ai_summary: 'Khách guest bắt đầu trò chuyện từ website.',
      lead_score: 35,
      created_at: new Date().toISOString(),
      company_id: 'comp-da-nang',
      owner_user_id: 'u-owner',
      assigned_member_ids: []
    } as Customer);
  }

  const guest = await upsertPublicChatGuest({ session_id: sessionId, name, phone, customer_id: customerId });
  res.json({ status: 'success', data: guest });
});

app.post('/api/public/contact', async (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const budget = String(req.body?.budget || '').trim();
  const area = String(req.body?.area || '').trim();
  const note = String(req.body?.note || '').trim();
  const email = String(req.body?.email || '').trim();

  if (!name || !phone) {
    res.status(400).json({ status: 'error', message: 'Vui lòng nhập tên và số điện thoại.' });
    return;
  }

  try {
    const lead = await processLeadCapture({
      name,
      phone,
      email: email || undefined,
      city: area || undefined,
      budget_range: budget.includes('10') ? 'over-10' : budget.includes('5') ? '5-10' : budget.includes('3') ? '3-5' : undefined,
      source: 'contact_form_legacy',
      form_type: 'simple',
      page_path: String(req.body?.page_path || ''),
      note: note || undefined,
    });
    res.json({
      status: 'success',
      data: {
        id: lead.id,
        investor_score: lead.investor_score,
        access_token: lead.access_token,
      },
    });
  } catch (error) {
    console.error('[Contact] lead capture failed:', error);
    res.status(500).json({ status: 'error', message: 'Không gửi được. Vui lòng gọi hotline.' });
  }
});

app.post('/api/public/chat', async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;

  if (!message || !String(message).trim()) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống.' });
    return;
  }

  const normalizedSessionId = String(sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const publicUserId = normalizedSessionId ? `public-${normalizedSessionId}` : 'public-visitor';
  const publicGuest = normalizedSessionId ? getPublicChatGuest(normalizedSessionId) : null;
  if (!publicGuest) {
    res.status(403).json({ status: 'error', message: 'Vui lòng nhập họ tên và số điện thoại để bắt đầu chat.' });
    return;
  }
  const recentHistoryRecords = getChatHistoryByUser(publicUserId, 6);
  const recentHistory = recentHistoryRecords
    .reverse()
    .map(item => `${item.role === 'user' ? 'Khách' : 'Lily'}: ${String(item.message || '').slice(0, 600)}`)
    .join('\n');
  const publicProperties = searchCmsRecords(
    'properties',
    extractQueryTokens(`${message}\n${recentHistory}`),
    30,
    { availableOnly: true }
  ) as Property[];
  const normalizedMessage = String(message)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  const isNegotiationQuestion = [
    /ban\s+khong/,
    /chot\s+(gia|duoc|khong)/,
    /bot\s+(duoc|khong|bao nhieu)/,
    /giam\s+(duoc|khong|bao nhieu)/,
    /thuong\s*luong/,
    /gia\s+.+\s+duoc\s+khong/,
    /\d+([.,]\d+)?\s*(ty|trieu).*(ban|chot|duoc)\s*(khong)?/
  ].some(pattern => pattern.test(normalizedMessage));
  const normalizedHistory = recentHistory.toLowerCase();
  const recentlyMentionedProperty = publicProperties
    .map((property: Property) => ({
      property,
      mentionIndex: normalizedHistory.lastIndexOf(property.title.toLowerCase())
    }))
    .filter(item => item.mentionIndex >= 0)
    .sort((a, b) => b.mentionIndex - a.mentionIndex)[0]?.property;
  const rankedPublicProperties = rankProperties(publicProperties, `${message}\n${recentHistory}`, 5);
  const retrievedPublicProperties = [
    ...(recentlyMentionedProperty ? [recentlyMentionedProperty] : []),
    ...rankedPublicProperties
  ].filter((property, index, items) => items.findIndex(item => item.id === property.id) === index).slice(0, 5);

  try {
    await saveChatMessage({
      id: `chat-public-${Date.now()}-user`,
      user_id: publicUserId,
      role: 'user',
      message,
      created_at: new Date().toISOString()
    });

    if (!Boolean(publicGuest.ai_enabled)) {
      res.json({
        status: 'success',
        aiPaused: true,
        data: '',
        message: 'Admin đang trực tiếp hỗ trợ cuộc trò chuyện này.'
      });
      return;
    }

    const hasRealEstateIntent = hasPublicRealEstateIntent(String(message));
    if (!hasRealEstateIntent) {
      const smallTalkResponse = await generatePublicSmallTalkReply(String(message), recentHistory);

      await saveChatMessage({
        id: `chat-public-${Date.now()}-model`,
        user_id: publicUserId,
        role: 'model',
        message: smallTalkResponse,
        created_at: new Date().toISOString()
      });

      res.json({ status: 'success', data: smallTalkResponse });
      return;
    }

    if (isGreetingOnlyMessage(String(message))) {
      const greetingResponse = [
        'Dạ chào anh/chị ạ, em là Lily bên Estoria.',
        'Anh/chị đang quan tâm loại BĐS nào ở Đà Nẵng để em lọc đúng nhu cầu hơn: nhà phố, đất nền, căn hộ hay shophouse ạ?'
      ].join('\n\n');

      await saveChatMessage({
        id: `chat-public-${Date.now()}-model`,
        user_id: publicUserId,
        role: 'model',
        message: greetingResponse,
        created_at: new Date().toISOString()
      });

      res.json({ status: 'success', data: greetingResponse });
      return;
    }

    if (isWeatherQuestion(String(message))) {
      const weatherResponse = [
        'Dạ, em chưa có dữ liệu thời tiết realtime để trả lời chính xác ạ.',
        'Anh/chị nên kiểm tra nhanh trên ứng dụng thời tiết để có thông tin cập nhật nhất.',
        'Nếu anh/chị cần xem BĐS Đà Nẵng theo khu vực, ngân sách hoặc mục đích mua ở/đầu tư thì em hỗ trợ lọc ngay ạ.'
      ].join('\n\n');

      await saveChatMessage({
        id: `chat-public-${Date.now()}-model`,
        user_id: publicUserId,
        role: 'model',
        message: weatherResponse,
        created_at: new Date().toISOString()
      });

      res.json({ status: 'success', data: weatherResponse });
      return;
    }

    if (!hasPublicRealEstateIntent(String(message))) {
      const offTopicResponse = [
        'Dạ, câu này em chưa có dữ liệu realtime để trả lời chính xác ạ.',
        'Anh/chị nên kiểm tra nhanh trên ứng dụng thời tiết để có thông tin cập nhật nhất.',
        'Nếu anh/chị cần xem BĐS Đà Nẵng theo khu vực, ngân sách hoặc mục đích mua ở/đầu tư thì em hỗ trợ lọc ngay ạ.'
      ].join('\n\n');

      await saveChatMessage({
        id: `chat-public-${Date.now()}-model`,
        user_id: publicUserId,
        role: 'model',
        message: offTopicResponse,
        created_at: new Date().toISOString()
      });

      res.json({ status: 'success', data: offTopicResponse });
      return;
    }

    if (isNegotiationQuestion) {
      const negotiationResponse = recentlyMentionedProperty
        ? `Dạ, mức giá anh/chị đề xuất em chưa thể xác nhận thay chủ được ạ. Nếu anh/chị thực sự quan tâm ${recentlyMentionedProperty.title}, anh/chị để lại số điện thoại để anh Linh bên em liên hệ trao đổi trực tiếp với chủ và phản hồi ngay cho mình nhé.\n\nAnh Linh: 0905 777 594\nChị Hằng: 0984 755 258`
        : 'Dạ, mức giá anh/chị đề xuất em chưa thể xác nhận thay chủ được ạ. Anh/chị cho em xin tên căn đang quan tâm và để lại số điện thoại, bên em sẽ liên hệ chủ rồi phản hồi ngay cho mình nhé.\n\nAnh Linh: 0905 777 594\nChị Hằng: 0984 755 258';

      await saveChatMessage({
        id: `chat-public-${Date.now()}-model`,
        user_id: publicUserId,
        role: 'model',
        message: negotiationResponse,
        created_at: new Date().toISOString()
      });

      res.json({ status: 'success', data: negotiationResponse });
      return;
    }

    const directProperty = recentlyMentionedProperty || (
      extractQueryTokens(String(message)).length > 0 ? retrievedPublicProperties[0] : undefined
    );
    const asksPrice = /(gia|bao nhieu|may ty)/.test(normalizedMessage);
    const asksLegal = /(phap ly|so hong|so do)/.test(normalizedMessage);
    const asksArea = /(dien tich|bao nhieu m|may m)/.test(normalizedMessage);
    const asksLocation = /(vi tri|o dau|dia chi)/.test(normalizedMessage);

    if (directProperty && (asksPrice || asksLegal || asksArea || asksLocation)) {
      const details = [
        asksPrice ? `mức giá ${directProperty.price} tỷ` : '',
        asksLegal ? `pháp lý ${directProperty.legal_status}` : '',
        asksArea ? `diện tích ${directProperty.area}m2` : '',
        asksLocation ? `vị trí ${directProperty.location}` : ''
      ].filter(Boolean).join(', ');
      const directResponse = [
        `Dạ, em gửi anh/chị thông tin đang cần về **${directProperty.title}**:`,
        `- ${details.split(', ').join('\n- ')}`,
        `- 🔗 [**Xem chi tiết sản phẩm**](${getPropertyPath(directProperty)})`,
        '**Anh/chị muốn em gửi thêm hình ảnh thực tế hay sắp xếp lịch xem ạ?**'
      ].join('\n\n');

      await saveChatMessage({
        id: `chat-public-${Date.now()}-model`,
        user_id: publicUserId,
        role: 'model',
        message: directResponse,
        created_at: new Date().toISOString()
      });
      res.json({ status: 'success', data: directResponse });
      return;
    }

    const propertyContext = JSON.stringify(retrievedPublicProperties.map(compactProperty), null, 2);
    console.log(`[PUBLIC RETRIEVAL] query="${String(message).slice(0, 80)}" selected=${retrievedPublicProperties.length} contextChars=${propertyContext.length}`);

    let aiResponse = await generateText(
      [
        'Bạn là Lily, chuyên viên tư vấn bất động sản thân thiện trên trang bán hàng.',
        'Chỉ tư vấn dựa trên danh sách bất động sản đang bán được cung cấp.',
        'Không nhắc dữ liệu CRM nội bộ, khách hàng nội bộ, quyền truy cập hoặc hệ thống quản trị.',
        'Nếu không có sản phẩm khớp tuyệt đối, hãy gợi ý 1-3 sản phẩm gần nhất và nói rõ điểm chưa khớp.',
        'Luôn trả lời bằng tiếng Việt tự nhiên, mềm mại như một chuyên viên tư vấn đang trò chuyện trực tiếp.',
        'Xưng "em" và gọi khách là "anh/chị"; có thể mở đầu bằng "Dạ chào anh/chị ạ" khi phù hợp.',
        'Mở đầu bằng cách ghi nhận đúng nhu cầu của khách, sau đó giới thiệu sản phẩm bằng câu nối tự nhiên như "bên em đang sẵn hàng..." hoặc "em thấy căn này khá hợp với nhu cầu của anh/chị".',
        'Khi giới thiệu từ 2 sản phẩm trở lên: TUYỆT ĐỐI không viết thành một đoạn văn liên tục. Mỗi sản phẩm phải là một block Markdown riêng, đánh số rõ ràng.',
        'Mỗi block sản phẩm phải có: tiêu đề, vị trí, giá, diện tích, pháp lý, 1-3 điểm đáng chú ý và lý do phù hợp. Dùng bullet, mỗi thông tin một dòng.',
        'Sau mỗi block sản phẩm phải có một dòng trống. Không đặt hai sản phẩm trên cùng một dòng.',
        'Mỗi sản phẩm bắt buộc có link xem chi tiết dạng slug SEO ở root domain: [Xem chi tiết sản phẩm](/<slug-title-id>).',
        'Khi chỉ giới thiệu 1 sản phẩm: vẫn chia thành đoạn ngắn và bullet thông tin chính để dễ đọc trên điện thoại.',
        'Kết thúc bằng một câu hỏi nhẹ nhàng để tiếp tục tư vấn hoặc mời khách để lại số điện thoại/Zalo, không thúc ép.',
        'Tránh các cụm từ cứng nhắc như "Dựa trên yêu cầu", "gợi ý sản phẩm phù hợp nhất là", "Nếu bạn quan tâm", "vui lòng để lại".',
        'Không lặp lại nguyên văn dữ liệu theo mẫu nhãn "Vị trí:", "Điểm nổi bật:" trừ khi khách yêu cầu bảng thông tin.',
        'Khi khách trả giá, hỏi bớt, hỏi chốt hoặc hỏi một mức giá có bán không: tuyệt đối không xác nhận có thể thương lượng và không tự cam kết thay chủ. Trả lời ngắn gọn rằng cần liên hệ trực tiếp, rồi cung cấp Anh Linh: 0905 777 594 và Chị Hằng: 0984 755 258.',
        'Có thể dùng emoji làm nhãn thông tin nhưng không lạm dụng.',
        'Format bắt buộc khi có nhiều sản phẩm:',
        'Mở đầu 1-2 câu ngắn.',
        '### 1. Tên sản phẩm',
        '- 📍 **Vị trí:** ...',
        '- 💰 **Giá:** ...',
        '- 📐 **Diện tích:** ...',
        '- 📄 **Pháp lý:** ...',
        '- ✨ **Điểm đáng chú ý:** ...',
        '- **Phù hợp khi:** ...',
        '- 🔗 [**Xem chi tiết sản phẩm**](/<slug-title-id>)',
        '### 2. Tên sản phẩm',
        '... cùng cấu trúc ...',
        'Kết thúc bằng 1-2 câu hỏi lọc nhu cầu, mỗi câu một dòng.'
      ].join('\n'),
      [
        `Các bất động sản liên quan nhất đã được backend truy xuất:\n${propertyContext || 'Chưa có sản phẩm công khai phù hợp.'}`,
        '',
        `Lịch sử trò chuyện gần nhất:\n${recentHistory || 'Đây là tin nhắn đầu tiên của khách.'}`,
        '',
        `Câu hỏi khách hàng: ${message}`,
        '',
        'Ví dụ về giọng văn mong muốn:',
        'Dạ chào anh/chị ạ. Với nhu cầu tìm căn có thể ngắm pháo hoa, bên em đang sẵn căn S161 – Sonata Townhouse khá phù hợp. Căn nằm ở vị trí đẹp bên sông Hàn nên vừa có view sông thoáng, vừa thuận tiện di chuyển ra biển và trung tâm thương mại. Em có thể gửi thêm hình ảnh thực tế và lịch xem căn để anh/chị tham khảo nhé?'
      ].join('\n')
    );
    let hasPropertyDetailLink = /\[[^\]]+\]\(\/[^)\s]+\)/.test(aiResponse);
    if (
      retrievedPublicProperties.length >= 2
      && (!/###\s+\d+\.|(?:^|\n)-\s+/m.test(aiResponse) || !hasPropertyDetailLink)
    ) {
      aiResponse = [
        'Dạ, em tách rõ từng sản phẩm để anh/chị dễ so sánh:',
        formatPublicPropertySuggestions(retrievedPublicProperties.slice(0, 3)),
        '**Anh/chị muốn em lọc tiếp theo khu vực, khoảng ngân sách hay loại hình nào ạ?**'
      ].join('\n\n');
      hasPropertyDetailLink = true;
    }
    if (!hasPropertyDetailLink) {
      const mentionedProperties = retrievedPublicProperties.filter(property =>
        aiResponse.toLowerCase().includes(property.title.toLowerCase())
      ).slice(0, 3);
      if (mentionedProperties.length) {
        aiResponse = [
          aiResponse,
          '**Xem chi tiết:**',
          ...mentionedProperties.map(property =>
            `- [${property.title}](${getPropertyPath(property)})`
          )
        ].join('\n\n');
      }
    }

    await saveChatMessage({
      id: `chat-public-${Date.now()}-model`,
      user_id: publicUserId,
      role: 'model',
      message: aiResponse,
      created_at: new Date().toISOString()
    });

    res.json({ status: 'success', data: aiResponse });
  } catch (err: any) {
    console.error('Public listing chat AI failed, using property fallback:', err.message || err);
    const suggestedProperties = recentlyMentionedProperty
      ? [recentlyMentionedProperty]
      : retrievedPublicProperties.slice(0, 3);
    const suggestions = formatPublicPropertySuggestions(suggestedProperties);

    const fallbackResponse = recentlyMentionedProperty
      ? [
          `Dạ, em gửi anh/chị thông tin rõ hơn về sản phẩm vừa hỏi:`,
          formatPublicPropertySuggestions([recentlyMentionedProperty]),
          '**Anh/chị muốn em gửi thêm hình ảnh thực tế hay sắp xếp lịch xem ạ?**'
        ].join('\n\n')
      : [
          'Dạ chào anh/chị ạ. Hiện kết nối tư vấn đang hơi chậm, em gửi trước một số sản phẩm đang sẵn hàng để anh/chị dễ so sánh:',
          suggestions,
          '**Để em lọc sát hơn, anh/chị đang ưu tiên tiêu chí nào nhất?**\n- Khu vực mong muốn\n- Khoảng ngân sách\n- Loại hình hoặc tiện ích cần có'
        ].join('\n\n');

    await saveChatMessage({
      id: `chat-public-${Date.now()}-model`,
      user_id: publicUserId,
      role: 'model',
      message: fallbackResponse,
      created_at: new Date().toISOString()
    });

    res.json({
      status: 'success',
      data: fallbackResponse
    });
  }
});

registerBlogPublicRoutes(app);
registerShortLinkPublicRoutes(app, getProperties);
registerShortLinkRedirect(app, getProperties);
app.use('/api/public', createInvestorLeadPublicRouter());

// Public social-draft images (unguessable names). Must be BEFORE /api auth gate
// so <img> preview and agent download work without Bearer token.
{
  const socialMediaDir = path.join(process.cwd(), 'runtime', 'social-media');
  fs.mkdirSync(socialMediaDir, { recursive: true });
  app.use(
    '/api/social/media/files',
    express.static(socialMediaDir, {
      fallthrough: false,
      index: false,
      setHeaders: (res: Response) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
}

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const pathName = String(req.path || '');
  const original = String(req.originalUrl || '');
  if (
    pathName === '/health' ||
    pathName === '/planning/health' ||
    pathName === '/auth/login' ||
    pathName.startsWith('/public/') ||
    pathName.startsWith('/agent-ingest/') ||
    // Execution Agent Runtime API authenticates via AGENT_RUNTIME_TOKEN (not CMS session).
    pathName.startsWith('/agent/runtime/') ||
    // Fallback allowlist if static middleware did not handle the file.
    (req.method === 'GET' &&
      (pathName.startsWith('/social/media/files/') ||
        pathName.startsWith('/api/social/media/files/') ||
        original.startsWith('/api/social/media/files/')))
  ) {
    return next();
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const decoded = token ? verifyToken(token) : null;
  const db = readDatabase();
  const user = decoded ? db.users?.find(item => item.id === decoded.sub && item.status === 'active') : null;

  if (!user) {
    res.status(401).json({ status: 'error', message: 'Bạn cần đăng nhập để truy cập hệ thống.' });
    return;
  }

  (req as any).authUser = toAuthUser(user, db);
  next();
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  res.json({ status: 'success', data: getAuthUser(req) });
});

app.put('/api/auth/profile', async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const db = readDatabase();
  const index = db.users.findIndex((user: User) => user.id === authUser.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy tài khoản.' });
    return;
  }

  const target = db.users[index] as User;
  const body = req.body || {};
  const nextName = body.name !== undefined ? String(body.name).trim() : target.name;
  const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : target.email;
  const nextPhone = body.phone !== undefined ? String(body.phone).trim() : (target.phone || '');
  const nextBio = body.bio !== undefined ? String(body.bio).trim().slice(0, 600) : (target.bio || '');
  let nextAvatarUrl = body.avatar_url !== undefined ? String(body.avatar_url).trim() : target.avatar_url;
  const nextShowPublic = body.show_public_profile !== undefined
    ? body.show_public_profile !== false
    : target.show_public_profile !== false;

  if (body.image !== undefined) {
    const image = String(body.image || '').trim();
    if (image) {
      try {
        nextAvatarUrl = saveImageFromDataUrl(image, 'agent-avatars', authUser.id);
      } catch (error: any) {
        res.status(400).json({ status: 'error', message: error.message || 'Upload avatar thất bại.' });
        return;
      }
    }
  }

  let nextPublicSlug = target.public_slug;
  if (body.public_slug !== undefined) {
    nextPublicSlug = slugifyAgentProfile(String(body.public_slug || ''));
    if (!assertUniquePublicSlug(db, nextPublicSlug, target.id, res)) return;
  } else if (!nextPublicSlug) {
    nextPublicSlug = `${slugifyAgentProfile(nextName)}-${target.id.slice(-4)}`;
  }

  if (!nextName || !nextEmail) {
    res.status(400).json({ status: 'error', message: 'Tên và email là bắt buộc.' });
    return;
  }

  if (db.users.some((user: User) => user.id !== target.id && user.email.toLowerCase() === nextEmail)) {
    res.status(409).json({ status: 'error', message: 'Email đã được sử dụng.' });
    return;
  }

  let nextPassword = target.password;
  const newPassword = String(body.new_password || '').trim();
  if (newPassword) {
    const currentPassword = String(body.current_password || '');
    if (!currentPassword || currentPassword !== target.password) {
      res.status(400).json({ status: 'error', message: 'Mật khẩu hiện tại không đúng.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ status: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }
    nextPassword = newPassword;
  }

  db.users[index] = {
    ...target,
    name: nextName,
    email: nextEmail,
    phone: nextPhone || undefined,
    bio: nextBio || undefined,
    avatar_url: nextAvatarUrl || undefined,
    public_slug: nextPublicSlug,
    show_public_profile: nextShowPublic,
    password: nextPassword,
  };

  await writeDatabase(db);
  res.json({ status: 'success', data: toAuthUser(db.users[index], db) });
});

registerInvestorLeadAdminRoutes(app);
registerBlogAdminRoutes(app);
registerShortLinkAdminRoutes(app);
if (FACEBOOK_GRAPH_LEGACY_ENABLED) {
  registerFacebookAdminRoutes(app);
}
if (AGENT_ENABLED) {
  registerAgentAdminRoutes(app, { getAuthUser, accessDefaults });
  registerSocialPublishingRoutes(app, { getAuthUser, accessDefaults });
  registerRuntimeAgentRoutes(app);
  registerTelegramControlPlaneRoutes(app);
  registerPlanningRoutes(app);
  registerLeadAcquisitionRoutes(app);
  registerSalesLayerRoutes(app);
} else {
  console.warn('[agent] Admin agent routes disabled (AGENT_ENABLED=false)');
}
registerAgentIngestRoutes(app, { getAuthUser, accessDefaults });
if (AGENT_ENABLED) {
  // Unknown /api/agent/* must stay JSON (never SPA HTML → "Phản hồi không đúng JSON").
  // Must run AFTER all /api/agent registrations (admin + ingest credentials).
  app.use('/api/agent', (_req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message:
        'Agent API route không tồn tại. Restart server nếu vừa thêm endpoint mới (operations/fleet/runtime).',
    });
  });
} else {
  // Never fall through to Vite HTML for /api/agent/* — frontend expects JSON.
  app.use('/api/agent', (_req: Request, res: Response) => {
    res.status(503).json({
      status: 'error',
      message: 'AI Agent API đang tắt (AGENT_ENABLED=false). Bật flag trong .env rồi restart server.',
    });
  });
}
// Unknown /api/social/* must stay JSON (never SPA HTML → "Phản hồi không đúng JSON").
app.use('/api/social', (_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Social API route không tồn tại. Restart server nếu vừa thêm endpoint mới.',
  });
});

function canManageUsers(req: Request, res: Response): boolean {
  const user = getAuthUser(req);
  if (user.role === 'owner' || user.role === 'company') return true;
  res.status(403).json({ status: 'error', message: 'Bạn không có quyền quản lý user.' });
  return false;
}

function scopeUsers(users: User[], req: Request): User[] {
  const user = getAuthUser(req);
  if (user.role === 'owner') return users;
  if (user.role === 'company') return users.filter(item => item.company_id === user.company_id && item.role !== 'owner');
  return [];
}

function countActiveOwners(users: User[]): number {
  return users.filter(item => item.role === 'owner' && item.status === 'active').length;
}

function assertCanUpdateUser(authUser: AuthUser, target: User, res: Response): boolean {
  const isSelf = authUser.id === target.id;

  if (authUser.role === 'owner') return true;

  if (authUser.role === 'company') {
    if (target.company_id !== authUser.company_id) {
      res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật user này.' });
      return false;
    }
    if (!isSelf && target.role !== 'member') {
      res.status(403).json({ status: 'error', message: 'Company admin chỉ được cập nhật member trong company.' });
      return false;
    }
    return true;
  }

  res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật user.' });
  return false;
}

app.get('/api/users', (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;
  const db = readDatabase();
  res.json({ status: 'success', data: scopeUsers(db.users || [], req) });
});

app.post('/api/users', async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();

  if (!body.name || !email || !body.password) {
    res.status(400).json({ status: 'error', message: 'Tên, email và password là bắt buộc.' });
    return;
  }

  if (db.users.some((user: User) => user.email.toLowerCase() === email)) {
    res.status(409).json({ status: 'error', message: 'Email đã tồn tại.' });
    return;
  }

  const role = authUser.role === 'owner' ? (body.role || 'member') : 'member';
  if (!['owner', 'company', 'member'].includes(role)) {
    res.status(400).json({ status: 'error', message: 'Role không hợp lệ.' });
    return;
  }

  if (authUser.role === 'company' && role !== 'member') {
    res.status(403).json({ status: 'error', message: 'Company admin chỉ được tạo member.' });
    return;
  }

  const company_id = authUser.role === 'owner'
    ? (body.company_id || (role === 'owner' ? undefined : authUser.company_id || 'comp-da-nang'))
    : authUser.company_id;

  const newUser: User = {
    id: `u-${Date.now()}`,
    name: String(body.name).trim(),
    email,
    password: String(body.password),
    role,
    company_id,
    status: body.status === 'inactive' ? 'inactive' : 'active',
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);
  await writeDatabase(db);
  res.json({ status: 'success', data: newUser });
});

app.put('/api/users/:id', async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const index = db.users.findIndex((user: User) => user.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy user.' });
    return;
  }

  const target = db.users[index] as User;
  if (!assertCanUpdateUser(authUser, target, res)) return;

  const body = req.body || {};
  const isSelf = authUser.id === target.id;
  const nextName = body.name !== undefined ? String(body.name).trim() : target.name;
  const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : target.email;

  if (!nextName || !nextEmail) {
    res.status(400).json({ status: 'error', message: 'Tên và email là bắt buộc.' });
    return;
  }

  if (db.users.some((user: User) => user.id !== target.id && user.email.toLowerCase() === nextEmail)) {
    res.status(409).json({ status: 'error', message: 'Email đã tồn tại.' });
    return;
  }

  let nextRole = target.role;
  if (authUser.role === 'owner' && body.role !== undefined) {
    if (!['owner', 'company', 'member'].includes(body.role)) {
      res.status(400).json({ status: 'error', message: 'Role không hợp lệ.' });
      return;
    }
    nextRole = body.role;
  }

  let nextCompanyId = target.company_id;
  if (authUser.role === 'owner' && body.company_id !== undefined) {
    nextCompanyId = body.company_id ? String(body.company_id).trim() : undefined;
  }
  if (nextRole === 'owner') {
    nextCompanyId = undefined;
  }

  let nextStatus = target.status;
  if (body.status === 'inactive' || body.status === 'active') {
    if (isSelf && body.status === 'inactive') {
      res.status(400).json({ status: 'error', message: 'Bạn không thể tự vô hiệu hóa tài khoản của mình.' });
      return;
    }
    if (authUser.role === 'owner' || (authUser.role === 'company' && target.role === 'member')) {
      nextStatus = body.status;
    }
  }

  if (target.role === 'owner' && nextRole !== 'owner' && countActiveOwners(db.users) <= 1) {
    res.status(400).json({ status: 'error', message: 'Không thể hạ quyền owner cuối cùng.' });
    return;
  }

  if (target.role === 'owner' && nextStatus === 'inactive' && countActiveOwners(db.users) <= 1) {
    res.status(400).json({ status: 'error', message: 'Không thể vô hiệu hóa owner cuối cùng.' });
    return;
  }

  let nextAgentTier = target.agent_tier || 'normal';
  if (authUser.role === 'owner' && body.agent_tier !== undefined) {
    const tier = String(body.agent_tier) as AgentTier;
    if (!['legendary', 'diamond', 'gold', 'silver', 'bronze', 'normal'].includes(tier)) {
      res.status(400).json({ status: 'error', message: 'Bậc agent không hợp lệ.' });
      return;
    }
    if (tier === 'legendary' && nextRole !== 'owner') {
      res.status(400).json({ status: 'error', message: 'Bậc Administrator chỉ dành cho chủ sở hữu.' });
      return;
    }
    nextAgentTier = tier;
  }
  if (nextRole === 'owner') {
    nextAgentTier = 'legendary';
  } else if (nextAgentTier === 'legendary') {
    nextAgentTier = 'normal';
  }

  db.users[index] = {
    ...target,
    name: nextName,
    email: nextEmail,
    password: body.password ? String(body.password) : target.password,
    role: nextRole,
    company_id: nextCompanyId,
    status: nextStatus,
    agent_tier: nextAgentTier,
  };

  await writeDatabase(db);
  res.json({ status: 'success', data: db.users[index] });
});

type MemberPermissionCollection = 'customers' | 'properties' | 'posts';

app.post('/api/member-permissions/bulk', async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const memberId = String(req.body?.member_id || '').trim();
  const collection = String(req.body?.collection || '') as MemberPermissionCollection;
  const assign = req.body?.assign !== false;
  const resourceIds = Array.isArray(req.body?.resource_ids)
    ? req.body.resource_ids.map((id: unknown) => String(id))
    : null;

  if (!memberId || !['customers', 'properties', 'posts'].includes(collection)) {
    res.status(400).json({ status: 'error', message: 'Thiếu member_id hoặc collection không hợp lệ.' });
    return;
  }

  const authUser = getAuthUser(req);
  const db = readDatabase();
  const items = db[collection] as Array<{ id: string; company_id?: string; assigned_member_ids?: string[] }>;

  const targets = items.filter(item => {
    if (resourceIds && !resourceIds.includes(item.id)) return false;
    if (authUser.role === 'company' && item.company_id && item.company_id !== authUser.company_id) return false;
    const assigned = (item.assigned_member_ids || []).includes(memberId);
    return assign ? !assigned : assigned;
  });

  let updated = 0;
  for (const item of targets) {
    const index = items.findIndex(row => row.id === item.id);
    if (index < 0) continue;

    const assignedIds = item.assigned_member_ids || [];
    const nextAssignedIds = assign
      ? [...new Set([...assignedIds, memberId])]
      : assignedIds.filter(id => id !== memberId);

    const companyId = items[index].company_id || authUser.company_id || 'comp-da-nang';
    const nextItem = {
      ...items[index],
      assigned_member_ids: nextAssignedIds,
      company_id: companyId,
    };

    if (collection === 'properties') {
      db.properties[index] = applyPropertyHashtagSeo(nextItem as Property);
    } else {
      db[collection][index] = nextItem;
    }
    updated += 1;
  }

  if (updated > 0) {
    if (collection === 'properties') {
      syncSiteSeoKeywords(db);
    }
    await writeDatabase(db);
    if (collection === 'properties') {
      clearCacheKey('public-properties');
      clearCacheKey('public-homepage');
    }
  }

  res.json({
    status: 'success',
    data: {
      updated,
      collection,
      member_id: memberId,
      assign,
      items: scopeCollection(db[collection], req),
    },
  });
});

// Helper to trigger automated tasks simulation based on event
function triggerAutomationEvent(event: string, detail: string, db: any) {
  const now = new Date().toISOString();
  db.automations = db.automations.map((auto: AutomationTask) => {
    if (auto.status === 'active' && auto.trigger_event.toLowerCase().includes(event.toLowerCase())) {
      const logMsg = `${now} - Triggered by event: [${detail}] - Executed successfully.`;
      return {
        ...auto,
        last_run: now,
        run_count: auto.run_count + 1,
        logs: [logMsg, ...auto.logs].slice(0, 20) // Keep last 20 logs
      };
    }
    return auto;
  });
}

// ----------------------------------------------------
// Dashboard Summary API
// ----------------------------------------------------
app.get('/api/dashboard', (req: Request, res: Response) => {
  const db = readDatabase();
  const customers = scopeCollection(db.customers, req);
  const properties = scopeCollection(db.properties, req);
  const posts = scopeCollection(db.posts, req);
  const inbox = scopeCollection(db.inbox, req);
  
  // Counts
  const totalCustomers = customers.length;
  const leadHot = customers.filter(c => c.status === 'hot').length;
  const leadWarm = customers.filter(c => c.status === 'warm').length;
  const leadCold = customers.filter(c => c.status === 'new').length;
  
  const totalProperties = properties.filter(p => !['sold', 'hidden'].includes(p.sale_status || 'available')).length;
  const totalPosts = posts.length;
  const pendingInbox = inbox.filter(i => i.status === 'pending').length;
  const propertyViews = properties.reduce((sum, property: Property) => sum + Number(property.public_view_count || 0), 0);
  const siteViews = Number((db.settings as any).site_view_count || 0);
  const postViews = posts.reduce((sum, post: Post) => sum + Number(post.engagement?.views || 0), 0);
  const topProperties = properties
    .filter((property: Property) => !['sold', 'hidden'].includes(property.sale_status || 'available'))
    .sort((a: Property, b: Property) => Number(b.public_view_count || 0) - Number(a.public_view_count || 0))
    .slice(0, 10)
    .map((property: Property) => ({
      id: property.id,
      title: property.title,
      views: Number(property.public_view_count || 0),
      lastViewAt: property.last_public_view_at
    }));
  const topPosts = posts
    .slice()
    .sort((a: Post, b: Post) => Number(b.engagement?.views || 0) - Number(a.engagement?.views || 0))
    .slice(0, 10)
    .map((post: Post) => ({
      id: post.id,
      title: post.title,
      platform: post.platform,
      views: Number(post.engagement?.views || 0)
    }));

  const metrics = ['facebook', 'zalo', 'tiktok', 'website'].map(platform => {
    const platformPosts = posts.filter(post => post.platform === platform);
    return {
      platform,
      reach: platformPosts.reduce((sum, post) => sum + (post.engagement?.views || 0), 0),
      engagement: platformPosts.reduce(
        (sum, post) => sum
          + (post.engagement?.likes || 0)
          + (post.engagement?.shares || 0)
          + (post.engagement?.comments || 0),
        0
      ),
      leads: customers.filter(customer => customer.source === platform).length
    };
  });

  res.json({
    status: 'success',
    data: {
      stats: {
        totalCustomers,
        leads: { hot: leadHot, warm: leadWarm, cold: leadCold },
        totalProperties,
        totalPosts,
        pendingInbox,
        siteViews,
        propertyViews,
        postViews,
        todayTasksCount: customers.filter(c => c.lead_score > 80 && c.status === 'hot').length,
      },
      metrics,
      traffic: {
        lastSiteViewAt: (db.settings as any).last_site_view_at,
        topProperties,
        topPosts
      }
    }
  });
});

// Lightweight sidebar badges — counts only, no entity lists.
app.get('/api/navigation-counts', async (req: Request, res: Response) => {
  try {
    const db = readDatabase();
    const customers = scopeCollection(db.customers, req);
    const properties = scopeCollection(db.properties, req);
    const posts = scopeCollection(db.posts, req);
    const inbox = scopeCollection(db.inbox, req);
    const user = getAuthUser(req);

    const adminVisibleProperties = properties.filter(p => getPropertySaleStatus(p) !== 'hidden').length;
    const pendingInbox = inbox.filter(i => i.status === 'pending').length;

    let leadIntelligence = 0;
    let externalInventory = 0;
    let notifications = 0;
    let jobs = 0;
    let sources = 0;

    if (AGENT_ENABLED) {
      const agentCounts = await getAgentDashboardCounts(user);
      leadIntelligence = agentCounts.newFindings;
      notifications = agentCounts.unreadNotifications;
      jobs = agentCounts.queuedJobs + agentCounts.runningJobs;
      sources = agentCounts.activeSources;
      const companyScope = buildCompanyScopeFilter(user);
      externalInventory = await prisma.externalInventoryItem.count({
        where: {
          ...companyScope,
          status: { notIn: ['archived', 'converted'] },
        },
      }).catch(() => 0);
    }

    const investorLeads = await countInvestorLeads({ includeConverted: false }).catch(() => 0);

    // Lightweight chat badges (counts only — same semantics as pre–Batch 5 App list.length).
    const websiteChat = getPublicChatGuests().length;
    const chatHistoryScoped = (db.chat_history || []).filter((item: { user_id?: string; company_id?: string }) => {
      if (user.role === 'owner') return true;
      if (user.role === 'company') return item.company_id === user.company_id;
      return item.user_id === user.id;
    });
    const chatHistory = new Set(chatHistoryScoped.map((item: { user_id?: string }) => item.user_id).filter(Boolean)).size;

    res.json({
      status: 'success',
      data: {
        crm: customers.length,
        properties: adminVisibleProperties,
        posts: posts.length,
        pendingInbox,
        leadIntelligence,
        investorLeads,
        externalInventory,
        notifications,
        jobs,
        sources,
        websiteChat,
        chatHistory,
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error?.message || 'Không lấy được navigation counts.' });
  }
});

// ----------------------------------------------------
// Customers API (CRUD)
// ----------------------------------------------------
app.get('/api/customers', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(db.customers, req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);

  if (search) {
    items = items.filter(c =>
      matchesSearchText(
        [c.name, c.phone, c.email, c.interested_area, c.property_type, c.notes, c.ai_summary].join(' '),
        search,
      ),
    );
  }
  if (status) {
    items = items.filter(c => String(c.status || '') === status);
  }
  if (sort === 'score_desc') {
    items = items.slice().sort((a, b) => Number(b.lead_score || 0) - Number(a.lead_score || 0));
  } else if (sort === 'created_at_asc') {
    items = items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  } else if (sort === 'created_at_desc' || sort) {
    items = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

app.post('/api/customers', async (req: Request, res: Response) => {
  const db = readDatabase();
  const customerData = req.body;
  
  const newCustomer: Customer = {
    id: `c-${Date.now()}`,
    name: customerData.name || 'Khách hàng mới',
    phone: customerData.phone || '',
    email: customerData.email || '',
    source: customerData.source || 'website',
    budget: parseFloat(customerData.budget) || 0,
    interested_area: customerData.interested_area || 'Đà Nẵng',
    property_type: customerData.property_type || 'Đất nền',
    status: customerData.status || 'new',
    notes: customerData.notes || '',
    ai_summary: customerData.ai_summary || 'Chưa phân tích',
    lead_score: parseInt(customerData.lead_score) || 50,
    created_at: new Date().toISOString(),
    ...accessDefaults(req, customerData)
  };

  db.customers.push(newCustomer);
  
  // Lead score automation trigger
  if (newCustomer.lead_score > 80) {
    triggerAutomationEvent('Lead Score vượt mốc 80', `Khách hàng tiềm năng: ${newCustomer.name}`, db);
  }

  await writeDatabase(db);
  res.json({ status: 'success', data: newCustomer });
});

app.put('/api/customers/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.customers.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng' });
    return;
  }

  if (!canManageResource(db.customers[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật khách hàng này.' });
    return;
  }

  const oldCustomer = db.customers[index];
  const updatedCustomer = {
    ...oldCustomer,
    ...req.body,
    updated_at: new Date().toISOString()
  };

  db.customers[index] = updatedCustomer;

  // Check if score changed above 80
  if (updatedCustomer.lead_score > 80 && oldCustomer.lead_score <= 80) {
    triggerAutomationEvent('Lead Score vượt mốc 80', `Cập nhật khách hàng VIP: ${updatedCustomer.name}`, db);
  }

  await writeDatabase(db);
  res.json({ status: 'success', data: updatedCustomer });
});

app.delete('/api/customers/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const target = db.customers.find(c => c.id === req.params.id);
  const filtered = db.customers.filter(c => c.id !== req.params.id);
  
  if (filtered.length === db.customers.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa khách hàng này.' });
    return;
  }

  db.customers = filtered;
  await writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa khách hàng thành công' });
});

// POST /api/ai/analyze-customer
app.post('/api/ai/analyze-customer', async (req: Request, res: Response) => {
  const { customerId } = req.body;
  const db = readDatabase();
  const customer = db.customers.find(c => c.id === customerId);

  if (!customer) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng để phân tích.' });
    return;
  }

  if (!canAccessResource(customer, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền phân tích khách hàng này.' });
    return;
  }

  try {
    const analysis = await analyzeCustomerWithAI(customer);
    customer.ai_summary = analysis.ai_summary;
    customer.lead_score = analysis.lead_score;
    
    // Check if score changed above 80
    if (customer.lead_score > 80) {
      triggerAutomationEvent('Lead Score vượt mốc 80', `AI chấm điểm VIP: ${customer.name}`, db);
    }

    await writeDatabase(db);
    res.json({ status: 'success', data: customer });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ----------------------------------------------------
// Properties API (CRUD)
// ----------------------------------------------------
app.get('/api/properties', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(sortByCreatedAtDesc(db.properties), req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);
  const type = String(req.query.type || '').trim();
  const transactionType = String(req.query.transactionType || req.query.transaction_type || '').trim();

  if (search) {
    items = items.filter(p =>
      matchesSearchText(
        [
          p.title,
          p.location,
          p.type,
          p.transaction_type || '',
          p.legal_status,
          p.direction,
          p.rich_description || p.description || '',
          p.internal_notes || '',
          getPropertySaleStatus(p),
        ].join(' '),
        search,
      ),
    );
  }
  if (status && status !== 'all') {
    if (status === 'visible') {
      items = items.filter(p => getPropertySaleStatus(p) !== 'hidden');
    } else {
      items = items.filter(p => getPropertySaleStatus(p) === status);
    }
  }
  if (type && type !== 'all') {
    items = items.filter(p => p.type === type);
  }
  if (transactionType && transactionType !== 'all') {
    items = items.filter(p => (p.transaction_type || 'Bán') === transactionType);
  }
  if (sort === 'price_asc') {
    items = items.slice().sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === 'price_desc') {
    items = items.slice().sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else if (sort === 'created_at_asc') {
    items = items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

app.post('/api/properties', async (req: Request, res: Response) => {
  const db = readDatabase();
  const propData = req.body;
  
  const now = new Date().toISOString();
  const authUser = getAuthUser(req);
  const newProperty: Property = {
    id: `p-${Date.now()}`,
    created_at: now,
    created_by_user_id: authUser.id,
    title: propData.title || 'BĐS Chưa đặt tên',
    transaction_type: String(propData.transaction_type || '').toLowerCase() === 'cho thuê' ? 'Cho thuê' : 'Bán',
    type: propData.type || 'Đất nền',
    location: propData.location || '',
    area: parseFloat(propData.area) || 0,
    floor_area: parseFloat(propData.floor_area) || undefined,
    price: parseFloat(propData.price) || 0,
    legal_status: propData.legal_status || 'Sổ hồng riêng',
    direction: propData.direction || 'Đông',
    road_width: parseFloat(propData.road_width) || 5.5,
    floors: parseInt(propData.floors, 10) || undefined,
    bedrooms: parseInt(propData.bedrooms, 10) || undefined,
    bathrooms: parseInt(propData.bathrooms, 10) || undefined,
    garage: Boolean(propData.garage),
    pool: Boolean(propData.pool),
    description: propData.description || '',
    rich_description: propData.rich_description || propData.description || '',
    internal_notes: propData.internal_notes || '',
    sale_status: propData.sale_status === 'sold' || propData.sale_status === 'hidden' ? propData.sale_status : 'available',
    is_featured: Boolean(propData.is_featured),
    public_view_count: Number(propData.public_view_count || 0),
    images: propData.images || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
    gallery_images: Array.isArray(propData.gallery_images) ? propData.gallery_images : [],
    selling_points: Array.isArray(propData.selling_points) ? propData.selling_points : [propData.selling_points || 'Vị trí lý tưởng'],
    ...accessDefaults(req, propData)
  };

  db.properties.unshift(newProperty);
  
  // Trigger automation: Khi thêm mới bất động sản
  triggerAutomationEvent('Khi thêm mới bất động sản', `Thêm BĐS: ${newProperty.title}`, db);

  const indexedProperty = 0;
  db.properties[indexedProperty] = applyPropertyHashtagSeo(db.properties[indexedProperty]);
  syncSiteSeoKeywords(db);

  await writeDatabase(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: db.properties[indexedProperty] });
});

app.put('/api/properties/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.properties.findIndex(p => p.id === req.params.id);
  
  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
    return;
  }

  if (!canManageResource(db.properties[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật bất động sản này.' });
    return;
  }

  db.properties[index] = applyPropertyHashtagSeo({
    ...db.properties[index],
    ...req.body,
    created_by_user_id:
      db.properties[index].created_by_user_id
      || db.properties[index].owner_user_id,
    public_view_count: req.body.public_view_count ?? db.properties[index].public_view_count ?? 0,
    last_public_view_at: req.body.last_public_view_at ?? db.properties[index].last_public_view_at
  });

  syncSiteSeoKeywords(db);
  await writeDatabase(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: db.properties[index] });
});

app.delete('/api/properties/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.properties.findIndex(p => p.id === req.params.id);
  const target = index >= 0 ? db.properties[index] : null;
  
  if (!target || index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa bất động sản này.' });
    return;
  }

  db.properties[index] = {
    ...db.properties[index],
    sale_status: 'hidden'
  };
  await writeDatabase(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: db.properties[index], message: 'Soft deleted property.' });
  return;
  await writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa bất động sản thành công' });
});

// POST /api/ai/generate-content
app.post('/api/ai/generate-content', async (req: Request, res: Response) => {
  const { propertyId, tone } = req.body;
  const db = readDatabase();
  const property = db.properties.find(p => p.id === propertyId);
  const user = getAuthUser(req);

  if (!property) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản để tạo marketing.' });
    return;
  }

  if (!canAccessResource(property, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền tạo nội dung cho bất động sản này.' });
    return;
  }

  try {
    const content = await generatePropertyMarketingContent(property, undefined, tone);
    property.ai_posts = content;
    
    // Auto populate posts CMS draft if requested or trigger automation representation
    const platformKeys: ('facebook' | 'zalo' | 'tiktok' | 'website')[] = ['facebook', 'zalo', 'tiktok', 'website'];
    for (const platform of platformKeys) {
      if (content[platform]) {
        await saveGeneratedContent({
          id: `gen-${Date.now()}-${platform}`,
          company_id: property.company_id,
          user_id: user.id,
          property_id: property.id,
          property_title: property.title,
          channel: platform,
          raw_content: content[platform],
          status: 'raw',
          created_at: new Date().toISOString()
        });

        // Check if there is already an AI post draft for this property/platform to update or add
        const existingPost = db.posts.find(post => post.property_id === propertyId && post.platform === platform && post.status === 'draft');
        if (existingPost) {
          existingPost.content = content[platform];
          existingPost.title = content.seo?.title || existingPost.title;
          existingPost.seo_title = content.seo?.title;
          existingPost.meta_description = content.seo?.meta_description;
          existingPost.keywords = content.seo?.keywords || [];
          existingPost.hashtags = platform === 'zalo' ? [] : (content.seo?.hashtags || []);
        } else {
          db.posts.push({
            id: `post-${Date.now()}-${platform}`,
            title: content.seo?.title || property.title,
            platform: platform,
            content: content[platform],
            status: 'draft',
            property_id: property.id,
            property_title: property.title,
            seo_title: content.seo?.title,
            meta_description: content.seo?.meta_description,
            keywords: content.seo?.keywords || [],
            hashtags: platform === 'zalo' ? [] : (content.seo?.hashtags || []),
            created_by_ai: true,
            created_at: new Date().toISOString(),
            company_id: property.company_id,
            owner_user_id: property.owner_user_id,
            assigned_member_ids: property.assigned_member_ids || []
          });
        }
      }
    }

    for (const channel of ['image_prompt', 'video_prompt'] as const) {
      if (content[channel]) {
        await saveGeneratedContent({
          id: `gen-${Date.now()}-${channel}`,
          company_id: property.company_id,
          user_id: user.id,
          property_id: property.id,
          property_title: property.title,
          channel,
          raw_content: content[channel],
          status: 'raw',
          created_at: new Date().toISOString()
        });
      }
    }

    await writeDatabase(db);
    res.json({ status: 'success', data: property });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ----------------------------------------------------
// Posts CMS API (CRUD)
// ----------------------------------------------------
app.get('/api/posts', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(db.posts, req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);
  if (search) {
    items = items.filter(p => matchesSearchText([p.title, p.content, p.platform].join(' '), search));
  }
  if (status) {
    items = items.filter(p => String((p as any).status || '') === status);
  }
  if (sort === 'views_desc') {
    items = items.slice().sort((a, b) => Number(b.engagement?.views || 0) - Number(a.engagement?.views || 0));
  }
  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

app.post('/api/posts', async (req: Request, res: Response) => {
  const db = readDatabase();
  const postData = req.body;
  const linkedProperty = db.properties.find(property => property.id === postData.property_id);
  const propertySeo = linkedProperty ? buildPropertySeo(linkedProperty) : null;
  const platform = postData.platform || 'facebook';
  const hashtags = propertySeo && platform !== 'zalo' ? propertySeo.hashtags : [];
  const content = hashtags.length
    ? appendStandardHashtags(postData.content || '', hashtags)
    : (postData.content || '');

  const newPost: Post = {
    id: `post-${Date.now()}`,
    title: postData.title || propertySeo?.title || 'Bài viết mới',
    platform,
    content,
    status: postData.status || 'draft',
    scheduled_at: postData.scheduled_at || '',
    property_id: postData.property_id || '',
    property_title: postData.property_title || '',
    seo_title: postData.seo_title || propertySeo?.title || postData.title || '',
    meta_description: postData.meta_description || propertySeo?.meta_description || '',
    keywords: Array.isArray(postData.keywords) ? postData.keywords : (propertySeo?.keywords || []),
    hashtags: Array.isArray(postData.hashtags) ? postData.hashtags : hashtags,
    created_by_ai: postData.created_by_ai || false,
    engagement: { views: 0, likes: 0, shares: 0, comments: 0 },
    created_at: new Date().toISOString(),
    ...accessDefaults(req, postData)
  };

  db.posts.push(newPost);
  await writeDatabase(db);
  res.json({ status: 'success', data: newPost });
});

app.put('/api/posts/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.posts.findIndex(p => p.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
    return;
  }

  if (!canManageResource(db.posts[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật bài viết này.' });
    return;
  }

  db.posts[index] = {
    ...db.posts[index],
    ...req.body
  };

  await writeDatabase(db);
  res.json({ status: 'success', data: db.posts[index] });
});

app.delete('/api/posts/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const target = db.posts.find(p => p.id === req.params.id);
  const filtered = db.posts.filter(p => p.id !== req.params.id);

  if (filtered.length === db.posts.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa bài viết này.' });
    return;
  }

  db.posts = filtered;
  await writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa bài viết thành công' });
});


// ----------------------------------------------------
// Inbox đa kênh (Social Inbox)
// ----------------------------------------------------
app.get('/api/inbox', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(db.inbox, req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);
  if (search) {
    items = items.filter(i =>
      matchesSearchText([i.sender_name, i.message, i.platform, i.intent || ''].join(' '), search),
    );
  }
  if (status) {
    items = items.filter(i => String(i.status || '') === status);
  }
  if (sort === 'created_at_asc') {
    items = items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  } else {
    items = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

// POST /api/ai/generate-reply - Draft reply suggestion for a single message
app.post('/api/ai/generate-reply', async (req: Request, res: Response) => {
  const { messageId } = req.body;
  const db = readDatabase();
  const msg = db.inbox.find(i => i.id === messageId);

  if (!msg) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy tin nhắn.' });
    return;
  }

  if (!canAccessResource(msg, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xử lý tin nhắn này.' });
    return;
  }

  // Look up related customer/property for rich prompt context
  const customer = db.customers.find(c => c.id === msg.customer_id);
  const property = db.properties.find(p => p.id === (customer?.property_type === 'Đất nền' ? 'p-1' : 'p-2'));

  try {
    const aiSuggestion = await generateAIConsultantReply(msg.message, customer, property);
    msg.ai_reply_suggestion = aiSuggestion;
    
    // Auto classify intent if not present
    if (!msg.intent || msg.intent === 'chưa rõ') {
      const lower = msg.message.toLowerCase();
      if (lower.includes("giá") || lower.includes("nhiêu") || lower.includes("bao tiền")) {
        msg.intent = "hỏi giá";
      } else if (lower.includes("vị trí") || lower.includes("ở đâu") || lower.includes("địa chỉ")) {
        msg.intent = "hỏi vị trí";
      } else if (lower.includes("bớt") || lower.includes("thương lượng") || lower.includes("giảm")) {
        msg.intent = "thương lượng";
      } else if (lower.includes("xem") || lower.includes("đi gặp") || lower.includes("lịch")) {
        msg.intent = "đặt lịch xem";
      } else if (lower.includes("spam") || lower.includes("quảng cáo")) {
        msg.intent = "không tiềm năng";
      } else {
        msg.intent = "chưa rõ";
      }
    }

    // Trigger action automatic log representation
    if (msg.intent === 'hỏi giá' || msg.intent === 'thương lượng') {
      triggerAutomationEvent('Nhận comment bình luận hỏi giá', `Tin nhắn của ${msg.sender_name}`, db);
    }

    await writeDatabase(db);
    res.json({ status: 'success', data: msg });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update reply status / send manual response simulations
app.post('/api/inbox/:id/reply', async (req: Request, res: Response) => {
  const { replyText } = req.body;
  const db = readDatabase();
  const index = db.inbox.findIndex(i => i.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy tin nhắn.' });
    return;
  }

  if (!canManageResource(db.inbox[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền trả lời tin nhắn này.' });
    return;
  }

  db.inbox[index].status = 'replied';
  
  // Simulate posting the reply back to the platform
  console.log(`[OUTBOX SENT] Sent to ${db.inbox[index].platform} to ${db.inbox[index].sender_name}: "${replyText}"`);

  await writeDatabase(db);
  res.json({ status: 'success', data: db.inbox[index] });
});


// ----------------------------------------------------
// Chatbot AI Center
// ----------------------------------------------------
app.get('/api/ai/status', async (req: Request, res: Response) => {
  try {
    res.json({ status: 'success', data: await getAIProviderStatus() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { message } = req.body;
  const db = readDatabase();
  const user = getAuthUser(req);

  if (!message) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống' });
    return;
  }

  const recentHistory = (db.chat_history || [])
    .filter(item => item.user_id === user.id)
    .slice(0, 6)
    .reverse()
    .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${String(item.message || '').slice(0, 600)}`)
    .join('\n');

  try {
    await saveChatMessage({
      id: `chat-${Date.now()}-user`,
      user_id: user.id,
      company_id: user.company_id,
      role: 'user',
      message,
      created_at: new Date().toISOString()
    });

    const dbContext = buildAssistantDbContext(db, req, String(message));
    const serializedDbContext = JSON.stringify(dbContext, null, 2);
    console.log(`[INTERNAL RETRIEVAL] intent=${dbContext.query.intent} properties=${dbContext.properties.length} customers=${dbContext.customers.length} contextChars=${serializedDbContext.length}`);
    let aiResponse: string;

    try {
      aiResponse = await generateText(
        [
          'Bạn là AI assistant nội bộ cho CMS bất động sản.',
          'Bạn đang trả lời user đã đăng nhập và chỉ được dùng dữ liệu trong DB_CONTEXT.',
          'Không được bịa dữ liệu ngoài DB_CONTEXT. Nếu không có kết quả, nói rõ không tìm thấy trong phạm vi quyền hiện tại.',
          'Khi user hỏi tìm kiếm/lọc/so sánh, hãy nêu dữ liệu cụ thể: tên khách, số điện thoại, tên BĐS, giá, trạng thái, bài đăng.',
          'Trả lời tiếng Việt, ngắn gọn, có bullet nếu có nhiều kết quả.'
        ].join('\n'),
        [
          `DB_CONTEXT:\n${serializedDbContext}`,
          '',
          `CHAT_HISTORY:\n${recentHistory || 'Chưa có lịch sử trò chuyện.'}`,
          '',
          `USER_QUESTION:\n${message}`
        ].join('\n')
      );
    } catch (aiError: any) {
      console.error('CMS assistant AI failed, using DB fallback:', aiError.message || aiError);
      aiResponse = buildAssistantFallback(dbContext);
    }

    await saveChatMessage({
      id: `chat-${Date.now()}-model`,
      user_id: user.id,
      company_id: user.company_id,
      role: 'model',
      message: aiResponse,
      created_at: new Date().toISOString()
    });

    res.json({ status: 'success', data: aiResponse });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/chat/history', (req: Request, res: Response) => {
  const db = readDatabase();
  const user = getAuthUser(req);
  const mineOnly = req.query.scope === 'mine';
  const history = (db.chat_history || []).filter(item => {
    if (mineOnly) return item.user_id === user.id;
    if (user.role === 'owner') return true;
    if (user.role === 'company') return item.company_id === user.company_id;
    return item.user_id === user.id;
  });

  res.json({ status: 'success', data: history });
});

async function deleteChatSessionHandler(req: Request, res: Response) {
  const sessionUserId = decodeURIComponent(String(req.params.sessionUserId || '').trim());
  if (!sessionUserId) {
    res.status(400).json({ status: 'error', message: 'Thiếu mã phiên trò chuyện.' });
    return;
  }

  if (!assertCanManageChatSession(req, res, sessionUserId)) return;

  const deletedCount = await deleteChatHistoryByUserId(sessionUserId);
  let guestDeleted = false;

  if (sessionUserId.startsWith('public-')) {
    const sessionId = sessionUserId.slice('public-'.length);
    guestDeleted = await deletePublicChatGuest(sessionId) > 0;
  }

  res.json({
    status: 'success',
    data: {
      sessionUserId,
      deletedMessages: deletedCount,
      guestDeleted
    }
  });
}

app.delete('/api/chat/sessions/:sessionUserId', deleteChatSessionHandler);
app.post('/api/chat/sessions/:sessionUserId/delete', deleteChatSessionHandler);

function assertCanManageChatSession(req: Request, res: Response, sessionUserId: string): boolean {
  const authUser = getAuthUser(req);

  if (sessionUserId.startsWith('public-')) {
    if (authUser.role === 'member') {
      res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa lịch sử khách chat.' });
      return false;
    }
    return true;
  }

  if (authUser.role === 'owner') return true;

  if (authUser.role === 'company') {
    if (sessionUserId === authUser.id) return true;
    const meta = getChatHistorySessionMeta(sessionUserId);
    if (meta?.company_id && meta.company_id !== authUser.company_id) {
      res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa lịch sử chat này.' });
      return false;
    }
    return true;
  }

  if (sessionUserId !== authUser.id) {
    res.status(403).json({ status: 'error', message: 'Bạn chỉ được xóa lịch sử chat của chính mình.' });
    return false;
  }

  return true;
}

app.get('/api/chat/guests', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xem danh sách khách chat.' });
    return;
  }
  res.json({ status: 'success', data: getPublicChatGuests() });
});

app.get('/api/chat/guests/:sessionId/history', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xem lịch sử khách chat.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const history = getChatHistoryByUser(`public-${sessionId}`, 200).slice().reverse();
  res.json({ status: 'success', data: history });
});

app.put('/api/chat/guests/:sessionId/ai', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền đổi trạng thái AI.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = await updatePublicChatGuestAi(sessionId, Boolean(req.body?.ai_enabled));
  if (!guest) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách chat.' });
    return;
  }
  res.json({ status: 'success', data: guest });
});

app.post('/api/chat/guests/:sessionId/messages', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền gửi tin cho khách.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = getPublicChatGuest(sessionId);
  const message = String(req.body?.message || '').trim();
  if (!guest) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách chat.' });
    return;
  }
  if (!message) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống.' });
    return;
  }
  await updatePublicChatGuestAi(sessionId, false);
  const saved = await saveChatMessage({
    id: `chat-admin-${Date.now()}-${user.id}`,
    user_id: `public-${sessionId}`,
    company_id: user.company_id,
    role: 'model',
    message,
    created_at: new Date().toISOString()
  });
  res.json({ status: 'success', data: saved });
});

app.get('/api/content/generated', (req: Request, res: Response) => {
  const db = readDatabase();
  const user = getAuthUser(req);
  const channel = String(req.query.channel || '');
  const status = String(req.query.status || '');
  const prioritizedChannels = new Set(['facebook', 'zalo']);

  const records = (db.generated_contents || []).filter(item => {
    if (channel && item.channel !== channel) return false;
    if (status && item.status !== status) return false;
    if (user.role === 'owner') return true;
    return item.company_id === user.company_id;
  }).sort((a, b) => {
    const aPriority = prioritizedChannels.has(a.channel) ? 0 : 1;
    const bPriority = prioritizedChannels.has(b.channel) ? 0 : 1;
    return aPriority - bPriority;
  });

  res.json({ status: 'success', data: records });
});

app.post('/api/content/generated/:id/verify', async (req: Request, res: Response) => {
  const { verifiedContent } = req.body;
  const db = readDatabase();
  const user = getAuthUser(req);
  const record = (db.generated_contents || []).find(item => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy content đã sinh.' });
    return;
  }

  if (user.role !== 'owner' && record.company_id !== user.company_id) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền duyệt content này.' });
    return;
  }

  const ok = await verifyGeneratedContent(record.id, verifiedContent || record.raw_content);
  if (!ok) {
    res.status(500).json({ status: 'error', message: 'Không thể cập nhật trạng thái verified.' });
    return;
  }

  res.json({ status: 'success', data: { id: record.id, status: 'verified' } });
});


// ----------------------------------------------------
// Automation Center
// ----------------------------------------------------
app.get('/api/automations', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: scopeCollection(db.automations, req) });
});

app.post('/api/automations/:id/toggle', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.automations.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy kịch bản tự động' });
    return;
  }

  if (!canManageResource(db.automations[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền thay đổi automation này.' });
    return;
  }

  const currentStatus = db.automations[index].status;
  db.automations[index].status = currentStatus === 'active' ? 'inactive' : 'active';
  
  const now = new Date().toISOString();
  db.automations[index].logs.unshift(`${now} - Trạng thái hoạt động chuyển sang: ${db.automations[index].status.toUpperCase()}`);

  await writeDatabase(db);
  res.json({ status: 'success', data: db.automations[index] });
});

// Run Demo simulation report
app.post('/api/automations/run-demo', async (req: Request, res: Response) => {
  const db = readDatabase();
  const now = new Date().toISOString();
  const scopedIds = new Set(scopeCollection(db.automations, req).map(auto => auto.id));

  // Run all active automations
  db.automations = db.automations.map((auto: AutomationTask) => {
    if (auto.status === 'active' && scopedIds.has(auto.id)) {
      const demoLog = `${now} - Chạy thử nghiệm thủ công bởi quản trị viên. Kết quả hoàn hảo.`;
      return {
        ...auto,
        last_run: now,
        run_count: auto.run_count + 1,
        logs: [demoLog, ...auto.logs].slice(0, 20)
      };
    }
    return auto;
  });

  await writeDatabase(db);
  res.json({ status: 'success', data: scopeCollection(db.automations, req) });
});


// ----------------------------------------------------
// Live Channel Connections Status Table (Mock)
// ----------------------------------------------------
app.get('/api/channels', (req: Request, res: Response) => {
  const channels = [
    { name: "Facebook Page RealEstate", platform: "facebook", connected: true, last_sync: "Ít phút trước", messages_count: 5, comments_count: 42 },
    { name: "Zalo Official Account Land", platform: "zalo", connected: true, last_sync: "5 phút trước", messages_count: 8, comments_count: 0 },
    { name: "TikTok Business Account", platform: "tiktok", connected: true, last_sync: "10 phút trước", messages_count: 2, comments_count: 154 },
    { name: "Website Customer LiveChat", platform: "website", connected: true, last_sync: "Chào đón liên tục", messages_count: 4, comments_count: 0 },
    { name: "Instagram Business Profile", platform: "facebook", connected: false, last_sync: "Không có kết nối", messages_count: 0, comments_count: 0 }
  ];

  res.json({ status: 'success', data: channels });
});


// ----------------------------------------------------
// System Settings (Read / Write)
// ----------------------------------------------------
app.get('/api/settings', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: maskSettingsSecrets(db.settings) });
});

app.put('/api/settings', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;

  const db = readDatabase();
  const body = { ...(req.body || {}) } as Record<string, unknown>;
  // Do not overwrite secrets when client sends masked values back
  const maskedLike = (v: unknown) => typeof v === 'string' && (v.includes('…') || v.includes('****'));
  if (maskedLike(body.telegram_bot_token)) delete body.telegram_bot_token;
  if (maskedLike(body.agent_sync_secret)) delete body.agent_sync_secret;

  db.settings = {
    ...db.settings,
    ...body,
  };
  await writeDatabase(db);
  res.json({ status: 'success', data: maskSettingsSecrets(db.settings) });
});

app.post('/api/settings/telegram/test', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const text = req.body?.text != null ? String(req.body.text) : undefined;
  const result = await sendTestTelegram({ text });
  if (!result.ok) {
    res.status(400).json({ status: 'error', message: result.error || 'Telegram test failed' });
    return;
  }
  res.json({ status: 'success', data: result });
});

app.post('/api/settings/agent-sync/test', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const db = readDatabase();
  const settings = { ...db.settings } as AppSettings;
  // Allow optional overrides from request body (unsaved form values)
  const body = (req.body || {}) as Record<string, unknown>;
  if (typeof body.agent_sync_vps_url === 'string' && body.agent_sync_vps_url.trim()) {
    settings.agent_sync_vps_url = body.agent_sync_vps_url.trim();
  }
  if (typeof body.agent_sync_key_id === 'string' && body.agent_sync_key_id.trim()) {
    settings.agent_sync_key_id = body.agent_sync_key_id.trim();
  }
  if (
    typeof body.agent_sync_secret === 'string' &&
    body.agent_sync_secret.trim() &&
    !body.agent_sync_secret.includes('…') &&
    !body.agent_sync_secret.includes('****')
  ) {
    settings.agent_sync_secret = body.agent_sync_secret.trim();
  }
  if (typeof body.agent_sync_timeout_ms === 'number' && Number.isFinite(body.agent_sync_timeout_ms)) {
    settings.agent_sync_timeout_ms = body.agent_sync_timeout_ms;
  }

  const result = await testVpsConnection(settings);
  if (!result.ok) {
    res.status(400).json({ status: 'error', message: result.error || 'VPS sync test failed', data: result.data });
    return;
  }
  res.json({
    status: 'success',
    message: result.message || 'Kết nối VPS OK.',
    data: result.data,
  });
});

app.get('/api/settings/agent-sync/status', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  try {
    const stats = await getSyncOutboxStats();
    res.json({
      status: 'success',
      data: {
        envEnabled: process.env.AGENT_LOCAL_SYNC_ENABLED?.trim().toLowerCase() === 'true',
        settingsEnabled: Boolean(readDatabase().settings.agent_sync_enabled),
        ...stats,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Không lấy được sync status.',
    });
  }
});

app.post('/api/settings/agent-sync/flush', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  try {
    const result = await processOutboxBatch({
      limit: Number((req.body as { limit?: number })?.limit || 20),
    });
    const stats = await getSyncOutboxStats();
    res.json({ status: 'success', data: { flush: result, stats } });
  } catch (error: unknown) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Flush outbox thất bại.',
    });
  }
});


// ----------------------------------------------------
// Web Front-end Asset serving
// ----------------------------------------------------
const DEFAULT_SEO_KEYWORDS = [
  'bất động sản sun group đà nẵng',
  'căn hộ cao cấp đà nẵng',
  'bất động sản nam đà nẵng',
  'shophouse kinh doanh đà nẵng',
  'giá đất đà nẵng 2026'
];

function syncSiteSeoKeywords(db: { properties?: Property[]; settings?: AppSettings }) {
  const seoKeywords = buildSiteSeoKeywords(db.properties || [], DEFAULT_SEO_KEYWORDS);
  db.settings = {
    ...(db.settings || {}),
    seo_keywords: seoKeywords
  } as AppSettings;
  return seoKeywords;
}

function applyPropertyHashtagSeo(property: Property): Property {
  const contentText = getPropertyContentForHashtags(property);
  const { hashtags, keywords: parsedKeywords } = mergePostHashtags(contentText);
  const baseSeo = buildPropertySeo(property);
  const existingSeo = property.ai_posts?.seo;

  const seo = {
    title: existingSeo?.title || baseSeo.title,
    meta_description: existingSeo?.meta_description || baseSeo.meta_description,
    keywords: parsedKeywords.length
      ? mergeKeywordLists(parsedKeywords, existingSeo?.keywords || baseSeo.keywords)
      : (existingSeo?.keywords || baseSeo.keywords),
    hashtags: hashtags.length
      ? hashtags
      : (existingSeo?.hashtags || baseSeo.hashtags)
  };

  return {
    ...property,
    ai_posts: {
      facebook: property.ai_posts?.facebook || '',
      zalo: property.ai_posts?.zalo || '',
      tiktok: property.ai_posts?.tiktok || '',
      website: property.ai_posts?.website || '',
      image_prompt: property.ai_posts?.image_prompt || '',
      video_prompt: property.ai_posts?.video_prompt || '',
      strategy: property.ai_posts?.strategy,
      image_prompts: property.ai_posts?.image_prompts,
      seo
    }
  };
}
const DEFAULT_SEO_TITLE = 'BĐS Sun Group Đà Nẵng | Căn Đẹp Giá Gốc 2026';
const DEFAULT_SEO_DESCRIPTION = 'BĐS Sun Group Đà Nẵng, căn hộ cao cấp, shophouse và đất Nam Đà Nẵng có pháp lý rõ, hình ảnh thật, giá bán cập nhật 2026.';

function getPublicOrigin(req: Request) {
  const configuredOrigin = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configuredOrigin)) return configuredOrigin;
  return `${req.protocol}://${req.get('host')}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value: unknown) {
  return escapeXml(String(value || ''));
}

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMeta(value: string, maxLength = 180) {
  const cleanValue = stripHtml(value);
  return cleanValue.length > maxLength
    ? `${cleanValue.slice(0, maxLength - 3).trim()}...`
    : cleanValue;
}

function limitSeoTitle(value: string) {
  return value.length <= 60 ? value : `${value.slice(0, 57).trim()}...`;
}

function getServerPropertySeoTitle(property: Property) {
  const type = String(property.type || '').toLowerCase();
  if (type.includes('căn') || type.includes('can')) return limitSeoTitle(`${property.title} | Căn Hộ Đà Nẵng Giá 2026`);
  if (type.includes('shophouse')) return limitSeoTitle(`${property.title} | Shophouse Đà Nẵng Kinh Doanh`);
  return limitSeoTitle(`${property.title} | BĐS Sun Group Đà Nẵng`);
}

function absoluteUrl(value: string, origin: string) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `${origin.split(':')[0]}:${value}`;
  if (value.startsWith('/')) return `${origin}${value}`;
  return value;
}

function getPropertyImageValue(property: Property, index = 0) {
  return property.gallery_images?.[index] || property.images || '';
}

function getPropertyPublicImageUrl(property: Property, origin: string, index = 0) {
  const image = getPropertyImageValue(property, index);
  if (!image) return '';
  if (image.startsWith('data:image/')) return `${origin}/property-images/${encodeURIComponent(property.id)}/${index}.jpg`;
  return absoluteUrl(image, origin);
}

function getPropertyShareMeta(property: Property, origin: string) {
  const url = `${origin}${getPropertyPath(property)}`;
  const image = getPropertyPublicImageUrl(property, origin);
  const sellingPoints = (property.selling_points || []).filter(Boolean).slice(0, 4).join(' • ');
  const baseDescription = [
    `${property.title} tại ${property.location}`,
    `${property.area} m2`,
    `${property.price} tỷ`,
    property.legal_status,
    sellingPoints,
    property.rich_description || property.description
  ].filter(Boolean).join('. ');
  const title = limitSeoTitle(property.ai_posts?.seo?.title || getServerPropertySeoTitle(property));
  const description = property.ai_posts?.seo?.meta_description || truncateMeta(baseDescription);
  const keywordList = getPropertySeoKeywordsFromContent(property, DEFAULT_SEO_KEYWORDS);
  const keywords = keywordList.join(', ');

  return { title, description, image, url, keywords };
}

function renderIndexWithMeta(
  indexHtml: string,
  meta: {
    title: string;
    description: string;
    image: string;
    url: string;
    keywords: string;
    ogType?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageType?: string;
    publishedTime?: string;
  },
  schemas: Record<string, unknown>[] = []
) {
  const ogType = meta.ogType || (meta.url.includes('/') && meta.url.split('/').filter(Boolean).length > 1 ? 'article' : 'website');
  const imageType = meta.imageType || (meta.image ? guessImageMimeType(meta.image) : '');
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    '<meta name="googlebot" content="index, follow, max-image-preview:large" />',
    '<meta property="og:locale" content="vi_VN" />',
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    '<meta property="og:site_name" content="Estoria" />',
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : '',
    meta.image ? `<meta property="og:image:secure_url" content="${escapeHtml(meta.image)}" />` : '',
    meta.image && imageType ? `<meta property="og:image:type" content="${escapeHtml(imageType)}" />` : '',
    meta.image && meta.imageWidth ? `<meta property="og:image:width" content="${meta.imageWidth}" />` : '',
    meta.image && meta.imageHeight ? `<meta property="og:image:height" content="${meta.imageHeight}" />` : '',
    meta.image ? `<meta property="og:image:alt" content="${escapeHtml(meta.title)}" />` : '',
    meta.publishedTime ? `<meta property="article:published_time" content="${escapeHtml(meta.publishedTime)}" />` : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : '',
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    ...schemas.map(schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`),
  ].filter(Boolean).join('\n    ');

  return indexHtml
    .replace(/<title>.*?<\/title>/i, '')
    .replace(/<meta name="description"[^>]*>/gi, '')
    .replace(/<meta name="keywords"[^>]*>/gi, '')
    .replace(/<meta name="robots"[^>]*>/gi, '')
    .replace(/<meta name="googlebot"[^>]*>/gi, '')
    .replace(/<meta property="og:[^"]+"[^>]*>/gi, '')
    .replace(/<meta name="twitter:[^"]+"[^>]*>/gi, '')
    .replace(/<link rel="canonical"[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}

function findPublicPropertyBySlug(propertySlug: string) {
  const decodedSlug = decodeURIComponent(propertySlug || '').toLowerCase();
  return getProperties().find((property: Property) => {
    if (['sold', 'hidden'].includes(property.sale_status || 'available')) return false;
    return property.id === decodedSlug || getPropertySlug(property).toLowerCase() === decodedSlug;
  }) as Property | undefined;
}

app.get('/property-images/:propertyId/:imageIndex.jpg', (req: Request, res: Response) => {
  const property = getProperties().find((item: Property) => item.id === req.params.propertyId) as Property | undefined;
  if (!property || ['sold', 'hidden'].includes(property.sale_status || 'available')) {
    res.status(404).send('Image not found');
    return;
  }

  const imageIndex = Number.parseInt(req.params.imageIndex, 10) || 0;
  const image = getPropertyImageValue(property, imageIndex);
  const dataUrlMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!dataUrlMatch) {
    res.redirect(getPropertyPublicImageUrl(property, getPublicOrigin(req), imageIndex));
    return;
  }

  const imageBuffer = Buffer.from(dataUrlMatch[2], 'base64');
  res
    .status(200)
    .set({
      'Content-Type': dataUrlMatch[1],
      'Content-Length': String(imageBuffer.length),
      'Cache-Control': 'public, max-age=31536000, immutable'
    })
    .send(imageBuffer);
});

function getIndexHtmlTemplate() {
  const distIndex = path.join(process.cwd(), 'dist', 'index.html');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distIndex)) {
    return fs.readFileSync(distIndex, 'utf-8');
  }
  return fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
}

function getDefaultShareMeta(origin: string) {
  const keywordList = buildSiteSeoKeywords(getProperties(), DEFAULT_SEO_KEYWORDS);
  const defaultImage = `${origin}/logo.jpg`;
  return {
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION,
    image: defaultImage,
    url: `${origin}${publicListingsPath}`,
    keywords: keywordList.join(', '),
    ogType: 'website',
  };
}

function getStaticPageShareMeta(origin: string, pathname: string) {
  const pageMeta = getPageMetaByPath(pathname);
  if (!pageMeta) return null;
  const keywordList = pageMeta.keywords?.length ? pageMeta.keywords : buildSiteSeoKeywords(getProperties(), DEFAULT_SEO_KEYWORDS);
  const defaultImage = `${origin}/logo.jpg`;
  return {
    title: pageMeta.title,
    description: pageMeta.description,
    image: defaultImage,
    url: `${origin}${pageMeta.path}`,
    keywords: keywordList.join(', '),
    ogType: pageMeta.ogType || 'website',
  };
}

async function sendPublicIndex(req: Request, res: Response): Promise<boolean> {
  const origin = getPublicOrigin(req);
  const indexHtml = getIndexHtmlTemplate();
  const pathSlug = decodeURIComponent(String(req.path || '').replace(/^\//, ''));

  if (!pathSlug) {
    const meta = getDefaultShareMeta(origin);
    const schemas = buildDefaultPageSchemas([{ name: 'Trang chủ', path: '/' }], origin);
    await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, meta, schemas));
    return true;
  }

  const staticMeta = getStaticPageShareMeta(origin, `/${pathSlug}`);
  if (staticMeta) {
    const breadcrumbs = [
      { name: 'Trang chủ', path: '/' },
      { name: staticMeta.title.split('|')[0].trim(), path: `/${pathSlug}` },
    ];
    const schemas = [
      ...buildDefaultPageSchemas(breadcrumbs, origin),
      buildBreadcrumbSchema(breadcrumbs, origin),
    ];
    await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, staticMeta, schemas));
    return true;
  }

  if (pathSlug.startsWith('tin-tuc/')) {
    const blogSlug = pathSlug.slice('tin-tuc/'.length);
    if (blogSlug && !blogSlug.includes('/')) {
      try {
        const post = await getBlogPostBySlug(blogSlug, true);
        if (post) {
          const postPath = `/tin-tuc/${post.slug}`;
          const keywords = (post.tags || []).map((tag: { name: string }) => tag.name).join(', ');
          const description = post.metaDescription || post.excerpt;
          const image = resolveBlogShareImage({
            coverImage: post.coverImage,
            content: post.content,
            contentHtml: post.contentHtml,
            origin,
          });
          const dims = ogImageDimensions(image, origin);
          const meta = {
            title: post.metaTitle || post.title,
            description,
            image,
            url: `${origin}${postPath}`,
            keywords,
            ogType: 'article',
            imageWidth: dims.width,
            imageHeight: dims.height,
            imageType: guessImageMimeType(image),
            publishedTime: post.publishedAt || undefined,
          };
          const breadcrumbs = [
            { name: 'Trang chủ', path: '/' },
            { name: 'Tin tức', path: '/tin-tuc' },
            ...(post.category
              ? [{ name: post.category.name, path: post.category.hubPath }]
              : []),
            { name: post.title, path: postPath },
          ];
          const schemas = [
            ...buildDefaultPageSchemas(breadcrumbs, origin),
            buildBreadcrumbSchema(breadcrumbs, origin),
            buildArticleSchema({
              title: post.title,
              description,
              path: postPath,
              publishedAt: post.publishedAt || undefined,
              updatedAt: post.updatedAt,
              image: meta.image,
              origin,
            }),
            ...(post.faqs?.length ? [buildFaqSchema(post.faqs)] : []),
          ];
          await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, meta, schemas));
          return true;
        }
      } catch (error) {
        console.error('[SSR] blog post meta error:', error);
      }
    }
  }

  if (isReservedSlug(pathSlug)) {
    await sendIndexHtml(req, res, indexHtml);
    return true;
  }

  const property = findPublicPropertyBySlug(pathSlug);
  if (property) {
    const shareMeta = getPropertyShareMeta(property, origin);
    const image = shareMeta.image;
    const dataUrlMatch = (property.gallery_images?.[0] || property.images || '').match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    const dims = dataUrlMatch
      ? readImageDimensionsFromBuffer(Buffer.from(dataUrlMatch[1], 'base64')) || ogImageDimensions(image, origin)
      : ogImageDimensions(image, origin);
    const breadcrumbs = [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: property.title, path: shareMeta.url.replace(origin, '') },
    ];
    const schemas = [
      ...buildDefaultPageSchemas(breadcrumbs, origin),
      buildBreadcrumbSchema(breadcrumbs, origin),
      ...buildPropertySchemas(property, origin),
    ];
    await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, {
      ...shareMeta,
      ogType: 'product',
      imageWidth: dims.width,
      imageHeight: dims.height,
      imageType: guessImageMimeType(image),
    }, schemas));
    return true;
  }

  return false;
}

function shouldAttemptPublicIndex(req: Request) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const requestPath = String(req.path || '');
  if (requestPath.startsWith('/api')) return false;
  if (/\.[a-z0-9]+$/i.test(requestPath)) return false;
  return true;
}

async function handlePublicIndex(req: Request, res: Response, next: NextFunction) {
  if (!shouldAttemptPublicIndex(req)) {
    next();
    return;
  }
  const handled = await sendPublicIndex(req, res);
  if (handled) return;
  next();
}

app.get('/bds-da-nang', (req: Request, res: Response) => {
  res.redirect(301, publicListingsPath);
});

app.get('/bds-da-nang/:propertySlug', (req: Request, res: Response) => {
  res.redirect(301, `/${encodeURIComponent(req.params.propertySlug)}`);
});

app.get('/listings', (req: Request, res: Response) => {
  const propertyId = String(req.query.property || '').trim();
  if (propertyId) {
    const property = getProperties().find((item: Property) => item.id === propertyId);
    if (property) {
      res.redirect(301, getPropertyPath(property));
      return;
    }
  }
  res.redirect(301, publicListingsPath);
});

app.get('/robots.txt', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  res
    .type('text/plain')
    .send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /admin/',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      `Sitemap: ${origin}/sitemap-pages.xml`,
      `Sitemap: ${origin}/sitemap-properties.xml`,
      `Sitemap: ${origin}/sitemap-projects.xml`,
      `Sitemap: ${origin}/sitemap-posts.xml`,
    ].join('\n'));
});

app.get('/sitemap.xml', (req: Request, res: Response) => {
  res.type('application/xml').send(sitemapIndexXml(getPublicOrigin(req)));
});

app.get('/sitemap-pages.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'));
  const { pages, landings } = buildSitemapEntries(origin, publicProperties);
  res.type('application/xml').send(entriesToXml([...pages, ...landings]));
});

app.get('/sitemap-properties.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'));
  const { properties } = buildSitemapEntries(origin, publicProperties);
  res.type('application/xml').send(entriesToXml(properties));
});

app.get('/sitemap-projects.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'));
  const { projects } = buildSitemapEntries(origin, publicProperties);
  res.type('application/xml').send(entriesToXml(projects));
});

app.get('/sitemap-posts.xml', async (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const now = new Date().toISOString().slice(0, 10);
  const base = origin.replace(/\/+$/, '');
  let blogPosts: Awaited<ReturnType<typeof getPublishedBlogPostsForSitemap>> = [];
  try {
    blogPosts = await getPublishedBlogPostsForSitemap();
  } catch (error) {
    console.error('[sitemap-posts] blog query failed:', error);
  }
  const entries = [
    { loc: `${base}/tin-tuc`, changefreq: 'daily' as const, priority: 0.85, lastmod: now },
    ...blogPosts.map(post => ({
      loc: `${base}/tin-tuc/${encodeURIComponent(post.slug)}`,
      changefreq: 'weekly' as const,
      priority: 0.75,
      lastmod: (post.updatedAt || post.publishedAt || new Date()).toISOString().slice(0, 10),
    })),
  ];
  res.type('application/xml').send(entriesToXml(entries));
});

const distPath = path.join(process.cwd(), 'dist');
let viteDevServer: import('vite').ViteDevServer | null = null;

async function finalizeIndexHtml(req: Request, html: string): Promise<string> {
  if (process.env.NODE_ENV === 'production' || !viteDevServer) return html;
  return viteDevServer.transformIndexHtml(req.originalUrl, html);
}

async function sendIndexHtml(req: Request, res: Response, html: string) {
  const finalHtml = await finalizeIndexHtml(req, html);
  res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(finalHtml);
}

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath, createDistStaticOptions()));
  app.use(handlePublicIndex);
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ status: 'error', message: 'Not found' });
      return;
    }
    const indexHtml = getIndexHtmlTemplate();
    res.status(200).set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    }).send(indexHtml);
  });
}

async function setupViteDevServer() {
  const { createServer } = await import('vite');
  const viteServer = await createServer({
    configFile: path.join(process.cwd(), 'vite.config.ts'),
    server: {
      middlewareMode: true,
      hmr: {
        port: 0,
      },
      watch: {
        ignored: ['**/db.json', '**/db.json.*.bak', '**/dev-server*.log', '**/prod-server*.log'],
      },
    },
    appType: 'spa',
  });
  viteDevServer = viteServer;
  app.use(handlePublicIndex);
  app.use(viteServer.middlewares);
  app.get('*', async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    await sendIndexHtml(req, res, getIndexHtmlTemplate());
  });

  // Unmatched API methods (POST/PATCH/…) that fall through Vite → proper JSON, not empty 404
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: `API không tồn tại: ${req.method} ${req.originalUrl}. Thử restart server (npm run dev).`,
    });
  });
}

function freeDevPortsSync() {
  try {
    execSync('node scripts/free-dev-ports.mjs', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    /* best effort */
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function listenHttpServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log('====================================================');
      console.log(`Real Estate AI CMS is listening on port ${PORT} (PostgreSQL)`);
      console.log(`Live Preview at: http://localhost:${PORT}`);
      console.log('====================================================');
      resolve(server);
    });
    server.on('error', (error: NodeJS.ErrnoException) => reject(error));
  });
}

async function startHttpServerWithRetry() {
  try {
    await listenHttpServer();
    return;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (process.env.NODE_ENV === 'production' || err.code !== 'EADDRINUSE') {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} đang được dùng. Chạy: npm run dev:restart`);
      } else {
        console.error('[Server] Không khởi động được HTTP:', err);
      }
      process.exit(1);
    }
    console.warn(`[Server] Port ${PORT} bận — giải phóng và thử lại...`);
    freeDevPortsSync();
    await sleep(1000);
    try {
      await listenHttpServer();
    } catch (retryError) {
      const retryErr = retryError as NodeJS.ErrnoException;
      console.error(
        `[Server] Vẫn không bind được port ${PORT}. Chạy: npm run dev:restart`,
        retryErr.message || retryErr,
      );
      process.exit(1);
    }
  }
}

async function bootstrap(): Promise<boolean> {
  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.error('[DB] Không kết nối được PostgreSQL:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    console.warn('[DB] Dev mode: tiếp tục chạy UI — bật Postgres: npm run db:pg-start');
    return false;
  }

  try {
    const keywords = syncSiteSeoKeywords(readDatabase());
    await updateSettings({ seo_keywords: keywords });
  } catch (error) {
    console.warn('[DB] Bỏ qua sync seo_keywords lúc khởi động:', error);
  }

  console.log('[DB] PostgreSQL sẵn sàng');
  return true;
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    freeDevPortsSync();
    await sleep(400);
  }

  const dbReady = await bootstrap();

  if (dbReady) {
    if (AGENT_ENABLED) {
      startAgentScheduler();
      startAgentSyncOutboxWorker();
      void startTelegramControlPlane().then(r => {
        if (r.started) {
          console.log('[telegram-console] Control Plane client ready', r.status);
        } else {
          console.log(`[telegram-console] not started (${r.reason || 'disabled'})`);
        }
      });
      void import('./server/modules/control-plane/operations').then(ops => {
        ops.startMetricsCollector();
        console.log('[metrics-collector] Operations Center metrics started (5m + event/manual)');
      }).catch(err => {
        console.warn('[metrics-collector] failed to start', err instanceof Error ? err.message : err);
      });
    } else {
      console.warn('[agent] Scheduler/outbox worker skipped (AGENT_ENABLED=false)');
    }
  } else {
    console.warn('[agent-scheduler] Bỏ qua — DB chưa sẵn sàng');
  }

  const shutdown = (signal: string) => {
    console.log(`[Server] ${signal} — stopping scheduler…`);
    stopAgentScheduler();
    stopAgentSyncOutboxWorker();
    void stopTelegramControlPlane();
    void import('./server/modules/control-plane/operations')
      .then(ops => ops.stopMetricsCollector())
      .catch(() => undefined);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  if (process.env.NODE_ENV === 'production') {
    await startHttpServerWithRetry();
    return;
  }

  try {
    await setupViteDevServer();
    await startHttpServerWithRetry();
  } catch (error) {
    console.error('Vite server fails construction:', error);
    process.exit(1);
  }
}

void main();
