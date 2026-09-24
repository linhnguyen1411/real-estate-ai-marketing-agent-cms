import { Property } from '../types';
import { resolvePropertyItemTitle } from '../seo/utils/buildPropertyItemTitle';

export const SITE_BRAND = 'House & Life';

export const DEFAULT_SEO_TITLE = 'House & Life | BĐS Đà Nẵng - Nhà Phố, Đất Nền Nam Hòa Xuân, Căn Hộ & Cho Thuê';

export const DEFAULT_SEO_DESCRIPTION =
  'House & Life — Vững tâm an cư, kiến tạo tương lai. Chuyên mua bán nhà phố, đất nền Nam Hòa Xuân, bán và cho thuê căn hộ tại Đà Nẵng. Pháp lý rõ, hỗ trợ xem nhà đất 24/7.';

export const DEFAULT_SEO_KEYWORDS = [
  'nhà phố đà nẵng',
  'đất nền nam hòa xuân',
  'bán nhà phố đà nẵng',
  'bán đất nam hòa xuân',
  'bán căn hộ đà nẵng',
  'cho thuê căn hộ đà nẵng',
  'căn hộ cao cấp đà nẵng',
  'bất động sản đà nẵng',
  'bds sun group đà nẵng',
];

export const SUN_FLAGSHIP_PROJECTS = [
  'Sun Cosmo Residence',
  'Sun Ponte',
  'Sun Symphony'
];

function compactSeoText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function limitSeoTitle(value: string, maxLength = 65) {
  const cleanValue = compactSeoText(value);
  return cleanValue.length <= maxLength
    ? cleanValue
    : `${cleanValue.slice(0, maxLength - 3).trim()}...`;
}

export function truncateSeoText(value: string, maxLength = 160) {
  const cleanValue = compactSeoText(value);
  return cleanValue.length <= maxLength
    ? cleanValue
    : `${cleanValue.slice(0, maxLength - 3).trim()}...`;
}

function getPropertyTypeLabel(property: Property) {
  return compactSeoText(property.type || 'bất động sản');
}

function isLandProperty(property: Property) {
  const haystack = `${property.title} ${property.type} ${property.location}`.toLowerCase();
  return /đất|dat|hòa xuân|hoa xuan|hòa khương|hoa khuong|ngũ hành sơn/.test(haystack);
}

function isTownhouseProperty(property: Property) {
  const haystack = `${property.title} ${property.type} ${property.location}`.toLowerCase();
  return /nhà phố|nha pho|nhà ở|nha o|shophouse|nhà kiệt|mặt tiền/.test(haystack);
}

function isSunGroupProperty(property: Property) {
  const haystack = `${property.title} ${property.type} ${property.location}`.toLowerCase();
  return /sun|symphony|cosmo|ponte|s light/.test(haystack);
}

export function buildPropertySeoTitle(property: Property) {
  const title = resolvePropertyItemTitle({
    title: property.title,
    type: property.type,
    project_name: property.project_name,
    location: property.location,
    selling_points: property.selling_points,
  });
  const type = getPropertyTypeLabel(property).toLowerCase();

  if (isLandProperty(property)) {
    return limitSeoTitle(`${title} | Đất Nền Đà Nẵng | House & Life`);
  }
  if (isTownhouseProperty(property)) {
    return limitSeoTitle(`${title} | Nhà Phố Đà Nẵng | House & Life`);
  }
  if (type.includes('căn') || type.includes('can')) {
    return limitSeoTitle(`${title} | Căn Hộ Đà Nẵng | House & Life`);
  }
  if (isSunGroupProperty(property)) {
    return limitSeoTitle(`${title} | BĐS Sun Group Đà Nẵng | House & Life`);
  }

  return limitSeoTitle(`${title} | BĐS Đà Nẵng | ${SITE_BRAND}`);
}

export function buildPropertySeoDescription(property: Property) {
  const location = compactSeoText(property.location || 'Đà Nẵng');
  const type = getPropertyTypeLabel(property);
  const legal = compactSeoText(property.legal_status || 'pháp lý rõ');
  const price = property.price ? `${property.price} tỷ` : 'giá tốt';
  const area = property.area ? `${property.area}m2` : '';

  if (isLandProperty(property)) {
    return truncateSeoText(
      `Đất nền tại ${location}${area ? `, ${area}` : ''}, giá ${price}, ${legal}. House & Life hỗ trợ xem đất thực tế và kiểm tra quy hoạch 24/7.`
    );
  }

  if (isTownhouseProperty(property)) {
    return truncateSeoText(
      `Nhà phố tại ${location}${area ? `, ${area}` : ''}, giá ${price}, ${legal}. Thông tin chính chủ, hỗ trợ đàm phán và pháp lý qua ${SITE_BRAND}.`
    );
  }

  if (isSunGroupProperty(property)) {
    return truncateSeoText(
      `${type} Sun Group tại ${location}${area ? `, ${area}` : ''}, giá ${price}, ${legal}. Giỏ hàng tiềm năng, tư vấn chi tiết cùng ${SITE_BRAND}.`
    );
  }

  return truncateSeoText(
    `Bán ${type.toLowerCase()} tại ${location}${area ? `, ${area}` : ''}, giá ${price}, ${legal}. Liên hệ ${SITE_BRAND} tư vấn và đặt lịch xem thực tế 24/7.`
  );
}

export function buildPropertySeoKeywords(property: Property) {
  const location = compactSeoText(property.location || 'Đà Nẵng');
  const primaryLocation = location.split(',')[0] || 'Đà Nẵng';
  const type = getPropertyTypeLabel(property).toLowerCase();
  const keywords = new Set<string>(DEFAULT_SEO_KEYWORDS);

  if (isLandProperty(property)) {
    keywords.add('đất ngộp đà nẵng');
    keywords.add(`mua đất cắt lỗ ${primaryLocation.toLowerCase()}`);
    keywords.add(`đất ${primaryLocation.toLowerCase()} giá sập hầm`);
  }

  if (isSunGroupProperty(property)) {
    keywords.add('căn hộ sun group đà nẵng');
    keywords.add('quỹ căn ngoại giao sun group');
    if (type.includes('shophouse')) {
      keywords.add('shophouse sun group đà nẵng');
    }
    if (type.includes('biệt thự') || type.includes('biet thu')) {
      keywords.add('mua biệt thự sun group đà nẵng');
    }
  }

  keywords.add(`${type} ${primaryLocation.toLowerCase()}`);
  keywords.add(`bất động sản ${primaryLocation.toLowerCase()}`);

  return Array.from(keywords).map(compactSeoText).filter(Boolean);
}

export function buildPropertySeo(property: Property) {
  return {
    title: buildPropertySeoTitle(property),
    meta_description: buildPropertySeoDescription(property),
    keywords: buildPropertySeoKeywords(property),
    hashtags: [] as string[]
  };
}

export function getPropertyImageAlt(property: Property, index = 0) {
  const location = property.location || 'Đà Nẵng';
  const type = String(property.type || 'bất động sản');
  const keywordSuffix = isLandProperty(property)
    ? 'đất ngộp Đà Nẵng'
    : isSunGroupProperty(property)
      ? 'Sun Group Đà Nẵng'
      : 'BĐS Đà Nẵng';

  if (index === 0) {
    return `${type} ${property.title} tại ${location} - ${keywordSuffix}`;
  }

  return `${property.title} hình ${index + 1} tại ${location}`;
}
