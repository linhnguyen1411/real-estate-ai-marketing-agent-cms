import { PageType } from '../types/PageType';

/**
 * Structural section labels for SEO templates (SSOT).
 * Templates must not invent marketing copy — they look up these keys.
 */
export const TEMPLATE_SECTIONS = {
  shared: {
    overview: 'Tổng quan',
    faq: 'Câu hỏi thường gặp',
    related: 'Trang liên quan',
    breadcrumb: 'Đường dẫn',
    keywords: 'Cụm từ khóa',
    cta: 'Tư vấn',
    entity: 'Thực thể',
    media: 'Tài liệu / media',
  },
  project: {
    highlights: 'Điểm nổi bật',
    towers: 'Tòa / phân khu',
    nearby: 'Dự án liên quan',
  },
  financial: {
    analysis: 'Phân tích đầu tư',
    roi: 'ROI / hiệu suất',
    payment: 'Tiến độ thanh toán',
    loan: 'Chính sách vay',
    cashflow: 'Dòng tiền',
  },
  comparison: {
    table: 'Bảng so sánh',
    pros: 'Ưu điểm',
    cons: 'Nhược điểm',
    recommendation: 'Khuyến nghị',
    investor: 'Nhà đầu tư phù hợp',
    projects: 'Dự án liên quan',
  },
  legal: {
    status: 'Tình trạng pháp lý',
    ownership: 'Hình thức sở hữu',
    construction: 'Tiến độ xây dựng',
    planning: 'Quy hoạch',
    timeline: 'Mốc thời gian',
  },
  location: {
    infrastructure: 'Hạ tầng',
    population: 'Dân cư',
    commercial: 'Tiềm năng thương mại',
    connectivity: 'Kết nối',
    nearby: 'Dự án lân cận',
  },
  collection: {
    items: 'Danh mục',
    filters: 'Phân loại',
    areas: 'Khu vực',
    developers: 'Chủ đầu tư / thương hiệu',
  },
} as const;

export type TemplateKind =
  | 'project'
  | 'financial'
  | 'comparison'
  | 'legal'
  | 'location'
  | 'collection';

export function templateKindForPageType(pageType: PageType): TemplateKind | null {
  switch (pageType) {
    case PageType.PROJECT:
      return 'project';
    case PageType.FINANCIAL:
      return 'financial';
    case PageType.COMPARISON:
      return 'comparison';
    case PageType.LEGAL:
      return 'legal';
    case PageType.LOCATION:
      return 'location';
    case PageType.CATALOG:
      return 'collection';
    default:
      return null;
  }
}
