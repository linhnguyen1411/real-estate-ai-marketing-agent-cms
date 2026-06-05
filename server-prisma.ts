import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { 
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProperties, createProperty, updateProperty, deleteProperty,
  getPosts, createPost, updatePost, deletePost,
  getInboxMessages, createInboxMessage, updateInboxMessage,
  getAutomations, updateAutomation,
  getSettings, updateSettings,
  triggerAutomationEvent,
  getAllDataForContext,
  readDatabase,
  saveChatMessage
} from './server/dbHelper';
import { 
  analyzeCustomerWithAI, 
  generatePropertyMarketingContent, 
  generateAILiveChatReply, 
  generateAIConsultantReply
} from './server/aiService';
import { Customer, Property, Post, InboxMessage, AutomationTask } from './src/types';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

// Log API requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API REQUEST] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    data: {
      service: 'real-estate-ai-marketing-agent-cms',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'PostgreSQL'
    }
  });
});

// ============ DASHBOARD ============
app.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    const [customers, properties, posts, inbox, automations] = await Promise.all([
      getCustomers(),
      getProperties(),
      getPosts(),
      getInboxMessages(),
      getAutomations()
    ]);

    const totalCustomers = customers.length;
    const leadHot = customers.filter(c => c.status === 'hot').length;
    const leadWarm = customers.filter(c => c.status === 'warm').length;
    const leadCold = customers.filter(c => c.status === 'new').length;
    
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
          totalProperties: properties.filter(property => property.sale_status !== 'sold').length,
          totalPosts: posts.length,
          pendingInbox: inbox.filter(i => i.status === 'pending').length,
          todayTasksCount: customers.filter(c => c.lead_score > 80 && c.status === 'hot').length,
        },
        metrics
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============ CUSTOMERS CRUD ============
app.get('/api/customers', async (req: Request, res: Response) => {
  try {
    const customers = await getCustomers();
    res.json({ status: 'success', data: customers });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/customers', async (req: Request, res: Response) => {
  try {
    const newCustomer = await createCustomer({
      name: req.body.name || 'Khách hàng mới',
      phone: req.body.phone || '',
      email: req.body.email || '',
      source: req.body.source || 'website',
      budget: parseFloat(req.body.budget) || 0,
      interested_area: req.body.interested_area || 'Đà Nẵng',
      property_type: req.body.property_type || 'đất nền',
      status: req.body.status || 'new',
      notes: req.body.notes || '',
      ai_summary: req.body.ai_summary || 'Chưa phân tích',
      lead_score: parseInt(req.body.lead_score) || 50,
    });

    if (newCustomer.lead_score > 80) {
      await triggerAutomationEvent('Lead Score vượt mốc 80', `Khách hàng tiềm năng: ${newCustomer.name}`);
    }

    res.json({ status: 'success', data: newCustomer });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    const customer = await updateCustomer(req.params.id, req.body);
    
    if (customer.lead_score > 80 && req.body.lead_score <= 80) {
      await triggerAutomationEvent('Lead Score vượt mốc 80', `Cập nhật khách hàng VIP: ${customer.name}`);
    }

    res.json({ status: 'success', data: customer });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    await deleteCustomer(req.params.id);
    res.json({ status: 'success', message: 'Đã xóa khách hàng thành công' });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

// ============ AI ANALYZE CUSTOMER ============
app.post('/api/ai/analyze-customer', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.body;
    const customer = await getCustomerById(customerId);

    if (!customer) {
      res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng để phân tích.' });
      return;
    }

    const analysis = await analyzeCustomerWithAI(customer);
    const updated = await updateCustomer(customerId, {
      ai_summary: analysis.ai_summary,
      lead_score: analysis.lead_score
    });

    if (analysis.lead_score > 80) {
      await triggerAutomationEvent('Lead Score vượt mốc 80', `AI chấm điểm VIP: ${customer.name}`);
    }

    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============ PROPERTIES CRUD ============
app.get('/api/properties', async (req: Request, res: Response) => {
  try {
    const properties = await getProperties();
    res.json({ status: 'success', data: properties });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/properties', async (req: Request, res: Response) => {
  try {
    const newProperty = await createProperty({
      title: req.body.title || 'BĐS Chưa đặt tên',
      type: req.body.type || 'đất',
      location: req.body.location || '',
      area: parseFloat(req.body.area) || 0,
      price: parseFloat(req.body.price) || 0,
      legal_status: req.body.legal_status || 'Sổ hồng riêng',
      direction: req.body.direction || 'Đông',
      road_width: parseFloat(req.body.road_width) || 5.5,
      description: req.body.description || '',
      images: req.body.images || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
      selling_points: Array.isArray(req.body.selling_points) ? req.body.selling_points : [req.body.selling_points || 'Vị trí lý tưởng'],
      ai_posts: {
        facebook: "",
        zalo: "",
        tiktok: "",
        website: "",
        image_prompt: "",
        video_prompt: ""
      }
    });

    await triggerAutomationEvent('Khi thêm mới bất động sản', `Thêm BĐS: ${newProperty.title}`);

    res.json({ status: 'success', data: newProperty });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/api/properties/:id', async (req: Request, res: Response) => {
  try {
    const updated = await updateProperty(req.params.id, req.body);
    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/properties/:id', async (req: Request, res: Response) => {
  try {
    await deleteProperty(req.params.id);
    res.json({ status: 'success', message: 'Đã xóa bất động sản thành công' });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

// ============ AI GENERATE CONTENT ============
app.post('/api/ai/generate-content', async (req: Request, res: Response) => {
  try {
    const { propertyId, tone } = req.body;
    const property = await getPropertyById(propertyId);

    if (!property) {
      res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản để tạo marketing.' });
      return;
    }

    const content = await generatePropertyMarketingContent(property, undefined, tone);
    const updated = await updateProperty(propertyId, { ai_posts: content });

    // Auto create draft posts
    const platformKeys: ('facebook' | 'zalo' | 'tiktok' | 'website')[] = ['facebook', 'zalo', 'tiktok', 'website'];
    for (const platform of platformKeys) {
      if (content[platform]) {
        await createPost({
          title: `[Tự động AI - Draft] Bài viết ${platform.toUpperCase()} - ${property.title}`,
          platform,
          content: content[platform],
          status: 'draft',
          property_id: property.id,
          property_title: property.title,
          created_by_ai: true
        });
      }
    }

    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============ POSTS CRUD ============
app.get('/api/posts', async (req: Request, res: Response) => {
  try {
    const posts = await getPosts();
    res.json({ status: 'success', data: posts });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/posts', async (req: Request, res: Response) => {
  try {
    const newPost = await createPost({
      title: req.body.title || 'Bài viết mới',
      platform: req.body.platform || 'facebook',
      content: req.body.content || '',
      status: req.body.status || 'draft',
      scheduled_at: req.body.scheduled_at || null,
      property_id: req.body.property_id || null,
      property_title: req.body.property_title || '',
      created_by_ai: req.body.created_by_ai || false
    });

    res.json({ status: 'success', data: newPost });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/api/posts/:id', async (req: Request, res: Response) => {
  try {
    const updated = await updatePost(req.params.id, req.body);
    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/posts/:id', async (req: Request, res: Response) => {
  try {
    await deletePost(req.params.id);
    res.json({ status: 'success', message: 'Đã xóa bài viết thành công' });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

// ============ INBOX ============
app.get('/api/inbox', async (req: Request, res: Response) => {
  try {
    const messages = await getInboxMessages();
    res.json({ status: 'success', data: messages });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/ai/generate-reply', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.body;
    const messages = await getInboxMessages();
    const msg = messages.find(i => i.id === messageId);

    if (!msg) {
      res.status(404).json({ status: 'error', message: 'Không tìm thấy tin nhắn.' });
      return;
    }

    const aiSuggestion = await generateAIConsultantReply(msg.message, msg.customer, msg.property);
    const updated = await updateInboxMessage(messageId, {
      ai_reply_suggestion: aiSuggestion,
      intent: msg.intent || 'chưa rõ'
    });

    if (updated.intent === 'hỏi giá' || updated.intent === 'thương lượng') {
      await triggerAutomationEvent('Nhận comment bình luận hỏi giá', `Tin nhắn của ${msg.sender_name}`);
    }

    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/inbox/:id/reply', async (req: Request, res: Response) => {
  try {
    const { replyText } = req.body;
    const updated = await updateInboxMessage(req.params.id, { status: 'replied' });
    console.log(`[OUTBOX SENT] Sent reply: "${replyText}"`);
    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});

// ============ AUTOMATIONS ============
app.get('/api/automations', async (req: Request, res: Response) => {
  try {
    const automations = await getAutomations();
    res.json({ status: 'success', data: automations });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/automations/:id/toggle', async (req: Request, res: Response) => {
  try {
    const automations = await getAutomations();
    const auto = automations.find(a => a.id === req.params.id);

    if (!auto) {
      res.status(404).json({ status: 'error', message: 'Không tìm thấy kịch bản tự động' });
      return;
    }

    const newStatus = auto.status === 'active' ? 'inactive' : 'active';
    const now = new Date().toISOString();
    const updated = await updateAutomation(req.params.id, {
      status: newStatus,
      logs: [`${now} - Trạng thái chuyển sang: ${newStatus.toUpperCase()}`, ...auto.logs]
    });

    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============ CHANNELS ============
app.get('/api/channels', (req: Request, res: Response) => {
  const channels = [
    { name: "Facebook Page RealEstate", platform: "facebook", connected: true, last_sync: "Ít phút trước", messages_count: 5, comments_count: 42 },
    { name: "Zalo Official Account Land", platform: "zalo", connected: true, last_sync: "5 phút trước", messages_count: 8, comments_count: 0 },
    { name: "TikTok Business Account", platform: "tiktok", connected: true, last_sync: "10 phút trước", messages_count: 2, comments_count: 154 },
    { name: "Website Customer LiveChat", platform: "website", connected: true, last_sync: "Chào đón liên tục", messages_count: 4, comments_count: 0 },
  ];
  res.json({ status: 'success', data: channels });
});

// ============ SETTINGS ============
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    res.json({ status: 'success', data: settings });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/api/settings', async (req: Request, res: Response) => {
  try {
    const updated = await updateSettings(req.body);
    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============ AI CHATBOT ============
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống' });
      return;
    }

    const recentHistory = (readDatabase().chat_history || [])
      .filter(item => item.user_id === 'prisma-user')
      .slice(0, 10)
      .reverse()
      .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.message}`)
      .join('\n');
    saveChatMessage({ user_id: 'prisma-user', role: 'user', message });

    const context = await getAllDataForContext();
    const aiResponse = await generateAILiveChatReply(
      `${recentHistory ? `Lịch sử trò chuyện:\n${recentHistory}\n\n` : ''}Tin nhắn mới: ${message}`,
      {
      customers: context.customers,
      properties: context.properties,
      posts: context.posts
      }
    );
    saveChatMessage({ user_id: 'prisma-user', role: 'model', message: aiResponse });

    res.json({ status: 'success', data: aiResponse });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/chat/history', (req: Request, res: Response) => {
  const history = (readDatabase().chat_history || []).filter(item => item.user_id === 'prisma-user');
  res.json({ status: 'success', data: history });
});

// ============ HELPER: Get customer by ID ============
async function getCustomerById(id: string) {
  const customers = await getCustomers();
  return customers.find(c => c.id === id);
}

async function getPropertyById(id: string) {
  const properties = await getProperties();
  return properties.find(p => p.id === id);
}

// ============ FRONTEND ASSETS ============
const distPath = path.join(process.cwd(), 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Vite dev middleware
  import('vite').then(({ createServer }) => {
    createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    }).then((viteServer) => {
      app.use(viteServer.middlewares);
      app.get('*', (req: Request, res: Response) => {
        if (req.url.startsWith('/api')) {
          return;
        }
        const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
        res.status(200).set({ 'Content-Type': 'text/html' }).end(indexHtml);
      });
    }).catch(err => {
      console.error("Vite server initialization failed:", err);
    });
  });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Real Estate AI CMS is listening on port ${PORT}!`);
  console.log(`🌍 Live Preview at: http://localhost:${PORT}`);
  console.log(`📊 Database: PostgreSQL via Prisma ORM`);
  console.log(`====================================================`);
});
