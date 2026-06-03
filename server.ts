import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { readDatabase, writeDatabase } from './server/dbHelper';
import { 
  analyzeCustomerWithAI, 
  generatePropertyMarketingContent, 
  generateAILiveChatReply, 
  generateAIConsultantReply,
  getAIProviderStatus
} from './server/aiService';
import { AuthUser, Customer, Property, Post, InboxMessage, AutomationTask, User } from './src/types';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));

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

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.path === '/auth/login') return next();

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
  
  const totalProperties = properties.length;
  const totalPosts = posts.length;
  const pendingInbox = inbox.filter(i => i.status === 'pending').length;
  
  // Marketing efficiency metrics mock data (Facebook, Zalo, Tiktok, Website)
  const metrics = [
    { platform: 'Facebook', reach: 12400, engagement: 2450, leads: 45 },
    { platform: 'Zalo', reach: 6800, engagement: 1890, leads: 32 },
    { platform: 'TikTok', reach: 45000, engagement: 8200, leads: 58 },
    { platform: 'Website', reach: 18200, engagement: 5600, leads: 64 },
  ];

  res.json({
    status: 'success',
    data: {
      stats: {
        totalCustomers,
        leads: { hot: leadHot, warm: leadWarm, cold: leadCold },
        totalProperties,
        totalPosts,
        pendingInbox,
        todayTasksCount: customers.filter(c => c.lead_score > 80 && c.status === 'hot').length + 2,
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
    property_type: customerData.property_type || 'đất nền',
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
    type: propData.type || 'đất',
    location: propData.location || '',
    area: parseFloat(propData.area) || 0,
    price: parseFloat(propData.price) || 0,
    legal_status: propData.legal_status || 'Sổ hồng riêng',
    direction: propData.direction || 'Đông',
    road_width: parseFloat(propData.road_width) || 5.5,
    description: propData.description || '',
    images: propData.images || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
    selling_points: Array.isArray(propData.selling_points) ? propData.selling_points : [propData.selling_points || 'Vị trí lý tưởng'],
    ...accessDefaults(req, propData)
  };

  db.properties.push(newProperty);
  
  // Trigger automation: Khi thêm mới bất động sản
  triggerAutomationEvent('Khi thêm mới bất động sản', `Thêm BĐS: ${newProperty.title}`, db);
  
  // Create static empty placeholders to prompt the user
  newProperty.ai_posts = {
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
  const target = db.properties.find(p => p.id === req.params.id);
  const filtered = db.properties.filter(p => p.id !== req.params.id);
  
  if (filtered.length === db.properties.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa bất động sản này.' });
    return;
  }

  db.properties = filtered;
  writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa bất động sản thành công' });
});

// POST /api/ai/generate-content
app.post('/api/ai/generate-content', async (req: Request, res: Response) => {
  const { propertyId, tone } = req.body;
  const db = readDatabase();
  const property = db.properties.find(p => p.id === propertyId);

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
        // Check if there is already an AI post draft for this property/platform to update or add
        const existingPost = db.posts.find(post => post.property_id === propertyId && post.platform === platform && post.status === 'draft');
        if (existingPost) {
          existingPost.content = content[platform];
        } else {
          db.posts.push({
            id: `post-${Date.now()}-${platform}`,
            title: `[Tự động AI - Draft] Bài viết ${platform.toUpperCase()} - ${property.title}`,
            platform: platform,
            content: content[platform],
            status: 'draft',
            property_id: property.id,
            property_title: property.title,
            created_by_ai: true,
            created_at: new Date().toISOString(),
            company_id: property.company_id,
            owner_user_id: property.owner_user_id,
            assigned_member_ids: property.assigned_member_ids || []
          });
        }
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

  const newPost: Post = {
    id: `post-${Date.now()}`,
    title: postData.title || 'Bài viết mới',
    platform: postData.platform || 'facebook',
    content: postData.content || '',
    status: postData.status || 'draft',
    scheduled_at: postData.scheduled_at || '',
    property_id: postData.property_id || '',
    property_title: postData.property_title || '',
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
  const property = db.properties.find(p => p.id === (customer?.property_type === 'đất nền' ? 'p-1' : 'p-2'));

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

  if (!message) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống' });
    return;
  }

  try {
    const aiResponse = await generateAILiveChatReply(message, {
      customers: scopeCollection(db.customers, req),
      properties: scopeCollection(db.properties, req),
      posts: scopeCollection(db.posts, req)
    });

    res.json({ status: 'success', data: aiResponse });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
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
      server: { middlewareMode: true },
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
