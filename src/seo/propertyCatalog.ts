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
      'FPT City / S-Light',
      'Four Tower',
      'Sun Symphony',
      'Sun Cosmo',
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

export function getAllProjectNames() {
  return PROPERTY_PROJECT_GROUPS.flatMap(group => group.projects);
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
    return /fpt|s-light|s light|four tower/.test(`${location} ${project}`);
  }
  if (zone === 'ven-bien') {
    return /biển|bien|non nước|non nuoc|sơn trà|son tra/.test(`${location} ${project}`);
  }
  if (zone === 'trung-tam') {
    return /hải châu|hai chau|thanh khê|thanh khe|sơn trà|trung tâm/.test(location);
  }
  return false;
}

export function matchProjectName(property: { project_name?: string; location?: string; title?: string }, projectFilter: string) {
  if (!projectFilter || projectFilter === 'all') return true;
  const needle = projectFilter.toLowerCase();
  const haystack = `${property.project_name || ''} ${property.location || ''} ${property.title || ''}`.toLowerCase();
  return haystack.includes(needle);
}
