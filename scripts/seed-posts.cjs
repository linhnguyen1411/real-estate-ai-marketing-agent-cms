const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = path.join(__dirname, '..');
const sqlitePath = path.join(root, 'data', 'cms.sqlite');
const now = new Date().toISOString();

const companyId = 'comp-da-nang';
const ownerUserId = 'u-company-admin';

const seedPosts = [
  {
    id: 'post-1',
    title: 'BĐS Sun Group Đà Nẵng — Căn hộ cao cấp giá gốc 2026',
    platform: 'facebook',
    content: '🔥 Hàng mới Sun Group Nam Đà Nẵng: căn hộ cao cấp, pháp lý rõ, hình ảnh thật 100%.\n\n✅ Vị trí kết nối trung tâm\n✅ Giá gốc từ chủ đầu tư\n✅ Hỗ trợ vay ngân hàng\n\n📞 Inbox hoặc Zalo 0905 777 594 để nhận bảng giá và lịch xem thực tế.',
    status: 'published',
    property_id: '',
    property_title: '',
    seo_title: 'BĐS Sun Group Đà Nẵng | Căn Hộ Cao Cấp Giá Gốc',
    meta_description: 'Căn hộ Sun Group Đà Nẵng pháp lý rõ, giá gốc 2026. Liên hệ Estoria tư vấn và đặt lịch xem.',
    keywords: ['bất động sản đà nẵng', 'sun group', 'căn hộ cao cấp'],
    hashtags: ['#BDS', '#DaNang', '#SunGroup', '#Estoria'],
    created_by_ai: false,
    engagement: { views: 18420, likes: 412, shares: 56, comments: 68 },
    created_at: '2026-05-18T08:00:00.000Z'
  },
  {
    id: 'post-2',
    title: 'Shophouse kinh doanh Nam Đà Nẵng — dòng tiền ổn định',
    platform: 'zalo',
    content: 'Shophouse Nam Đà Nẵng mặt tiền thương mại, phù hợp cafe, showroom, văn phòng.\n\nDiện tích linh hoạt, khu dân cư hiện hữu, tiềm năng cho thuê cao.\n\nNhắn Zalo để nhận file PDF phân tích lợi suất.',
    status: 'published',
    property_id: '',
    property_title: '',
    created_by_ai: true,
    engagement: { views: 5320, likes: 98, shares: 21, comments: 15 },
    created_at: '2026-05-20T10:30:00.000Z'
  },
  {
    id: 'post-3',
    title: 'TikTok: Tour nhanh căn mẫu view biển Đà Nẵng',
    platform: 'tiktok',
    content: 'Hook 3 giây: "Căn này view biển mà giá chỉ từ X tỷ?"\n\nCắt cảnh: phòng khách → ban công → hồ bơi → map vị trí.\n\nCTA cuối: "Comment S để nhận bảng giá full".',
    status: 'draft',
    property_id: '',
    property_title: '',
    created_by_ai: true,
    engagement: { views: 0, likes: 0, shares: 0, comments: 0 },
    created_at: '2026-05-22T14:00:00.000Z'
  },
  {
    id: 'post-4',
    title: 'Đất nền Hòa Xuân — lô góc đường 7.5m',
    platform: 'facebook',
    content: 'Lô góc Hòa Xuân 108m², hướng Đông Nam, sát công viên, dân cư hiện hữu.\n\nPhù hợp xây nhà ở ngay hoặc giữ tài sản dài hạn.\n\nGiá tốt tháng 5 — liên hệ xem sổ và đi thực địa.',
    status: 'scheduled',
    scheduled_at: '2026-05-25T07:00:00.000Z',
    property_id: '',
    property_title: '',
    created_by_ai: false,
    engagement: { views: 890, likes: 24, shares: 3, comments: 5 },
    created_at: '2026-05-21T09:00:00.000Z'
  },
  {
    id: 'post-5',
    title: 'Website SEO: Căn hộ Liên Chiểu 2PN gia đình trẻ',
    platform: 'website',
    content: 'Căn hộ 2 phòng ngủ Liên Chiểu, thiết kế sáng, gần trường đại học và khu công nghệ cao.\n\nChính sách thanh toán linh hoạt, hỗ trợ vay ngân hàng uy tín.\n\nEstoria đồng hành từ tư vấn đến bàn giao.',
    status: 'published',
    property_id: '',
    property_title: '',
    seo_title: 'Căn Hộ 2PN Liên Chiểu Đà Nẵng | Estoria',
    meta_description: 'Căn hộ 2 phòng ngủ Liên Chiểu, giá tốt, pháp lý minh bạch. Tư vấn miễn phí qua Estoria.',
    keywords: ['căn hộ liên chiểu', 'đà nẵng', '2 phòng ngủ'],
    hashtags: ['#CanHo', '#LienChieu', '#DaNang'],
    created_by_ai: true,
    engagement: { views: 3210, likes: 45, shares: 12, comments: 8 },
    created_at: '2026-05-19T11:00:00.000Z'
  },
  {
    id: 'post-6',
    title: 'Zalo broadcast: Bảng giá shophouse Sơn Trà tuần này',
    platform: 'zalo',
    content: 'Tuần này Estoria cập nhật 3 shophouse Sơn Trà gần biển, pháp lý sạch, mặt tiền đẹp.\n\nGửi "SHOP" để nhận danh sách kèm video thực tế.',
    status: 'scheduled',
    scheduled_at: '2026-05-24T08:00:00.000Z',
    property_id: '',
    property_title: '',
    created_by_ai: false,
    engagement: { views: 1200, likes: 31, shares: 8, comments: 4 },
    created_at: '2026-05-23T06:00:00.000Z'
  }
];

const assignments = {
  'post-1': ['u-member-a'],
  'post-2': ['u-member-a'],
  'post-3': ['u-member-b'],
  'post-4': ['u-member-a'],
  'post-5': ['u-member-b'],
  'post-6': ['u-member-a', 'u-member-b']
};

if (!fs.existsSync(sqlitePath)) {
  console.error('Không tìm thấy data/cms.sqlite. Chạy npm run seed trước.');
  process.exit(1);
}

const db = new Database(sqlitePath);
const existing = db.prepare("SELECT count(*) as c FROM cms_records WHERE collection = 'posts'").get().c;

const upsert = db.prepare(`
  INSERT INTO cms_records (collection, id, company_id, owner_user_id, sale_status, status, data, created_at, updated_at)
  VALUES ('posts', ?, ?, ?, NULL, ?, ?, ?, ?)
  ON CONFLICT(collection, id) DO UPDATE SET
    company_id = excluded.company_id,
    owner_user_id = excluded.owner_user_id,
    status = excluded.status,
    data = excluded.data,
    updated_at = excluded.updated_at
`);

const deleteFts = db.prepare("DELETE FROM cms_records_fts WHERE collection = 'posts' AND id = ?");
const insertFts = db.prepare("INSERT INTO cms_records_fts (collection, id, search_text) VALUES ('posts', ?, ?)");

function buildSearchText(record) {
  return [
    record.title,
    record.content,
    record.property_title,
    record.platform,
    record.status,
    ...(record.keywords || []),
    ...(record.hashtags || [])
  ].filter(Boolean).join(' ');
}

const seed = db.transaction(() => {
  seedPosts.forEach((post) => {
    const record = {
      ...post,
      company_id: companyId,
      owner_user_id: ownerUserId,
      assigned_member_ids: assignments[post.id] || ['u-member-a']
    };
    upsert.run(
      record.id,
      record.company_id,
      record.owner_user_id,
      record.status,
      JSON.stringify(record),
      record.created_at,
      now
    );
    deleteFts.run(record.id);
    insertFts.run(record.id, buildSearchText(record));
  });
});

seed();
const total = db.prepare("SELECT count(*) as c FROM cms_records WHERE collection = 'posts'").get().c;
db.close();

console.log(`Đã seed ${seedPosts.length} bài viết (trước đó: ${existing}, hiện tại: ${total}).`);
seedPosts.forEach((post) => console.log(`  - [${post.platform}] ${post.title} (${post.status})`));
