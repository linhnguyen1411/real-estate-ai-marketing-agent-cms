import type { LeadMagnetSlug } from '../types/investorLead';

export interface LeadMagnetDefinition {
  slug: LeadMagnetSlug;
  title: string;
  subtitle: string;
  description: string;
  cta: string;
  type: 'report' | 'list' | 'map';
  icon: string;
}

export const LEAD_MAGNETS: LeadMagnetDefinition[] = [
  {
    slug: 'bao-cao-nam-da-nang-2026',
    title: 'BÁO CÁO THỊ TRƯỜNG NAM ĐÀ NẴNG 2026',
    subtitle: 'FPT City · Làng Đại Học · Mai Đăng Chơn · Sun Group',
    description:
      'Phân tích căn hộ, đất nền, xu hướng giá và cơ hội cho nhà đầu tư Hà Nội. PDF/HTML độc quyền.',
    cta: 'Nhận báo cáo thị trường',
    type: 'report',
    icon: '📊',
  },
  {
    slug: 'top-20-co-hoi-dau-tu',
    title: 'TOP 20 CƠ HỘI ĐẦU TƯ NAM ĐÀ NẴNG',
    subtitle: 'Giá · Vị trí · Tiềm năng · Đánh giá',
    description: 'Danh sách lọc theo pháp lý, thanh khoản và biên lợi nhuận dự kiến.',
    cta: 'Nhận danh sách cơ hội đầu tư',
    type: 'list',
    icon: '🏆',
  },
  {
    slug: 'ban-do-dau-tu-nam-da-nang',
    title: 'BẢN ĐỒ ĐẦU TƯ NAM ĐÀ NẴNG',
    subtitle: 'FPT · Sun · Làng Đại Học · Biển · Sân bay · KCN',
    description: 'Bản đồ tư duy khu vực — chỉ xem sau khi để lại thông tin liên hệ.',
    cta: 'Nhận bản đồ đầu tư',
    type: 'map',
    icon: '🗺️',
  },
];

export const TOP_20_OPPORTUNITIES = [
  { rank: 1, name: 'FPT City — Lô đất ven công viên', area: 'Nam Đà Nẵng', price: '4.2 tỷ', potential: 'Cao', rating: 'A' },
  { rank: 2, name: 'Sun Cosmo — Căn 2PN view biển', area: 'Sơn Trà', price: '3.8 tỷ', potential: 'Cao', rating: 'A' },
  { rank: 3, name: 'Mai Đăng Chơn — Đất nền 100m²', area: 'Nam Đà Nẵng', price: '2.9 tỷ', potential: 'TB+', rating: 'B+' },
  { rank: 4, name: 'Làng Đại Học — Shophouse', area: 'Hòa Quý', price: '6.5 tỷ', potential: 'Cao', rating: 'A-' },
  { rank: 5, name: 'Sun Symphony — Studio cho thuê', area: 'Ngũ Hành Sơn', price: '2.1 tỷ', potential: 'TB+', rating: 'B+' },
  { rank: 6, name: 'FPT City — Căn hộ 1PN', area: 'Nam Đà Nẵng', price: '1.9 tỷ', potential: 'TB', rating: 'B' },
  { rank: 7, name: 'Nam Đà Nẵng — Đất ven sông', area: 'Hòa Xuân', price: '3.2 tỷ', potential: 'Cao', rating: 'A-' },
  { rank: 8, name: 'Căn hộ cao cấp — View sông Hàn', area: 'Hải Châu', price: '5.5 tỷ', potential: 'TB+', rating: 'B+' },
  { rank: 9, name: 'Đất nền KCN — Hòa Nhơn', area: 'Hòa Vang', price: '1.5 tỷ', potential: 'TB', rating: 'B' },
  { rank: 10, name: 'Nhà phố — Mặt tiền kinh doanh', area: 'Cẩm Lệ', price: '8 tỷ', potential: 'Cao', rating: 'A' },
];

export const MARKET_REPORT_SECTIONS = [
  {
    title: 'Tổng quan Nam Đà Nẵng 2026',
    body: 'Nam Đà Nẵng tiếp tục là hướng mở rộng đô thị với FPT City, Mai Đăng Chơn và hành lang ven sông. Dòng vốn từ Hà Nội tăng trong các phân khúc đất nền có pháp lý rõ và căn hộ cho thuê đã bàn giao.',
  },
  {
    title: 'FPT City',
    body: 'Hạ tầng đồng bộ, cộng đồng cư dân ổn định. Đất nền phù hợp tích lũy 3–5 năm; căn hộ phù hợp dòng tiền trung hạn.',
  },
  {
    title: 'Sun Group (Cosmo & Symphony)',
    body: 'Thanh khoản thị trường thứ cấp tốt hơn nhiều khu vực. Yield cho thuê 4–7%/năm tùy vị trí và nội thất.',
  },
  {
    title: 'Làng Đại Học & Mai Đăng Chơn',
    body: 'Giá vào hợp lý hơn trung tâm. Rủi ro chính: tiến độ hạ tầng — cần khảo sát trực tiếp.',
  },
  {
    title: 'Căn hộ vs Đất nền',
    body: 'Căn hộ: thanh khoản cao, dòng tiền nhanh. Đất nền: biên lợi nhuận lớn hơn nhưng cần thời gian nắm giữ và kiểm tra quy hoạch kỹ.',
  },
];

export const INVESTMENT_MAP_ZONES = [
  { id: 'fpt', label: 'FPT City', x: 35, y: 55, color: '#2563eb' },
  { id: 'sun', label: 'Sun Group', x: 70, y: 30, color: '#e11d48' },
  { id: 'university', label: 'Làng Đại Học', x: 25, y: 40, color: '#7c3aed' },
  { id: 'beach', label: 'Ven biển', x: 80, y: 25, color: '#0891b2' },
  { id: 'airport', label: 'Sân bay', x: 15, y: 20, color: '#64748b' },
  { id: 'kcn', label: 'KCN', x: 20, y: 75, color: '#ca8a04' },
  { id: 'mai-dang-chon', label: 'Mai Đăng Chơn', x: 45, y: 65, color: '#059669' },
];

export const SOCIAL_PROOF_CASES = [
  {
    name: 'Anh Minh — Hà Nội',
    story: 'Mua đất FPT City năm 2023',
    buyPrice: '3.5 tỷ',
    currentPrice: '5.2 tỷ',
    profit: '48%',
    quote: 'Estoria hỗ trợ khảo sát 2 ngày, checklist pháp lý rõ. Tôi mua từ xa an tâm.',
  },
  {
    name: 'Chị Lan — Hải Phòng',
    story: 'Căn Sun Cosmo cho thuê',
    buyPrice: '2.8 tỷ',
    currentPrice: '3.4 tỷ',
    profit: '21% + dòng tiền',
    quote: 'Yield thực ~5.5%/năm sau phí quản lý. Đội ngũ hỗ trợ setup nội thất.',
  },
  {
    name: 'Anh Tuấn — Hà Nội',
    story: 'Đất nền Nam Đà Nẵng',
    buyPrice: '2.2 tỷ',
    currentPrice: '3.1 tỷ',
    profit: '41%',
    quote: 'Nhận báo cáo thị trường trước, sau đó được lọc 5 lô phù hợp ngân sách.',
  },
];

export function getLeadMagnet(slug: string) {
  return LEAD_MAGNETS.find(m => m.slug === slug);
}
