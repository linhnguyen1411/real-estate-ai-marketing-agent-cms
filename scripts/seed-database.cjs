const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db.json');

const now = new Date().toISOString();

const database = {
  companies: [
    {
      id: 'comp-da-nang',
      name: 'Da Nang Prime Realty',
      status: 'active',
      created_at: '2026-05-01T02:00:00.000Z'
    },
    {
      id: 'comp-hoi-an',
      name: 'Hoi An Coastal Homes',
      status: 'active',
      created_at: '2026-05-03T02:00:00.000Z'
    }
  ],
  users: [
    {
      id: 'u-owner',
      name: 'System Owner',
      email: 'owner@example.com',
      password: 'owner123',
      role: 'owner',
      status: 'active',
      created_at: '2026-05-01T01:00:00.000Z'
    },
    {
      id: 'u-company-admin',
      name: 'Company Admin',
      email: 'admin@danang.example.com',
      password: 'admin123',
      role: 'company',
      company_id: 'comp-da-nang',
      status: 'active',
      created_at: '2026-05-01T01:10:00.000Z'
    },
    {
      id: 'u-member-a',
      name: 'Sale Member A',
      email: 'member-a@danang.example.com',
      password: 'member123',
      role: 'member',
      company_id: 'comp-da-nang',
      status: 'active',
      created_at: '2026-05-01T01:20:00.000Z'
    },
    {
      id: 'u-member-b',
      name: 'Sale Member B',
      email: 'member-b@danang.example.com',
      password: 'member123',
      role: 'member',
      company_id: 'comp-da-nang',
      status: 'active',
      created_at: '2026-05-01T01:30:00.000Z'
    },
    {
      id: 'u-hoian-admin',
      name: 'Hoi An Admin',
      email: 'admin@hoian.example.com',
      password: 'admin123',
      role: 'company',
      company_id: 'comp-hoi-an',
      status: 'active',
      created_at: '2026-05-03T01:10:00.000Z'
    }
  ],
  customers: [
    {
      id: 'c-1',
      name: 'Nguyễn Văn Anh',
      phone: '0905123456',
      email: 'vananh.nguyen@example.com',
      source: 'facebook',
      budget: 4.5,
      interested_area: 'Hòa Xuân, Cẩm Lệ',
      property_type: 'đất nền',
      status: 'hot',
      notes: 'Cần mua lô đất xây nhà ở ngay, ưu tiên hướng Đông Nam, đường tối thiểu 7.5m. Đã đi xem một lần và muốn thương lượng giá.',
      ai_summary: 'Khách có nhu cầu ở thực, ngân sách rõ và khả năng chốt cao. Nên gửi 2 lô phù hợp nhất, chuẩn bị pháp lý và lịch xem thực tế trong 24 giờ.',
      lead_score: 88,
      created_at: '2026-05-10T08:30:00.000Z'
    },
    {
      id: 'c-2',
      name: 'Phạm Thị Bình',
      phone: '0989789123',
      email: 'binh.pham@example.com',
      source: 'zalo',
      budget: 7.2,
      interested_area: 'Hòa Quý, Ngũ Hành Sơn',
      property_type: 'nhà phố',
      status: 'warm',
      notes: 'Quan tâm nhà 3 tầng để ở kết hợp mở spa gia đình. Ưu tiên pháp lý sạch và có chỗ đậu ô tô.',
      ai_summary: 'Khách tìm sản phẩm vừa ở vừa kinh doanh. Cần tư vấn kỹ công năng, pháp lý hoàn công và khả năng khai thác dòng tiền.',
      lead_score: 74,
      created_at: '2026-05-12T14:20:00.000Z'
    },
    {
      id: 'c-3',
      name: 'Trần Minh Cường',
      phone: '0914555888',
      email: 'cuong.tran@example.com',
      source: 'referral',
      budget: 12,
      interested_area: 'Nam Đà Nẵng',
      property_type: 'shophouse',
      status: 'new',
      notes: 'Nhà đầu tư từ Hà Nội, muốn mua 1-2 block shophouse ven sông để cho thuê dài hạn.',
      ai_summary: 'Khách có ngân sách lớn và tư duy đầu tư. Nên chuẩn bị bảng so sánh lợi suất, tỷ lệ lấp đầy và kế hoạch khai thác.',
      lead_score: 79,
      created_at: '2026-05-15T09:00:00.000Z'
    },
    {
      id: 'c-4',
      name: 'Lê Hoàng Dung',
      phone: '0934111222',
      email: 'dung.le@example.com',
      source: 'website',
      budget: 2.8,
      interested_area: 'Liên Chiểu',
      property_type: 'căn hộ',
      status: 'hot',
      notes: 'Gia đình trẻ tìm căn hộ 2 phòng ngủ gần trường đại học, thích ban công view biển hoặc thành phố.',
      ai_summary: 'Khách mua ở thực, quan tâm chính sách thanh toán và hỗ trợ vay. Nên tư vấn các dự án có tiến độ rõ, pháp lý minh bạch.',
      lead_score: 91,
      created_at: '2026-05-16T11:45:00.000Z'
    },
    {
      id: 'c-5',
      name: 'Vũ Đình Em',
      phone: '0977444333',
      email: 'em.vu@example.com',
      source: 'tiktok',
      budget: 5,
      interested_area: 'Hòa Xuân, Cẩm Lệ',
      property_type: 'đất nền',
      status: 'new',
      notes: 'Để lại bình luận hỏi giá lô góc trên TikTok. Chưa cung cấp rõ thời gian mua và phương án tài chính.',
      ai_summary: 'Lead mới từ TikTok, cần gọi xác minh nhu cầu và ngân sách thật. Ưu tiên kịch bản hỏi nhanh về mục đích mua, thời điểm chốt và khả năng đặt cọc.',
      lead_score: 46,
      created_at: '2026-05-18T16:10:00.000Z'
    },
    {
      id: 'c-6',
      name: 'Hoàng Thu Giang',
      phone: '0903888999',
      email: 'giang.hoang@example.com',
      source: 'facebook',
      budget: 9.5,
      interested_area: 'Sơn Trà',
      property_type: 'shophouse',
      status: 'warm',
      notes: 'Tìm shophouse gần biển để kinh doanh homestay hoặc nhà hàng nhỏ, thích thiết kế tân cổ điển.',
      ai_summary: 'Khách có nhu cầu kinh doanh du lịch rõ. Cần gửi sản phẩm có vị trí dễ nhận diện, mặt tiền tốt và phân tích chi phí vận hành.',
      lead_score: 67,
      created_at: '2026-05-19T10:05:00.000Z'
    },
    {
      id: 'c-7',
      name: 'Đặng Quốc Huy',
      phone: '0912123321',
      email: 'huy.dang@example.com',
      source: 'website',
      budget: 15,
      interested_area: 'Hòa Quý, Ngũ Hành Sơn',
      property_type: 'kho xưởng',
      status: 'closed',
      notes: 'Đã chốt mua khu đất 500m2 làm kho bãi vật liệu xây dựng. Cần chăm sóc sau bán và giới thiệu sản phẩm mở rộng.',
      ai_summary: 'Khách đã giao dịch thành công, có khả năng mua thêm. Nên đưa vào nhóm khách VIP sau bán và chăm sóc định kỳ.',
      lead_score: 100,
      created_at: '2026-05-05T09:30:00.000Z'
    },
    {
      id: 'c-8',
      name: 'Bùi Minh Khánh',
      phone: '0983666777',
      email: 'khanh.bui@example.com',
      source: 'zalo',
      budget: 3.8,
      interested_area: 'Liên Chiểu',
      property_type: 'nhà phố',
      status: 'warm',
      notes: 'Tìm nhà phố nhỏ, kiệt ô tô đi lọt, gần trục chính để tiện di chuyển về trung tâm.',
      ai_summary: 'Khách tài chính tầm trung, cần sản phẩm thực dụng. Nên lọc nhà kiệt thông, pháp lý sạch, không cần decor quá cao cấp.',
      lead_score: 62,
      created_at: '2026-05-20T08:00:00.000Z'
    }
  ],
  properties: [
    {
      id: 'p-1',
      title: 'Lô góc Hòa Xuân đường 7.5m sát công viên',
      type: 'đất',
      location: 'Hòa Xuân, Cẩm Lệ, Đà Nẵng',
      area: 108,
      price: 4.65,
      legal_status: 'Sổ hồng riêng',
      direction: 'Đông Nam',
      road_width: 7.5,
      description: 'Lô góc khu dân cư hiện hữu, gần công viên và tuyến đường kết nối trung tâm. Phù hợp xây nhà ở hoặc giữ tài sản.',
      images: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80',
      selling_points: ['Lô góc thoáng', 'Đường 7.5m', 'Gần công viên', 'Dân cư hiện hữu'],
      ai_posts: {
        facebook: '',
        zalo: '',
        tiktok: '',
        website: '',
        image_prompt: '',
        video_prompt: ''
      }
    },
    {
      id: 'p-2',
      title: 'Nhà phố 3 tầng Hòa Quý phù hợp mở spa',
      type: 'nhà phố',
      location: 'Hòa Quý, Ngũ Hành Sơn, Đà Nẵng',
      area: 90,
      price: 7.35,
      legal_status: 'Sổ hồng hoàn công',
      direction: 'Nam',
      road_width: 5.5,
      description: 'Nhà xây mới 3 tầng, bố trí tầng trệt thông thoáng, thích hợp vừa ở vừa kinh doanh dịch vụ chăm sóc cá nhân.',
      images: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      selling_points: ['Hoàn công đầy đủ', 'Công năng kinh doanh', 'Khu dân cư ổn định', 'Gần trục Minh Mạng']
    },
    {
      id: 'p-3',
      title: 'Shophouse ven sông Nam Đà Nẵng cho thuê tốt',
      type: 'shophouse',
      location: 'Nam Đà Nẵng',
      area: 126,
      price: 11.8,
      legal_status: 'Hợp đồng mua bán, chờ sổ',
      direction: 'Tây Nam',
      road_width: 10.5,
      description: 'Shophouse trên trục thương mại mới, phù hợp khai thác cafe, showroom hoặc văn phòng đại diện.',
      images: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
      selling_points: ['Ven sông', 'Mặt tiền thương mại', 'Dòng tiền cho thuê', 'Khu đô thị mới']
    },
    {
      id: 'p-4',
      title: 'Căn hộ 2 phòng ngủ Liên Chiểu view thành phố',
      type: 'căn hộ',
      location: 'Liên Chiểu, Đà Nẵng',
      area: 68,
      price: 2.75,
      legal_status: 'Hợp đồng mua bán',
      direction: 'Đông',
      road_width: 12,
      description: 'Căn hộ tầng trung, thiết kế sáng, gần trường đại học và khu công nghệ cao, phù hợp gia đình trẻ.',
      images: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      selling_points: ['2 phòng ngủ', 'Ban công thoáng', 'Gần trường đại học', 'Thanh toán linh hoạt']
    },
    {
      id: 'p-5',
      title: 'Shophouse Sơn Trà gần biển cho mô hình homestay',
      type: 'shophouse',
      location: 'Sơn Trà, Đà Nẵng',
      area: 112,
      price: 9.9,
      legal_status: 'Sổ hồng riêng',
      direction: 'Đông Bắc',
      road_width: 7.5,
      description: 'Nhà thương mại gần biển, dễ nhận diện, phù hợp khai thác homestay, nhà hàng nhỏ hoặc văn phòng du lịch.',
      images: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80',
      selling_points: ['Gần biển', 'Mặt tiền đẹp', 'Khai thác du lịch', 'Pháp lý sạch']
    },
    {
      id: 'p-6',
      title: 'Đất kho bãi Hòa Quý 500m2 xe tải vào tận nơi',
      type: 'kho xưởng',
      location: 'Hòa Quý, Ngũ Hành Sơn, Đà Nẵng',
      area: 500,
      price: 15.2,
      legal_status: 'Sổ hồng riêng',
      direction: 'Tây',
      road_width: 12,
      description: 'Khu đất diện tích lớn, phù hợp làm kho bãi, xưởng nhẹ hoặc điểm tập kết vật liệu xây dựng.',
      images: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=80',
      selling_points: ['Diện tích lớn', 'Xe tải ra vào thuận tiện', 'Gần trục vận tải', 'Phù hợp kho bãi']
    }
  ],
  posts: [
    {
      id: 'post-1',
      title: 'Lô góc Hòa Xuân đường 7.5m sát công viên',
      platform: 'facebook',
      content: 'Hàng mới Hòa Xuân: lô góc 108m2, đường 7.5m, hướng Đông Nam, sát công viên. Phù hợp xây nhà ở ngay hoặc giữ tài sản dài hạn. Liên hệ để nhận sổ và lịch xem đất.',
      status: 'published',
      property_id: 'p-1',
      property_title: 'Lô góc Hòa Xuân đường 7.5m sát công viên',
      created_by_ai: false,
      engagement: { views: 12400, likes: 286, shares: 34, comments: 41 },
      created_at: '2026-05-21T09:00:00.000Z'
    },
    {
      id: 'post-2',
      title: 'Nhà phố Hòa Quý 3 tầng cho mô hình spa',
      platform: 'zalo',
      content: 'Nhà phố 3 tầng Hòa Quý, pháp lý hoàn công, tầng trệt thoáng để kinh doanh spa hoặc văn phòng nhỏ. Giá 7.35 tỷ, nhận thông tin chi tiết qua Zalo.',
      status: 'scheduled',
      scheduled_at: '2026-06-04T08:30:00.000Z',
      property_id: 'p-2',
      property_title: 'Nhà phố 3 tầng Hòa Quý phù hợp mở spa',
      created_by_ai: false,
      engagement: { views: 2600, likes: 58, shares: 7, comments: 9 },
      created_at: '2026-05-22T10:00:00.000Z'
    },
    {
      id: 'post-3',
      title: 'Kịch bản TikTok shophouse Sơn Trà',
      platform: 'tiktok',
      content: 'Mở đầu bằng cảnh biển Sơn Trà, chuyển nhanh sang mặt tiền shophouse, nhấn mạnh mô hình homestay và dòng tiền du lịch. CTA: inbox nhận bảng tính lợi nhuận.',
      status: 'draft',
      property_id: 'p-5',
      property_title: 'Shophouse Sơn Trà gần biển cho mô hình homestay',
      created_by_ai: true,
      engagement: { views: 0, likes: 0, shares: 0, comments: 0 },
      created_at: now
    }
  ],
  inbox: [
    {
      id: 'in-1',
      sender_name: 'Nguyễn Văn Anh',
      platform: 'facebook',
      avatar: '',
      message: 'Lô Hòa Xuân còn không em? Giá này có thương lượng thêm được không?',
      intent: 'thương lượng',
      status: 'pending',
      customer_id: 'c-1',
      ai_reply_suggestion: '',
      created_at: '2026-06-02T08:15:00.000Z'
    },
    {
      id: 'in-2',
      sender_name: 'Phạm Thị Bình',
      platform: 'zalo',
      avatar: '',
      message: 'Nhà phố Hòa Quý có hoàn công đầy đủ chưa? Chị muốn mở spa tầng trệt.',
      intent: 'hỏi vị trí',
      status: 'pending',
      customer_id: 'c-2',
      ai_reply_suggestion: '',
      created_at: '2026-06-02T09:45:00.000Z'
    },
    {
      id: 'in-3',
      sender_name: 'Lê Hoàng Dung',
      platform: 'website',
      avatar: '',
      message: 'Căn hộ Liên Chiểu có hỗ trợ vay ngân hàng không?',
      intent: 'hỏi giá',
      status: 'replied',
      customer_id: 'c-4',
      ai_reply_suggestion: 'Dạ căn hộ có hỗ trợ vay ngân hàng. Em gửi chị bảng chính sách thanh toán và đặt lịch xem căn mẫu nhé.',
      created_at: '2026-06-01T15:20:00.000Z'
    },
    {
      id: 'in-4',
      sender_name: 'Khách TikTok',
      platform: 'tiktok',
      avatar: '',
      message: 'Lô góc đó ở đoạn nào Hòa Xuân vậy ad?',
      intent: 'hỏi vị trí',
      status: 'pending',
      customer_id: 'c-5',
      ai_reply_suggestion: '',
      created_at: '2026-06-03T02:10:00.000Z'
    }
  ],
  automations: [
    {
      id: 'auto-1',
      name: 'Tạo nháp content khi thêm bất động sản mới',
      trigger_event: 'Khi thêm mới bất động sản',
      action_description: 'Sinh bản nháp Facebook, Zalo, TikTok và Website SEO cho sản phẩm mới.',
      status: 'active',
      last_run: '2026-06-02T07:00:00.000Z',
      run_count: 3,
      logs: ['2026-06-02T07:00:00.000Z - Đã tạo nháp content cho shophouse Sơn Trà.']
    },
    {
      id: 'auto-2',
      name: 'Đẩy lead nóng cho sale',
      trigger_event: 'Lead Score vượt mốc 80',
      action_description: 'Gắn nhãn khách VIP, tạo việc gọi lại và ưu tiên trên dashboard.',
      status: 'active',
      last_run: '2026-06-01T03:30:00.000Z',
      run_count: 5,
      logs: ['2026-06-01T03:30:00.000Z - Lead hot được chuyển vào danh sách ưu tiên.']
    },
    {
      id: 'auto-3',
      name: 'Gợi ý phản hồi inbox hỏi giá',
      trigger_event: 'Nhận comment bình luận hỏi giá',
      action_description: 'Phân loại intent và tạo câu trả lời ngắn, lịch sự, có CTA đặt lịch xem.',
      status: 'active',
      last_run: '',
      run_count: 0,
      logs: []
    },
    {
      id: 'auto-4',
      name: 'Báo cáo hiệu quả chiến dịch cuối ngày',
      trigger_event: 'Cuối ngày',
      action_description: 'Tổng hợp reach, inbox, lead nóng và đề xuất chiến dịch ngày mai.',
      status: 'inactive',
      last_run: '',
      run_count: 0,
      logs: []
    }
  ],
  settings: {
    ai_mode: process.env.DEFAULT_AI_MODE || 'auto',
    ollama_endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
    ollama_model: process.env.OLLAMA_MODEL || 'qwen3:8b',
    openai_model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    agent_tone: 'sang trọng và chuyên nghiệp'
  }
};

const assignments = {
  customers: {
    'c-1': ['u-member-a'],
    'c-2': ['u-member-a'],
    'c-3': ['u-member-b'],
    'c-4': ['u-member-a'],
    'c-5': ['u-member-b'],
    'c-6': ['u-member-b'],
    'c-7': ['u-member-a', 'u-member-b'],
    'c-8': ['u-member-a']
  },
  properties: {
    'p-1': ['u-member-a'],
    'p-2': ['u-member-a'],
    'p-3': ['u-member-b'],
    'p-4': ['u-member-a'],
    'p-5': ['u-member-b'],
    'p-6': ['u-member-a', 'u-member-b']
  },
  posts: {
    'post-1': ['u-member-a'],
    'post-2': ['u-member-a'],
    'post-3': ['u-member-b']
  },
  inbox: {
    'in-1': ['u-member-a'],
    'in-2': ['u-member-a'],
    'in-3': ['u-member-a'],
    'in-4': ['u-member-b']
  },
  automations: {
    'auto-1': ['u-member-a', 'u-member-b'],
    'auto-2': ['u-member-a', 'u-member-b'],
    'auto-3': ['u-member-a', 'u-member-b'],
    'auto-4': ['u-member-a', 'u-member-b']
  }
};

function attachAccess(collectionName, companyId = 'comp-da-nang') {
  database[collectionName] = database[collectionName].map((record) => ({
    ...record,
    company_id: companyId,
    owner_user_id: 'u-company-admin',
    assigned_member_ids: assignments[collectionName][record.id] || []
  }));
}

['customers', 'properties', 'posts', 'inbox', 'automations'].forEach((collectionName) => {
  attachAccess(collectionName);
});

if (fs.existsSync(dbPath)) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(dbPath, `${dbPath}.${timestamp}.bak`);
}

fs.writeFileSync(dbPath, JSON.stringify(database, null, 2), 'utf8');

console.log(`Seeded ${database.customers.length} customers, ${database.properties.length} properties, ${database.posts.length} posts, ${database.inbox.length} inbox messages.`);
