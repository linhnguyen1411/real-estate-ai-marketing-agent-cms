import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
  upsertPublicChatGuest
} from './server/dbHelper';
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
import { AuthUser, Customer, Property, Post, InboxMessage, AutomationTask, User } from './src/types';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.set('trust proxy', true);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));

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

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    data: {
      service: 'real-estate-ai-marketing-agent-cms',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      aiProvider: process.env.DEFAULT_AI_MODE || 'db-settings'
    }
  });
});

const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-only-auth-secret-change-me';

function toAuthUser(user: User, db: any): AuthUser {
  const company = db.companies?.find((item: any) => item.id === user.company_id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company_id: user.company_id,
    company_name: company?.name
  };
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
  if (user.role === 'company') return items.filter(item => item.company_id === user.company_id);
  return items.filter(item => item.company_id === user.company_id && (item.assigned_member_ids || []).includes(user.id));
}

function canAccessResource(resource: { company_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (user.role === 'owner') return true;
  if (user.role === 'company') return resource.company_id === user.company_id;
  return resource.company_id === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

function canManageResource(resource: { company_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (user.role === 'owner') return true;
  if (user.role === 'company') return resource.company_id === user.company_id;
  return resource.company_id === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
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
  const publicProperties = getProperties().filter((property: Property) => !['sold', 'hidden'].includes(property.sale_status || 'available'));
  res.json({ status: 'success', data: publicProperties });
});

app.post('/api/public/track-view', (req: Request, res: Response) => {
  const db = readDatabase();
  const now = new Date().toISOString();
  const propertyId = String(req.body?.propertyId || '').trim();
  const trackingType = String(req.body?.type || '').trim();

  if (trackingType === 'site' || !propertyId) {
    db.settings = {
      ...db.settings,
      site_view_count: Number((db.settings as any).site_view_count || 0) + 1,
      last_site_view_at: now
    } as any;
  }

  if (propertyId) {
    db.properties = db.properties.map((property: Property) => property.id === propertyId
      ? {
          ...property,
          public_view_count: Number(property.public_view_count || 0) + 1,
          last_public_view_at: now
        }
      : property
    );
  }

  writeDatabase(db);
  res.json({ status: 'success', data: { tracked: true } });
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

  res.json({ status: 'success', data: history });
});

app.post('/api/public/chat/guest', (req: Request, res: Response) => {
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
    createCustomer({
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

  const guest = upsertPublicChatGuest({ session_id: sessionId, name, phone, customer_id: customerId });
  res.json({ status: 'success', data: guest });
});

app.post('/api/public/contact', (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const budget = String(req.body?.budget || '').trim();
  const area = String(req.body?.area || '').trim();
  const note = String(req.body?.note || '').trim();

  if (!name || !phone) {
    res.status(400).json({ status: 'error', message: 'Vui lòng nhập tên và số điện thoại.' });
    return;
  }

  const messageLines = [
    `Khách gửi form liên hệ từ website.`,
    `Họ tên: ${name}`,
    `Số điện thoại: ${phone}`,
    budget ? `Ngân sách: ${budget}` : '',
    area ? `Khu vực quan tâm: ${area}` : '',
    note ? `Nhu cầu chi tiết: ${note}` : ''
  ].filter(Boolean);

  const inboxMessage = createInboxMessage({
    id: `in-web-${Date.now()}`,
    sender_name: name,
    platform: 'website',
    message: messageLines.join('\n'),
    intent: 'đặt lịch xem',
    status: 'pending',
    company_id: 'comp-da-nang',
    owner_user_id: 'u-owner',
    assigned_member_ids: [],
    created_at: new Date().toISOString()
  });

  res.json({ status: 'success', data: inboxMessage });
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
    saveChatMessage({
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

      saveChatMessage({
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

      saveChatMessage({
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

      saveChatMessage({
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

      saveChatMessage({
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

      saveChatMessage({
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

      saveChatMessage({
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

    saveChatMessage({
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

    saveChatMessage({
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

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path.startsWith('/public/')) return next();

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

app.get('/api/users', (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;
  const db = readDatabase();
  res.json({ status: 'success', data: scopeUsers(db.users || [], req) });
});

app.post('/api/users', (req: Request, res: Response) => {
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
  writeDatabase(db);
  res.json({ status: 'success', data: newUser });
});

app.put('/api/users/:id', (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const index = db.users.findIndex((user: User) => user.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy user.' });
    return;
  }

  const target = db.users[index] as User;
  if (authUser.role === 'company' && (target.company_id !== authUser.company_id || target.role === 'owner')) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật user này.' });
    return;
  }

  const body = req.body || {};
  const nextRole = authUser.role === 'owner' ? (body.role || target.role) : target.role;
  const nextCompanyId = authUser.role === 'owner' ? body.company_id : target.company_id;

  db.users[index] = {
    ...target,
    name: body.name !== undefined ? String(body.name).trim() : target.name,
    email: body.email !== undefined ? String(body.email).trim().toLowerCase() : target.email,
    password: body.password ? String(body.password) : target.password,
    role: nextRole,
    company_id: nextCompanyId,
    status: body.status === 'inactive' ? 'inactive' : body.status === 'active' ? 'active' : target.status
  };

  writeDatabase(db);
  res.json({ status: 'success', data: db.users[index] });
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
        todayTasksCount: customers.filter(c => c.lead_score > 80 && c.status === 'hot').length,
      },
      metrics
    }
  });
});

// ----------------------------------------------------
// Customers API (CRUD)
// ----------------------------------------------------
app.get('/api/customers', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: scopeCollection(db.customers, req) });
});

app.post('/api/customers', (req: Request, res: Response) => {
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

  writeDatabase(db);
  res.json({ status: 'success', data: newCustomer });
});

app.put('/api/customers/:id', (req: Request, res: Response) => {
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

  writeDatabase(db);
  res.json({ status: 'success', data: updatedCustomer });
});

app.delete('/api/customers/:id', (req: Request, res: Response) => {
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
  writeDatabase(db);
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

    writeDatabase(db);
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
  res.json({ status: 'success', data: scopeCollection(db.properties, req) });
});

app.post('/api/properties', (req: Request, res: Response) => {
  const db = readDatabase();
  const propData = req.body;
  
  const newProperty: Property = {
    id: `p-${Date.now()}`,
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

  db.properties.push(newProperty);
  
  // Trigger automation: Khi thêm mới bất động sản
  triggerAutomationEvent('Khi thêm mới bất động sản', `Thêm BĐS: ${newProperty.title}`, db);
  
  // Create static empty placeholders to prompt the user
  newProperty.ai_posts = {
    seo: {
      title: '',
      meta_description: '',
      keywords: [],
      hashtags: []
    },
    facebook: "",
    zalo: "",
    tiktok: "",
    website: "",
    image_prompt: "",
    video_prompt: ""
  };

  writeDatabase(db);
  res.json({ status: 'success', data: newProperty });
});

app.put('/api/properties/:id', (req: Request, res: Response) => {
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

  db.properties[index] = {
    ...db.properties[index],
    ...req.body
  };

  writeDatabase(db);
  res.json({ status: 'success', data: db.properties[index] });
});

app.delete('/api/properties/:id', (req: Request, res: Response) => {
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
  writeDatabase(db);
  res.json({ status: 'success', data: db.properties[index], message: 'Soft deleted property.' });
  return;
  writeDatabase(db);
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
    platformKeys.forEach(platform => {
      if (content[platform]) {
        saveGeneratedContent({
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
    });

    (['image_prompt', 'video_prompt'] as const).forEach((channel) => {
      if (content[channel]) {
        saveGeneratedContent({
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
    });

    writeDatabase(db);
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
  res.json({ status: 'success', data: scopeCollection(db.posts, req) });
});

app.post('/api/posts', (req: Request, res: Response) => {
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
  writeDatabase(db);
  res.json({ status: 'success', data: newPost });
});

app.put('/api/posts/:id', (req: Request, res: Response) => {
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

  writeDatabase(db);
  res.json({ status: 'success', data: db.posts[index] });
});

app.delete('/api/posts/:id', (req: Request, res: Response) => {
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
  writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa bài viết thành công' });
});


// ----------------------------------------------------
// Inbox đa kênh (Social Inbox)
// ----------------------------------------------------
app.get('/api/inbox', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: scopeCollection(db.inbox, req) });
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

    writeDatabase(db);
    res.json({ status: 'success', data: msg });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update reply status / send manual response simulations
app.post('/api/inbox/:id/reply', (req: Request, res: Response) => {
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

  writeDatabase(db);
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
    saveChatMessage({
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

    saveChatMessage({
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

app.put('/api/chat/guests/:sessionId/ai', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền đổi trạng thái AI.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = updatePublicChatGuestAi(sessionId, Boolean(req.body?.ai_enabled));
  if (!guest) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách chat.' });
    return;
  }
  res.json({ status: 'success', data: guest });
});

app.post('/api/chat/guests/:sessionId/messages', (req: Request, res: Response) => {
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
  updatePublicChatGuestAi(sessionId, false);
  const saved = saveChatMessage({
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

app.post('/api/content/generated/:id/verify', (req: Request, res: Response) => {
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

  const ok = verifyGeneratedContent(record.id, verifiedContent || record.raw_content);
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

app.post('/api/automations/:id/toggle', (req: Request, res: Response) => {
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

  writeDatabase(db);
  res.json({ status: 'success', data: db.automations[index] });
});

// Run Demo simulation report
app.post('/api/automations/run-demo', (req: Request, res: Response) => {
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

  writeDatabase(db);
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
  res.json({ status: 'success', data: db.settings });
});

app.put('/api/settings', (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;

  const db = readDatabase();
  db.settings = {
    ...db.settings,
    ...req.body
  };
  writeDatabase(db);
  res.json({ status: 'success', data: db.settings });
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

<<<<<<< Updated upstream
=======
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
  const keywords = Array.from(new Set([
    ...DEFAULT_SEO_KEYWORDS,
    ...(property.ai_posts?.seo?.keywords || [])
  ])).join(', ');

  return { title, description, image, url, keywords };
}

function renderIndexWithMeta(indexHtml: string, meta: { title: string; description: string; image: string; url: string; keywords: string }) {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    '<meta name="googlebot" content="index, follow, max-image-preview:large" />',
    '<meta property="og:locale" content="vi_VN" />',
    '<meta property="og:type" content="product" />',
    '<meta property="og:site_name" content="Estoria" />',
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : '',
    meta.image ? '<meta property="og:image:secure_url" content="' + escapeHtml(meta.image) + '" />' : '',
    meta.image ? '<meta property="og:image:type" content="image/jpeg" />' : '',
    meta.image ? '<meta property="og:image:alt" content="' + escapeHtml(meta.title) + '" />' : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : '',
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`
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

>>>>>>> Stashed changes
app.get('/robots.txt', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  res
    .type('text/plain')
    .send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /admin/',
      `Sitemap: ${origin}/sitemap.xml`
    ].join('\n'));
});

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

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((property: Property) => !['sold', 'hidden'].includes(property.sale_status || 'available'));
  const urls = [
    origin,
    ...publicProperties.map(property => `${origin}${getPropertyPath(property)}`)
  ];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url, index) => [
      '  <url>',
      `    <loc>${escapeXml(url)}</loc>`,
      `    <changefreq>${index === 0 ? 'daily' : 'weekly'}</changefreq>`,
      `    <priority>${index === 0 ? '1.0' : '0.8'}</priority>`,
      '  </url>'
    ].join('\n')),
    '</urlset>'
  ].join('\n');

  res.type('application/xml').send(xml);
});

const distPath = path.join(process.cwd(), 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Setup programmatic Vite server in developmental mode
  // so everything runs seamlessly under standard port 3000
  import('vite').then(({ createServer }) => {
    createServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/db.json', '**/db.json.*.bak', '**/dev-server*.log', '**/prod-server*.log']
        }
      },
      appType: 'spa',
    }).then((viteServer) => {
      app.use(viteServer.middlewares);
      app.get('*', (req: Request, res: Response, next: NextFunction) => {
        // Double check it's not and api path
        if (req.url.startsWith('/api')) {
          return next();
        }
        const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
        res.status(200).set({ 'Content-Type': 'text/html' }).end(indexHtml);
      });
    }).catch(err => {
      console.error("Vite server fails construction:", err);
    });
  });
}

// Start backend
app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 Real Estate AI CMS is listening on port ${PORT}!`);
  console.log(`🌍 Live Preview at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
