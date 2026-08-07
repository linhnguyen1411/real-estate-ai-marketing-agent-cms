import type { BreadcrumbDefinition } from '../types/SeoContent';

/**
 * Central breadcrumb definitions — path SSOT for static SEO pages.
 */
export const BREADCRUMB_DEFINITIONS: BreadcrumbDefinition[] = [
  {
    id: 'bc-home',
    items: [{ name: 'Trang chủ', path: '/' }],
  },
  {
    id: 'bc-catalog',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
    ],
  },
  {
    id: 'bc-catalog-can-ho',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: 'Căn hộ cao cấp Đà Nẵng', path: '/can-ho-cao-cap-da-nang' },
    ],
  },
  {
    id: 'bc-catalog-dat-nen',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: 'Đất nền Nam Hòa Xuân', path: '/dat-nen-nam-hoa-xuan-da-nang' },
    ],
  },
  {
    id: 'bc-catalog-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: 'Shophouse khối đế Đà Nẵng', path: '/shophouse-khoi-de-da-nang' },
    ],
  },
  {
    id: 'bc-catalog-nha-pho',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: 'Nhà phố', path: '/bat-dong-san/nha-pho' },
    ],
  },
  {
    id: 'bc-nam-da-nang',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: 'Nam Đà Nẵng', path: '/bat-dong-san-nam-da-nang' },
    ],
  },
  {
    id: 'bc-bds-dau-tu',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: 'BĐS đầu tư Đà Nẵng', path: '/bat-dong-san-dau-tu-da-nang' },
    ],
  },
  {
    id: 'bc-du-an',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
    ],
  },
  {
    id: 'bc-project-sun-group',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
      { name: 'Sun Group Đà Nẵng', path: '/du-an/du-an-sun-group-da-nang' },
    ],
  },
  {
    id: 'bc-sun-symphony',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
      { name: 'Sun Symphony', path: '/du-an/sun-symphony' },
    ],
  },
  {
    id: 'bc-sun-cosmo',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
      { name: 'Sun Cosmo', path: '/du-an/sun-cosmo' },
    ],
  },
  {
    id: 'bc-sun-ponte',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
      { name: 'Sun Ponte', path: '/du-an/sun-ponte' },
    ],
  },
  {
    id: 'bc-project-nam-da-nang',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
      { name: 'BĐS Nam Đà Nẵng', path: '/du-an/nam-da-nang' },
    ],
  },
  {
    id: 'bc-bds-noi-bat',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Danh mục', path: '/du-an' },
      { name: 'BĐS nổi bật', path: '/du-an/bds-noi-bat' },
    ],
  },
  {
    id: 'bc-tin-tuc',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Tin tức', path: '/tin-tuc' },
    ],
  },
  {
    id: 'bc-dau-tu-da-nang',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Đầu tư Đà Nẵng', path: '/dau-tu-da-nang' },
    ],
  },
  {
    id: 'bc-lien-he',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Liên hệ', path: '/lien-he' },
    ],
  },
  {
    id: 'bc-shophouse-hub',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
    ],
  },
  {
    id: 'bc-gia-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Giá shophouse Sun', path: '/gia-shophouse-sun-da-nang' },
    ],
  },
  {
    id: 'bc-khoi-de-symphony',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Shophouse khối đế Symphony', path: '/shophouse-khoi-de-sun-symphony' },
    ],
  },
  {
    id: 'bc-dau-tu-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Đầu tư shophouse Sun', path: '/dau-tu-shophouse-sun-da-nang' },
    ],
  },
  {
    id: 'bc-dong-tien-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Dòng tiền shophouse', path: '/dong-tien-shophouse-sun' },
    ],
  },
  {
    id: 'bc-cho-thue-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Cho thuê shophouse Sun', path: '/cho-thue-shophouse-sun' },
    ],
  },
  {
    id: 'bc-phap-ly-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Pháp lý shophouse Sun', path: '/phap-ly-shophouse-sun' },
    ],
  },
  {
    id: 'bc-tt-shophouse',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Chính sách thanh toán', path: '/chinh-sach-thanh-toan-shophouse-sun' },
    ],
  },
  {
    id: 'bc-bang-gia-can-ho-sun',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Bảng giá căn hộ Sun', path: '/bang-gia-can-ho-sun-da-nang' },
    ],
  },
  {
    id: 'bc-can-ho-sun-group',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'Căn hộ Sun Group Đà Nẵng', path: '/can-ho-sun-group-da-nang' },
    ],
  },
  {
    id: 'bc-so-sanh-shop-can',
    items: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Shophouse Sun Đà Nẵng', path: '/shophouse-sun-da-nang' },
      { name: 'So sánh shophouse & căn hộ', path: '/so-sanh-shophouse-va-can-ho-sun' },
    ],
  },
];

const BY_ID = new Map(BREADCRUMB_DEFINITIONS.map(def => [def.id, def]));

export function getBreadcrumbRecord(id: string): BreadcrumbDefinition | undefined {
  return BY_ID.get(id);
}

export function listBreadcrumbRecords(): readonly BreadcrumbDefinition[] {
  return BREADCRUMB_DEFINITIONS;
}
