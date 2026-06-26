export interface ProjectGroup {
  zone: string;
  label: string;
  projects: string[];
}

export const MARKET_ZONE_OPTIONS = [
  { value: '', label: '— Chọn khu vực —' },
  { value: 'nam-da-nang', label: 'BĐS Nam Đà Nẵng' },
  { value: 'trung-tam', label: 'Trung tâm Đà Nẵng' },
  { value: 'ven-bien', label: 'Ven biển / Non Nước' },
  { value: 'fpt-city', label: 'FPT City & phía Tây' },
  { value: 'khac', label: 'Khu vực khác' },
];

export const PROPERTY_PROJECT_GROUPS: ProjectGroup[] = [
  {
    zone: 'can-ho-sun',
    label: 'Căn hộ Sun Group & cao cấp',
    projects: [
      'S Light Tower',
      'Sun Symphony',
      'Sun Cosmo',
      'Sun FourS',
      'Sun Spana',
      'Sun Cora',
      'Ariyana Centre Point',
      'Monarchy',
      'Regal Pavilion',
      'Căn hộ khác',
    ],
  },
  {
    zone: 'nha-pho',
    label: 'Nhà phố / Shophouse',
    projects: [
      'Nhà phố trung tâm',
      'Shophouse kinh doanh',
      'Nhà phố Nam Đà Nẵng',
      'Nhà phố khác',
    ],
  },
  {
    zone: 'nam-da-nang',
    label: 'BĐS Nam Đà Nẵng',
    projects: [
      'Mai Đăng Chơn',
      'Hòa Xuân',
      'Điện Ngọc',
      'Làng Đại học',
      'Nam Hòa Xuân',
      'Khu vực ven sông Nam',
      'Khác (Nam Đà Nẵng)',
    ],
  },
  {
    zone: 'dat-nen',
    label: 'Đất nền',
    projects: [
      'Đất nền Nam Đà Nẵng',
      'Đất nền FPT City',
      'Đất nền ven biển',
      'Đất nền khác',
    ],
  },
];

/** Legacy labels → tên dự án chuẩn (Sun Group ≠ FPT City). */
export const PROJECT_NAME_ALIASES: Record<string, string> = {
  'FPT City / S-Light': 'S Light Tower',
  'FPT City / S Light': 'S Light Tower',
  'Four Tower': 'Sun FourS',
};

export function normalizeProjectName(name?: string): string | undefined {
  if (!name?.trim()) return undefined;
  const trimmed = name.trim();
  return PROJECT_NAME_ALIASES[trimmed] || trimmed;
}

export function getAllProjectNames() {
  return PROPERTY_PROJECT_GROUPS.flatMap(group => group.projects);
}

/** Thứ tự ưu tiên thẻ "Danh sách theo dự án" trên trang công khai. */
export const DEFAULT_PROJECT_DISPLAY_ORDER = [
  'Shophouse kinh doanh',
  'Sun Symphony',
  'S Light Tower',
  'Nam Hòa Xuân',
  'Mai Đăng Chơn',
  'Hòa Xuân',
  'Tây Bắc Đà Nẵng',
  'Khác (Nam Đà Nẵng)',
  'Nhà phố trung tâm',
  'Nhà phố Nam Đà Nẵng',
  'Sun Cosmo',
  'Sun FourS',
  'Sun Spana',
  'Sun Cora',
  'Ariyana Centre Point',
  'Monarchy',
  'Regal Pavilion',
  'Điện Ngọc',
  'Làng Đại học',
  'Khu vực ven sông Nam',
  'Đất nền Nam Đà Nẵng',
  'Đất nền FPT City',
  'Đất nền ven biển',
  'Căn hộ khác',
  'Nhà phố khác',
  'Đất nền khác',
];

export type ProjectCatalogSettings = {
  project_groups?: ProjectGroup[];
  project_display_order?: string[];
};

export function getEffectiveProjectGroups(settings?: ProjectCatalogSettings): ProjectGroup[] {
  if (settings?.project_groups?.length) return settings.project_groups;
  return PROPERTY_PROJECT_GROUPS;
}

export function getEffectiveProjectDisplayOrder(settings?: ProjectCatalogSettings): string[] {
  if (settings?.project_display_order?.length) return settings.project_display_order;
  return DEFAULT_PROJECT_DISPLAY_ORDER;
}

export function getAllProjectNamesFromCatalog(settings?: ProjectCatalogSettings): string[] {
  return getEffectiveProjectGroups(settings).flatMap(group => group.projects);
}

function projectDisplayRank(name: string, order: string[]): number {
  const normalized = name.trim().toLowerCase();
  const exact = order.findIndex(item => item.trim().toLowerCase() === normalized);
  if (exact >= 0) return exact;
  if (/shophouse|nhà phố thương mại/i.test(name)) {
    const sh = order.findIndex(item => /shophouse/i.test(item));
    if (sh >= 0) return sh;
  }
  if (/sun symphony/i.test(name)) {
    const ss = order.findIndex(item => /sun symphony/i.test(item));
    if (ss >= 0) return ss;
  }
  if (/s[\s-]?light/i.test(name)) {
    const sl = order.findIndex(item => /s[\s-]?light/i.test(item));
    if (sl >= 0) return sl;
  }
  if (/nam hòa xuân|nam hoa xuan/i.test(name)) {
    const nhx = order.findIndex(item => /nam hòa xuân|nam hoa xuan/i.test(item));
    if (nhx >= 0) return nhx;
  }
  return 9999;
}

export function compareProjectDisplayOrder(
  a: string,
  b: string,
  order: string[] = DEFAULT_PROJECT_DISPLAY_ORDER,
) {
  const ra = projectDisplayRank(a, order);
  const rb = projectDisplayRank(b, order);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, 'vi');
}

export function sortProjectNames(names: string[], order?: string[]) {
  const list = order?.length ? order : DEFAULT_PROJECT_DISPLAY_ORDER;
  return [...names].sort((a, b) => compareProjectDisplayOrder(a, b, list));
}

export function sortProjectEntries<T>(entries: [string, T][], order?: string[]) {
  const list = order?.length ? order : DEFAULT_PROJECT_DISPLAY_ORDER;
  return [...entries].sort((a, b) => compareProjectDisplayOrder(a[0], b[0], list));
}

export function matchMarketZone(property: { market_zone?: string; location?: string; project_name?: string }, zone: string) {
  if (!zone) return true;
  if (property.market_zone === zone) return true;
  const location = String(property.location || '').toLowerCase();
  const project = String(property.project_name || '').toLowerCase();
  if (zone === 'nam-da-nang') {
    return /nam|hòa xuân|hoa xuan|điện ngọc|dien ngoc|mai đăng|mai dang|làng đại học|lang dai hoc/.test(`${location} ${project}`);
  }
  if (zone === 'fpt-city') {
    return /\bfpt\b|fpt city/.test(`${location} ${project}`);
  }
  if (zone === 'ven-bien') {
    return /biển|bien|non nước|non nuoc|sơn trà|son tra|sun symphony|s[\s-]?light|sun group/.test(
      `${location} ${project}`,
    );
  }
  if (zone === 'trung-tam') {
    return /hải châu|hai chau|thanh khê|thanh khe|sơn trà|trung tâm/.test(location);
  }
  return false;
}

export function getPropertyProjectLabel(property: { project_name?: string }): string | undefined {
  return normalizeProjectName(property.project_name);
}

export function matchProjectName(property: { project_name?: string }, projectFilter: string) {
  if (!projectFilter || projectFilter === 'all') return true;
  const label = getPropertyProjectLabel(property);
  if (!label) return false;
  return label.toLowerCase() === projectFilter.toLowerCase();
}
