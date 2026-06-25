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
    subtitle: 'Sun Group · Mai Đăng Chơn · Đất nền & nhà phố Nam',
    description:
      'Khung ngân sách, rủi ro vận hành từ xa và checklist 90 ngày — tài liệu phân tích, không phải danh sách sản phẩm.',
    cta: 'Nhận báo cáo thị trường',
    type: 'report',
    icon: '📊',
  },
  {
    slug: 'top-20-co-hoi-dau-tu',
    title: '20 NHÓM CƠ HỘI ĐẦU TƯ NÊN THEO DÕI TẠI NAM ĐÀ NẴNG',
    subtitle: 'Khu vực · Loại tài sản · Ngân sách · Rủi ro',
    description:
      'Khung phân tích định hướng đầu tư theo nhóm tài sản — không phải danh sách sản phẩm đang chào bán.',
    cta: 'Nhận tài liệu phân tích',
    type: 'list',
    icon: '📋',
  },
  {
    slug: 'ban-do-dau-tu-nam-da-nang',
    title: 'BẢN ĐỒ ĐẦU TƯ NAM ĐÀ NẴNG',
    subtitle: 'Sun Group · Mai Đăng Chơn · Đất nền Nam · Hành lang công nghệ',
    description: 'Bản đồ tư duy khu vực — chỉ xem sau khi để lại thông tin liên hệ.',
    cta: 'Nhận bản đồ đầu tư',
    type: 'map',
    icon: '🗺️',
  },
];

export function getLeadMagnet(slug: string) {
  return LEAD_MAGNETS.find(m => m.slug === slug);
}
