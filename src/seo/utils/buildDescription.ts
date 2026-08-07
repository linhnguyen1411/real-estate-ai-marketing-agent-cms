import { PageType } from '../types/PageType';

export type BuildDescriptionOptions = {
  /** Optional max length — when set, truncates with `...` (existing SSR truncateMeta behavior). */
  maxLength?: number;
  /** Optional intent-driven description body when registry string is empty. */
  pattern?: IntentDescriptionPattern;
};

export type IntentDescriptionPattern = {
  pageType: PageType;
  primaryKeyword: string;
  /** Short investor angle (cash flow, legal, ROI, inventory…). */
  angle?: string;
  project?: string;
  year?: number;
};

/**
 * Intent-driven meta description skeletons — keep under ~155 chars when possible.
 */
export function buildIntentDescription(pattern: IntentDescriptionPattern): string {
  const primary = String(pattern.primaryKeyword || '').trim();
  if (!primary) return '';
  const year = pattern.year ?? new Date().getFullYear();
  const angle = String(pattern.angle || '').trim();
  const project = String(pattern.project || '').trim();
  const focus = angle || primary;

  switch (pattern.pageType) {
    case PageType.FINANCIAL:
      return `${capitalize(primary)}: dữ liệu giá, dòng tiền và khung thẩm định${project ? ` ${project}` : ''} cập nhật ${year}. Dành cho nhà đầu tư cần số liệu trước khi xuống tiền.`;
    case PageType.COMPARISON:
      return `${capitalize(primary)} — so sánh giá, yield, pháp lý và thanh khoản để chọn tài sản phù hợp khẩu vị rủi ro.`;
    case PageType.LEGAL:
      return `${capitalize(primary)} trên BDSDanang.site — thông tin tham khảo cho nhà đầu tư khi sử dụng dịch vụ tư vấn.`;
    case PageType.LOCATION:
      return `${capitalize(primary)}: quy hoạch, xu hướng giá và tiềm năng khu vực${project ? ` ${project}` : ''}. Góc nhìn thẩm định cho nhà đầu tư trung–dài hạn.`;
    case PageType.CATALOG:
      return `${capitalize(primary)} — giỏ hàng cập nhật, lọc theo giá, pháp lý và tiềm năng sinh lời. ${focus}.`;
    case PageType.PROJECT:
      return `${capitalize(primary)}${project ? ` tại ${project}` : ''}: phân tích đầu tư, chính sách thanh toán, tiến độ và rủi ro pháp lý.`;
    default:
      return `${capitalize(primary)}. ${focus}. Cập nhật ${year} cho nhà đầu tư Đà Nẵng.`;
  }
}

/**
 * Single entry for meta description generation.
 * Default: return trimmed description unchanged.
 */
export function buildDescription(
  description: string,
  options: BuildDescriptionOptions = {},
): string {
  const fromPattern = options.pattern ? buildIntentDescription(options.pattern) : '';
  const cleaned = String(fromPattern || description || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const maxLength = options.maxLength;
  if (maxLength == null || cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
