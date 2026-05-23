import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

// Always project root when started via `npm run dev` / `npm start` (cwd = repo root).
// import.meta.url breaks when server is bundled to .dev/ or dist/.
const projectRoot = process.cwd();
import { readDatabase, writeDatabase } from './server/dbHelper';
import { 
  analyzeCustomerWithAI, 
  generatePropertyMarketingContent, 
  generateAILiveChatReply, 
  generateAIConsultantReply 
} from './server/aiService';
import { Customer, Property, Post, InboxMessage, AutomationTask } from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json());

// Log API requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API REQUEST] ${req.method} ${req.url}`);
  next();
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
  
  // Counts
  const totalCustomers = db.customers.length;
  const leadHot = db.customers.filter(c => c.status === 'hot').length;
  const leadWarm = db.customers.filter(c => c.status === 'warm').length;
  const leadCold = db.customers.filter(c => c.status === 'new').length;
  
  const totalProperties = db.properties.length;
  const totalPosts = db.posts.length;
  const pendingInbox = db.inbox.filter(i => i.status === 'pending').length;
  
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
        todayTasksCount: db.customers.filter(c => c.lead_score > 80 && c.status === 'hot').length + 2,
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
  res.json({ status: 'success', data: db.customers });
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
    created_at: new Date().toISOString()
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
  const filtered = db.customers.filter(c => c.id !== req.params.id);
  
  if (filtered.length === db.customers.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng' });
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
  res.json({ status: 'success', data: db.properties });
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
    selling_points: Array.isArray(propData.selling_points) ? propData.selling_points : [propData.selling_points || 'Vị trí lý tưởng']
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

  db.properties[index] = {
    ...db.properties[index],
    ...req.body
  };

  writeDatabase(db);
  res.json({ status: 'success', data: db.properties[index] });
});

app.delete('/api/properties/:id', (req: Request, res: Response) => {
  const db = readDatabase();
  const filtered = db.properties.filter(p => p.id !== req.params.id);
  
  if (filtered.length === db.properties.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
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
            created_at: new Date().toISOString()
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
  res.json({ status: 'success', data: db.posts });
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
    created_at: new Date().toISOString()
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

  db.posts[index] = {
    ...db.posts[index],
    ...req.body
  };

  writeDatabase(db);
  res.json({ status: 'success', data: db.posts[index] });
});

app.delete('/api/posts/:id', (req: Request, res: Response) => {
  const db = readDatabase();
  const filtered = db.posts.filter(p => p.id !== req.params.id);

  if (filtered.length === db.posts.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
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
  res.json({ status: 'success', data: db.inbox });
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

  db.inbox[index].status = 'replied';
  
  // Simulate posting the reply back to the platform
  console.log(`[OUTBOX SENT] Sent to ${db.inbox[index].platform} to ${db.inbox[index].sender_name}: "${replyText}"`);

  writeDatabase(db);
  res.json({ status: 'success', data: db.inbox[index] });
});


// ----------------------------------------------------
// Chatbot AI Center
// ----------------------------------------------------
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { message } = req.body;
  const db = readDatabase();

  if (!message) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống' });
    return;
  }

  try {
    const aiResponse = await generateAILiveChatReply(message, {
      customers: db.customers,
      properties: db.properties,
      posts: db.posts
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
  res.json({ status: 'success', data: db.automations });
});

app.post('/api/automations/:id/toggle', (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.automations.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy kịch bản tự động' });
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

  // Run all active automations
  db.automations = db.automations.map((auto: AutomationTask) => {
    if (auto.status === 'active') {
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
  res.json({ status: 'success', data: db.automations });
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
const distPath = path.join(projectRoot, 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Use vite.config.mjs (not .ts) — tsconfig "paths": {"@/*"} breaks tsx on WSL:
  // it mis-resolves @vitejs/* and @tailwindcss/* as path aliases → ERR_INVALID_URL_SCHEME
  import('vite').then(({ createServer }) => {
    createServer({
      configFile: path.join(projectRoot, 'vite.config.mjs'),
      server: { middlewareMode: true },
      appType: 'spa',
    }).then((viteServer) => {
      app.use(viteServer.middlewares);
      app.get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.url.startsWith('/api')) {
          return next();
        }
        const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf-8');
        res.status(200).set({ 'Content-Type': 'text/html' }).end(indexHtml);
      });
    }).catch(err => {
      console.error("Vite server fails construction:", err);
    });
  }).catch(err => {
    console.error("Vite dev setup failed:", err);
  });
}

// Start backend
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Real Estate AI CMS is listening on port ${PORT}!`);
  console.log(`🌍 Live Preview at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
