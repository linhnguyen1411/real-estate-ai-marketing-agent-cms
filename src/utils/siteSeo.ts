import { Property } from '../types';

export const SITE_BRAND = 'Bdsdanang.site';

export const DEFAULT_SEO_TITLE = `${SITE_BRAND} | Căn Hộ Sun Group & Quỹ Đất Ngộp Giá Sập Hầm`;

export const DEFAULT_SEO_DESCRIPTION =
  'Chuyên giỏ hàng ngoại giao căn hộ, shophouse Sun Group tại Đà Nẵng và nguồn đất ngộp cắt lỗ sâu chính chủ. Hỗ trợ nhà đầu tư HN & SG 24/7.';

export const DEFAULT_SEO_KEYWORDS = [
  'căn hộ sun group đà nẵng',
  'shophouse sun group đà nẵng',
  'mua biệt thự sun group đà nẵng',
  'quỹ căn ngoại giao sun group',
  'đất ngộp đà nẵng',
  'mua đất cắt lỗ hòa xuân',
  'đất hòa khương giá sập hầm',
  'bds sun group đà nẵng'
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
  return /đất|dat|ngộp|ngop|cắt lỗ|cat lo|hòa xuân|hoa xuan|hòa khương|hoa khuong/.test(haystack);
}

function isSunGroupProperty(property: Property) {
  const haystack = `${property.title} ${property.type} ${property.location}`.toLowerCase();
  return /sun|căn hộ|can ho|shophouse|biệt thự|biet thu/.test(haystack);
}

export function buildPropertySeoTitle(property: Property) {
  const title = compactSeoText(property.title);
  const type = getPropertyTypeLabel(property).toLowerCase();

  if (isLandProperty(property)) {
    return limitSeoTitle(`${title} | Đất Ngộp Giá Sập Hầm Đà Nẵng`);
  }
  if (type.includes('căn') || type.includes('can')) {
    return limitSeoTitle(`${title} | Căn Hộ Sun Group Đà Nẵng`);
  }
  if (type.includes('shophouse')) {
    return limitSeoTitle(`${title} | Shophouse Sun Group Đà Nẵng`);
  }
  if (type.includes('biệt thự') || type.includes('biet thu')) {
    return limitSeoTitle(`${title} | Biệt Thự Sun Group Đà Nẵng`);
  }
  if (isSunGroupProperty(property)) {
    return limitSeoTitle(`${title} | BĐS Sun Group Đà Nẵng`);
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
      `Đất ngộp tại ${location}${area ? `, ${area}` : ''}, giá ${price}, ${legal}. Nguồn chính chủ, hỗ trợ xem đất 24/7 qua ${SITE_BRAND}.`
    );
  }

  if (isSunGroupProperty(property)) {
    return truncateSeoText(
      `${type} Sun Group tại ${location}${area ? `, ${area}` : ''}, giá ${price}, ${legal}. Quỹ căn ngoại giao, tư vấn nhà đầu tư HN & SG qua ${SITE_BRAND}.`
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
