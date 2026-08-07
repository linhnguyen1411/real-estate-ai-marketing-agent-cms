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

export function createPublicSiteRouter() {
  const router = Router();

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

router.get('/api/public/seo', async (req: Request, res: Response) => {
  const keywords = buildSiteSeoKeywords(
    getProperties().filter((property: Property) => !['sold', 'hidden'].includes(property.sale_status || 'available')),
    DEFAULT_SEO_KEYWORDS
  );
  await updateSettings({ seo_keywords: keywords });
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

  const properties = filterPublicProperties(getProperties()).filter((property: Property) => {
    const creatorId = property.created_by_user_id || property.owner_user_id;
    return creatorId === user.id;
  });

  res.json({ status: 'success', data: { ...profile, properties } });
});

// ----------------------------------------------------
// Public traffic tracking (register early, before static/vite fallbacks)
// ----------------------------------------------------
router.post('/api/public/track-view', async (req: Request, res: Response) => {
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

router.get('/api/public/chat/history', (req: Request, res: Response) => {
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

router.post('/api/public/chat/guest', async (req: Request, res: Response) => {
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

router.post('/api/public/contact', async (req: Request, res: Response) => {
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

router.post('/api/public/chat', async (req: Request, res: Response) => {
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

  return router;
}
