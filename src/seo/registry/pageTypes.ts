export { PageType } from '../types/PageType';
export type { SchemaType } from '../types/SeoMetadata';

/** Human-readable labels for docs / admin tooling. */
export const PAGE_TYPE_LABELS: Record<string, string> = {
  HOME: 'Trang chủ',
  CATALOG: 'Danh mục / listing hub',
  PROJECT: 'Dự án / portfolio',
  PROPERTY: 'Chi tiết sản phẩm',
  ARTICLE: 'Bài viết / landing',
  COMPARISON: 'So sánh',
  FINANCIAL: 'Tài chính / dòng tiền',
  LEGAL: 'Pháp lý / chính sách',
  LOCATION: 'Khu vực / location hub',
  SEARCH: 'Tìm kiếm',
  '404': 'Không tìm thấy',
};
