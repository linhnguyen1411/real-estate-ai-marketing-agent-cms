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
    title: 'BẢN ĐỒ CƠ HỘI ĐẦU TƯ BĐS ĐÀ NẴNG',
    subtitle: 'Sổ tay đầu tư · Căn hộ · Đất · Nhà phố · Động lực thị trường',
    description:
      'Sổ tay đầu tư theo chương: căn hộ Sun Group, đất nền Nam, nhà phố và động lực thị trường — không phải danh sách sản phẩm chào bán.',
    cta: 'Nhận bản đồ cơ hội đầu tư',
    type: 'list',
    icon: '📋',
  },
];

export function getLeadMagnet(slug: string) {
  return LEAD_MAGNETS.find(m => m.slug === slug);
}
