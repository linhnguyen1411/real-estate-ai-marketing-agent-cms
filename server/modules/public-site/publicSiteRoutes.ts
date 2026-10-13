import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import {
  createCustomer,
  getChatHistoryByUser,
  getCustomers,
  getProperties,
  getPublicChatGuest,
  getSettings,
  readDatabase,
  saveChatMessage,
  searchCmsRecords,
  updateProperty,
  updateSettings,
  upsertPublicChatGuest,
} from '../../dbHelper';
import { generateText } from '../../aiService';
import type { AppSettings, Customer, Property, User } from '../../../src/types';
import { slugifyAgentProfile } from '../../../src/utils/agentTier';
import { collectSiteSeoKeywords as buildSiteSeoKeywords } from '../../../src/utils/hashtags';
import { getPublishedBlogPostsForSitemap } from '../../blogDb';
import { getCached, setCached } from '../../cache/publicCache';
import { filterPublicProperties } from '../../publicPropertyMapper';
import { LEAD_MAGNETS } from '../../../src/leadGen/leadMagnets';
import { processLeadCapture } from '../../investorLeadService';
import {
  countPublicAgentProperties,
  toPublicAgentProfile,
} from '../auth/authAccess';
import { getPropertiesForPortfolioSlug } from '../properties/portfolioPropertyQuery';
import { DEFAULT_SEO_KEYWORDS } from './seoKeywords';
import { getPropertyPath } from './propertyPaths';
import {
  compactProperty,
  extractQueryTokens,
  formatPublicPropertySuggestions,
  generatePublicSmallTalkReply,
  hasPublicRealEstateIntent,
  isGreetingOnlyMessage,
  isWeatherQuestion,
  rankProperties,
} from './publicChatHelpers';

import {
  publicApiRateLimiter,
  publicChatSendRateLimiter,
  publicChatHistoryRateLimiter,
} from '../../middleware/rateLimiters';
import { validateSchema, publicContactSchema } from '../../middleware/validation';

// ----------------------------------------------------
// Public traffic tracking with in-memory aggregation & periodic flush
// ----------------------------------------------------
let pendingSiteViews = 0;
let lastSiteViewTimestamp: string | null = null;
const pendingPropertyViews = new Map<string, { count: number; lastViewAt: string }>();

export async function flushTrackViews(): Promise<void> {
  const siteToAdd = pendingSiteViews;
  const siteTimestamp = lastSiteViewTimestamp;
  pendingSiteViews = 0;
  lastSiteViewTimestamp = null;

  const propSnapshot = new Map(pendingPropertyViews);
  pendingPropertyViews.clear();

  if (siteToAdd > 0) {
    try {
      const currentSettings = getSettings();
      await updateSettings({
        site_view_count: Number(currentSettings.site_view_count || 0) + siteToAdd,
        last_site_view_at: siteTimestamp || new Date().toISOString(),
      } as AppSettings);
    } catch (err: any) {
      console.warn('[track-view] Flush site views error:', err?.message || err);
    }
  }

  for (const [propId, { count, lastViewAt }] of propSnapshot.entries()) {
    try {
      const current = getProperties().find((item: Property) => item.id === propId);
      if (current) {
        await updateProperty(propId, {
          public_view_count: Number(current.public_view_count || 0) + count,
          last_public_view_at: lastViewAt,
        });
      }
    } catch (err: any) {
      console.warn(`[track-view] Flush property views (${propId}) error:`, err?.message || err);
    }
  }
}

// Flush interval every 10 seconds (or on process shutdown)
setInterval(() => {
  if (pendingSiteViews > 0 || pendingPropertyViews.size > 0) {
    flushTrackViews().catch(() => undefined);
  }
}, 10_000).unref();

export function createPublicSiteRouter() {
  const router = Router();

  // Rate limiter for general public endpoints
  router.use('/api/public', publicApiRateLimiter);

router.get('/api/public/properties', (req: Request, res: Response) => {
  const portfolioSlug = String(
    req.query.portfolio || req.query.projectSlug || req.query.project || '',
  ).trim();

  const cacheKey = portfolioSlug
    ? `public-properties:${portfolioSlug.toLowerCase()}`
    : 'public-properties';
  const cached = getCached<{
    status: string;
    data: Property[];
    meta: { projectDisplayOrder?: string[]; portfolioSlug?: string };
  }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const settings = getSettings();
  const data = portfolioSlug
    ? getPropertiesForPortfolioSlug(portfolioSlug)
    : filterPublicProperties(getProperties());

  const payload = {
    status: 'success',
    data,
    meta: {
      projectDisplayOrder: settings.project_display_order?.length
        ? settings.project_display_order
        : undefined,
      ...(portfolioSlug ? { portfolioSlug } : {}),
    },
  };
  setCached(cacheKey, payload, 120_000);
  res.json(payload);
});

router.get('/api/public/homepage', async (req: Request, res: Response) => {
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

let cachedSeoKeywords: { keywords: any; expiresAt: number } | null = null;

router.get('/api/public/seo', async (req: Request, res: Response) => {
  const now = Date.now();
  if (cachedSeoKeywords && cachedSeoKeywords.expiresAt > now) {
    res.json({ status: 'success', data: { keywords: cachedSeoKeywords.keywords } });
    return;
  }
  const keywords = buildSiteSeoKeywords(
    getProperties().filter((property: Property) => !['sold', 'hidden'].includes(property.sale_status || 'available')),
    DEFAULT_SEO_KEYWORDS
  );
  cachedSeoKeywords = { keywords, expiresAt: now + 5 * 60 * 1000 };
  res.json({ status: 'success', data: { keywords } });
});

router.get('/api/public/agents', (req: Request, res: Response) => {
  const db = readDatabase();
  const agents = (db.users || [])
    .map((user: User) => toPublicAgentProfile(user, db, countPublicAgentProperties(db, user.id)))
    .filter(Boolean)
    .sort((a: any, b: any) => b.property_count - a.property_count || a.name.localeCompare(b.name, 'vi'));
  res.json({ status: 'success', data: agents });
});

router.get('/api/public/agents/by-user/:userId', (req: Request, res: Response) => {
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

router.get('/api/public/agents/:slug', (req: Request, res: Response) => {
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

  const properties = filterPublicProperties(
    getProperties().filter((property: any) => {
      const creatorId = property.created_by_user_id || property.owner_user_id;
      return creatorId === user.id;
    }),
  );

  res.json({ status: 'success', data: { ...profile, properties } });
});


router.post('/api/public/track-view', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const propertyId = String(req.body?.propertyId || '').trim();
  const trackingType = String(req.body?.type || '').trim();

  const settings = getSettings();
  let baseSiteViews = Number(settings.site_view_count || 0) + pendingSiteViews;

  if (trackingType === 'site' || !propertyId) {
    pendingSiteViews += 1;
    lastSiteViewTimestamp = now;
    baseSiteViews += 1;
  }

  let propertyResponse: { id: string; public_view_count: number; last_public_view_at: string } | null = null;

  if (propertyId) {
    const current = getProperties().find((item: Property) => item.id === propertyId);
    if (current) {
      const prev = pendingPropertyViews.get(propertyId) || { count: 0, lastViewAt: now };
      const nextCount = prev.count + 1;
      pendingPropertyViews.set(propertyId, { count: nextCount, lastViewAt: now });

      propertyResponse = {
        id: propertyId,
        public_view_count: Number(current.public_view_count || 0) + nextCount,
        last_public_view_at: now,
      };
    }
  }

  res.json({
    status: 'success',
    data: {
      tracked: true,
      siteViews: baseSiteViews,
      lastSiteViewAt: lastSiteViewTimestamp || settings.last_site_view_at,
      property: propertyResponse,
    },
  });
});

function maskPhone(phone: string): string {
  const clean = String(phone || '').trim();
  if (clean.length < 6) return '***';
  return clean.slice(0, 3) + '****' + clean.slice(-3);
}

function parseCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.match(new RegExp(`(^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

router.get('/api/public/chat/history', publicChatHistoryRateLimiter, (req: Request, res: Response) => {
  const cookieSessionId = parseCookie(req, 'chat_session_id');
  const querySessionId = String(req.query.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const sessionId = cookieSessionId || querySessionId;

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
          phone: maskPhone(guest.phone)
        }
      : null
  });
});

router.post('/api/public/chat/guest', async (req: Request, res: Response) => {
  const cookieSessionId = parseCookie(req, 'chat_session_id');
  const providedSessionId = String(req.body?.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const sessionId = providedSessionId || cookieSessionId || crypto.randomBytes(16).toString('base64url');
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const phone = String(req.body?.phone || '').trim().replace(/[^\d+.\-\s]/g, '').slice(0, 40);

  if (!name || !phone) {
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
      company_id: process.env.DEFAULT_COMPANY_ID || 'comp-da-nang',
      owner_user_id: process.env.DEFAULT_OWNER_USER_ID || 'user-owner-1',
      assigned_member_ids: []
    } as Customer);
  }

  const guest = await upsertPublicChatGuest({ session_id: sessionId, name, phone, customer_id: customerId });
  res.cookie('chat_session_id', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ status: 'success', data: { ...guest, session_id: sessionId } });
});

router.post('/api/public/contact', validateSchema(publicContactSchema), async (req: Request, res: Response) => {
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

router.post('/api/public/chat', publicChatSendRateLimiter, async (req: Request, res: Response) => {
  const cookieSessionId = parseCookie(req, 'chat_session_id');
  const bodySessionId = String(req.body?.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const sessionId = bodySessionId || cookieSessionId;
  const { message } = req.body;

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
  // Always load all active public properties from database cache
  const allProperties = getProperties().filter(
    (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available')
  ) as Property[];

  // 1. Text token match
  const searchTokens = extractQueryTokens(`${message}\n${recentHistory}`);
  const rawSearchProperties = searchTokens.length > 0
    ? (searchCmsRecords('properties', searchTokens, 30, { availableOnly: true }) as Property[])
    : allProperties;

  // Merge full list and searched list to ensure no missing inventory
  const candidatePool = Array.from(
    new Map([...rawSearchProperties, ...allProperties].map(p => [p.id, p])).values()
  );

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
  const recentlyMentionedProperty = candidatePool
    .map((property: Property) => ({
      property,
      mentionIndex: normalizedHistory.lastIndexOf(property.title.toLowerCase())
    }))
    .filter(item => item.mentionIndex >= 0)
    .sort((a, b) => b.mentionIndex - a.mentionIndex)[0]?.property;

  const rankedPublicProperties = rankProperties(candidatePool, `${message}\n${recentHistory}`, 6);
  const retrievedPublicProperties = [
    ...(recentlyMentionedProperty ? [recentlyMentionedProperty] : []),
    ...rankedPublicProperties
  ].filter((property, index, items) => items.findIndex(item => item.id === property.id) === index).slice(0, 6);

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

    if (isGreetingOnlyMessage(String(message))) {
      const topProps = retrievedPublicProperties.slice(0, 2);
      const sampleText = topProps.length > 0
        ? ` Hiện giỏ hàng House & Life bên em đang có sẵn các sản phẩm đất nền Nam Hòa Xuân, nhà phố trung tâm, căn hộ cao cấp (từ ${Math.min(...candidatePool.map(p => Number(p.price) || 99)).toFixed(1)} tỷ đến ${Math.max(...candidatePool.map(p => Number(p.price) || 0)).toFixed(0)} tỷ).`
        : '';
      const greetingResponse = [
        `Dạ em chào anh/chị ạ! Em là Lily, chuyên viên tư vấn BĐS House & Life Đà Nẵng.${sampleText}`,
        'Anh/chị đang tìm sản phẩm để ở, kinh doanh hay đầu tư tích sản, và ngân sách dự kiến khoảng bao nhiêu để em lọc ngay căn đẹp nhất gửi mình nhé ạ?'
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
        'Dạ thời tiết Đà Nẵng hiện tại rất đẹp và thuận lợi để đi xem thực tế các dự án ạ!',
        'Nếu anh/chị đang có kế hoạch khảo sát nhà đất hay căn hộ tại Đà Nẵng, em sẵn sàng sắp xếp xe và lịch xem thực địa giúp mình ngay nhé.'
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

    if (isNegotiationQuestion) {
      const publicContacts = process.env.PUBLIC_CONTACTS || '0905 777 594';
      const negotiationResponse = recentlyMentionedProperty
        ? `Dạ về mức giá của căn **${recentlyMentionedProperty.title}**, giá niêm yết hiện là ${recentlyMentionedProperty.price} tỷ. Bên em làm việc trực tiếp với chính chủ nên sẽ luôn cố gắng thương lượng mức giá và phương thức thanh toán tốt nhất cho anh/chị. Anh/chị cho em xin số điện thoại hoặc Zalo để em kết nối thương lượng trực tiếp với chủ rồi báo lại ngay nhé ạ!\n\n📞 Hotline hỗ trợ 24/7: ${publicContacts}`
        : `Dạ về việc thương lượng giá, House & Life luôn làm việc trực tiếp với chủ nhà để có giá ưu đãi nhất cho khách. Anh/chị đang quan tâm căn nào và thiện chí ở mức giá bao nhiêu, nhắn em số điện thoại để em liên hệ chủ báo lại ngay nhé ạ!\n\n📞 Hotline hỗ trợ 24/7: ${publicContacts}`;

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

    // Only do quick direct answer if the user is asking about a SINGLE specific property already mentioned
    if (recentlyMentionedProperty && (asksPrice || asksLegal || asksArea || asksLocation) && !normalizedMessage.includes('khac') && !normalizedMessage.includes('them')) {
      const details = [
        asksPrice ? `Mức giá: **${directProperty!.price} tỷ**` : '',
        asksLegal ? `Pháp lý: **${directProperty!.legal_status}**` : '',
        asksArea ? `Diện tích: **${directProperty!.area}m²**` : '',
        asksLocation ? `Vị trí: **${directProperty!.location}**` : ''
      ].filter(Boolean).join('\n- ');
      const directResponse = [
        `Dạ em gửi anh/chị thông tin chi tiết về **${directProperty!.title}**:`,
        `- ${details}`,
        `- 🔗 [**Xem chi tiết sản phẩm & hình ảnh thực tế**](${getPropertyPath(directProperty!)})`,
        'Anh/chị muốn em gửi thêm sổ đỏ/sơ đồ thửa đất hay hỗ trợ xem thực tế căn này ạ?'
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
        'Bạn là Lily, chuyên viên tư vấn đầu tư bất động sản xuất sắc, thân thiện và nhiệt tình của House & Life Đà Nẵng (bdsdanang.site).',
        'MỤC TIÊU CỐT LÕI: Tự động phân tích nhu cầu của khách hàng (ngân sách, khu vực, loại hình nhà/đất/căn hộ, mục đích ở hay đầu tư) và CHỦ ĐỘNG TÌM KIẾM, ĐỀ XUẤT các sản phẩm bất động sản phù hợp nhất từ giỏ hàng được cung cấp.',
        'NGUYÊN TẮC TƯ VẤN:',
        '1. Luôn dùng giọng điệu thân thiện, chu đáo, xưng "em" và gọi "anh/chị". Bắt đầu tự nhiên, ví dụ: "Dạ chào anh/chị ạ...", "Dạ với tầm tài chính / khu vực này, bên em đang có căn rất đẹp..."',
        '2. Khi khách hỏi tìm nhà/đất/căn hộ hoặc hỏi ngân sách/khu vực: BẮT BUỘC chọn ra 1 đến 3 sản phẩm phù hợp nhất trong giỏ hàng để giới thiệu.',
        '3. Cấu trúc mỗi sản phẩm bắt buộc phải rõ ràng, dễ nhìn:',
        '### 1. [Tên sản phẩm]',
        '- 📍 **Vị trí:** ...',
        '- 💰 **Giá:** ... tỷ',
        '- 📐 **Diện tích:** ... m²',
        '- 📄 **Pháp lý:** ...',
        '- ✨ **Điểm nổi bật:** (phân tích lợi thế kinh doanh, dòng tiền, phong thủy, hạ tầng...)',
        '- 🔗 [**Xem chi tiết sản phẩm**](<đường link path của sản phẩm>)',
        '4. ĐƯỜNG LINK CHI TIẾT: Sử dụng chính xác trường `path` được cung cấp trong từng sản phẩm trong giỏ hàng (ví dụ: `[Xem chi tiết sản phẩm](/duong-link-id)`).',
        '5. Nếu giỏ hàng không có sản phẩm khớp 100% ngân sách hoặc vị trí, hãy khéo léo giới thiệu các sản phẩm gần nhất kèm lời giải thích: "Hiện tại ở tầm giá X tỷ bên em đang có căn Y này rất tiềm năng...", không bao giờ từ chối cụt lủn.',
        '6. KẾT THÚC: Luôn đặt một câu hỏi mở gợi ý bước tiếp theo: hẹn lịch xem thực địa, gửi hình ảnh/sổ đỏ qua Zalo, hoặc hỏi thêm tiêu chí để lọc tiếp.',
        '7. TUYỆT ĐỐI không đề cập đến dữ liệu hệ thống, database, token, backend hay CRM nội bộ.'
      ].join('\n'),
      [
        `GIỎ HÀNG BẤT ĐỘNG SẢN HIỆN CÓ CỦA HOUSE & LIFE:\n${propertyContext || 'Chưa có sản phẩm công khai phù hợp.'}`,
        '',
        `Lịch sử trò chuyện gần nhất:\n${recentHistory || 'Đây là tin nhắn đầu tiên của khách.'}`,
        '',
        `Tin nhắn của khách hàng: ${message}`
      ].join('\n'),
      { temperature: 0.6 }
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

  return router;
}
