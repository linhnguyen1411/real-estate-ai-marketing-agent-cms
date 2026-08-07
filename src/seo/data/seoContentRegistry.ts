import { PageType } from '../types/PageType';
import type { SchemaType } from '../types/SeoMetadata';
import type { SeoContent } from '../types/SeoContent';
import { SITE } from '../siteConfig';
import { SEO_LANDING_SLUGS } from '../routes';
import { PROJECT_SLUGS } from '../portfolioHub';
import { MONEY_PAGE_SLUGS } from './internalLinks';
import { normalizePathname } from '../utils/normalizeCanonical';
import { buildIntentTitle } from '../utils/buildTitle';
import { buildIntentDescription } from '../utils/buildDescription';

const DEFAULT_PAGE_SCHEMAS: SchemaType[] = ['defaultPage', 'BreadcrumbList'];
const ARTICLE_SCHEMAS: SchemaType[] = ['defaultPage', 'BreadcrumbList', 'Article'];
const YEAR = 2026;

function content(
  slug: string,
  pageType: PageType,
  defaultTitle: string,
  defaultDescription: string,
  opts: Partial<Omit<SeoContent, 'slug' | 'pageType' | 'defaultTitle' | 'defaultDescription'>> = {},
): SeoContent {
  return {
    slug,
    pageType,
    template: opts.template || pageType,
    schemaType: opts.schemaType || DEFAULT_PAGE_SCHEMAS,
    defaultTitle,
    defaultDescription,
    faqId: opts.faqId,
    breadcrumbId: opts.breadcrumbId,
    keywordClusterId: opts.keywordClusterId,
    entityId: opts.entityId,
    relatedPages: opts.relatedPages,
    moneyPages: opts.moneyPages,
    priority: opts.priority ?? 0.5,
    ogType: opts.ogType || 'website',
    keywords: opts.keywords,
    group: opts.group || 'static',
  };
}

/** Registry titles via intent patterns — one primary keyword per page. */
function patterned(
  pageType: PageType,
  primaryKeyword: string,
  description: string,
  extras?: { project?: string; projectB?: string; comparisonIntent?: string },
): { title: string; description: string } {
  return {
    title: buildIntentTitle({
      pageType,
      primaryKeyword,
      project: extras?.project,
      projectB: extras?.projectB,
      comparisonIntent: extras?.comparisonIntent,
      year: YEAR,
      brand: SITE.name,
    }),
    description,
  };
}

const MONEY = [...MONEY_PAGE_SLUGS];

const SHOPHOUSE_HUB = '/shophouse-sun-da-nang';
const SHOPHOUSE_SUPPORT = [
  '/gia-shophouse-sun-da-nang',
  '/shophouse-khoi-de-sun-symphony',
  '/dau-tu-shophouse-sun-da-nang',
  '/dong-tien-shophouse-sun',
  '/cho-thue-shophouse-sun',
  '/phap-ly-shophouse-sun',
  '/chinh-sach-thanh-toan-shophouse-sun',
  '/bang-gia-can-ho-sun-da-nang',
  '/can-ho-sun-group-da-nang',
  '/so-sanh-shophouse-va-can-ho-sun',
] as const;

const homeTitle =
  'Căn Hộ Sun Group, Shophouse Khối Đế & BĐS Đầu Tư Đà Nẵng | Estoria';
const homeDesc =
  'Estoria chuyên căn hộ Sun Group, shophouse khối đế Sun Group và bất động sản đầu tư nổi bật tại Đà Nẵng — giá, dòng tiền, pháp lý để thẩm định trước khi mua.';

/**
 * SEO content registry — SSOT for static page SEO knowledge.
 * Titles follow intent-driven patterns (see buildIntentTitle); clusters are 1:1 with pages.
 */
export const SEO_CONTENT_REGISTRY: SeoContent[] = [
  content('/', PageType.HOME, homeTitle, homeDesc, {
    schemaType: ['defaultPage'],
    priority: 1,
    keywords: [
      'căn hộ và shophouse sun đà nẵng',
      'shophouse khối đế sun group',
      'căn hộ sun group đà nẵng',
      'bđs đầu tư nổi bật đà nẵng',
    ],
    entityId: 'entity-da-nang',
    keywordClusterId: 'kc-home-core',
    breadcrumbId: 'bc-home',
    faqId: 'faq-investor-base',
    moneyPages: MONEY,
    relatedPages: [SHOPHOUSE_HUB, '/can-ho-sun-group-da-nang', '/du-an/bds-noi-bat', '/lien-he'],
  }),
  (() => {
    const p = patterned(PageType.CATALOG, 'Danh sách BĐS Đà Nẵng đầu tư', '');
    return content(
      '/bat-dong-san',
      PageType.CATALOG,
      p.title,
      'Danh sách BĐS Đà Nẵng đầu tư cập nhật: căn hộ, đất nền, nhà phố — lọc theo giá, pháp lý và tiềm năng sinh lời cho nhà đầu tư.',
      {
        priority: 0.9,
        entityId: 'entity-da-nang',
        keywordClusterId: 'kc-catalog-bds',
        breadcrumbId: 'bc-catalog',
        moneyPages: MONEY,
        relatedPages: ['/can-ho-cao-cap-da-nang', '/dat-nen-nam-hoa-xuan-da-nang', '/du-an'],
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Căn hộ đầu tư Đà Nẵng', '');
    return content(
      '/can-ho-cao-cap-da-nang',
      PageType.CATALOG,
      p.title,
      'Căn hộ cao cấp Đà Nẵng: giá vào, thanh khoản thứ cấp, căn ven sông Hàn và Sun Group — lọc theo yield và pháp lý.',
      {
        priority: 0.8,
        entityId: 'entity-can-ho',
        keywordClusterId: 'kc-can-ho-sun',
        breadcrumbId: 'bc-catalog-can-ho',
        moneyPages: MONEY,
        relatedPages: ['/du-an/sun-symphony', '/can-ho-dau-tu-da-nang'],
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Đất nền đầu tư Nam Đà Nẵng', '');
    return content(
      '/dat-nen-nam-hoa-xuan-da-nang',
      PageType.CATALOG,
      p.title,
      'Đất nền Nam Hòa Xuân Đà Nẵng: sổ hồng, bản đồ giá và checklist pháp lý trước khi xuống tiền.',
      {
        priority: 0.8,
        entityId: 'entity-dat-nen',
        keywordClusterId: 'kc-dat-nen-nam',
        breadcrumbId: 'bc-catalog-dat-nen',
        relatedPages: ['/dat-nen-nam-da-nang', '/du-an/nam-da-nang'],
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Shophouse khối đế Đà Nẵng', '');
    return content(
      '/shophouse-khoi-de-da-nang',
      PageType.CATALOG,
      p.title,
      'Shophouse khối đế Đà Nẵng: quỹ hàng kinh doanh, dòng tiền thuê và vị trí thương mại để thẩm định đầu tư.',
      {
        priority: 0.8,
        entityId: 'entity-nha-pho',
        keywordClusterId: 'kc-nha-pho',
        breadcrumbId: 'bc-catalog-shophouse',
        relatedPages: ['/shophouse-sun-da-nang', '/shophouse-khoi-de-sun-symphony'],
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Nhà phố kinh doanh Đà Nẵng', '');
    return content(
      '/bat-dong-san/nha-pho',
      PageType.CATALOG,
      p.title,
      'Nhà phố kinh doanh Đà Nẵng: mặt tiền, shophouse và tiềm năng thương mại — dòng tiền thuê vs ở kết hợp đầu tư.',
      {
        priority: 0.8,
        entityId: 'entity-nha-pho',
        keywordClusterId: 'kc-nha-pho',
        breadcrumbId: 'bc-catalog-nha-pho',
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.LOCATION, 'Phân tích BĐS Nam Đà Nẵng', '', { project: 'Nam Đà Nẵng' });
    return content(
      '/bat-dong-san-nam-da-nang',
      PageType.LOCATION,
      p.title,
      buildIntentDescription({
        pageType: PageType.LOCATION,
        primaryKeyword: 'phân tích bđs nam đà nẵng',
        project: 'Nam Đà Nẵng',
        angle: 'quy hoạch, giá đất và cơ hội trung–dài hạn',
        year: YEAR,
      }),
      {
        priority: 0.8,
        entityId: 'entity-nam-da-nang',
        keywordClusterId: 'kc-nam-da-nang',
        breadcrumbId: 'bc-nam-da-nang',
        faqId: 'faq-nam-da-nang',
        relatedPages: ['/du-an/nam-da-nang', '/dau-tu-nam-da-nang'],
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Bất động sản đầu tư Đà Nẵng', '');
    return content(
      '/bat-dong-san-dau-tu-da-nang',
      PageType.CATALOG,
      p.title,
      'Bất động sản đầu tư Đà Nẵng: deal giá tốt, ngộp cắt lỗ và quỹ hàng đáng thẩm định ROI / pháp lý.',
      {
        priority: 0.85,
        entityId: 'entity-bds-noi-bat',
        keywordClusterId: 'kc-bds-gia-dau-tu',
        breadcrumbId: 'bc-bds-dau-tu',
        relatedPages: ['/du-an/bds-noi-bat', '/bat-dong-san', '/can-ho-cao-cap-da-nang'],
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.LOCATION, 'Đất nền Mai Đăng Chơn đầu tư', '', { project: 'Mai Đăng Chơn' });
    return content(
      '/bat-dong-san/mai-dang-chon',
      PageType.LOCATION,
      p.title,
      'Đất nền Mai Đăng Chơn đầu tư: giá đang giao dịch, pháp lý và vị trí cho nhà đầu tư Nam Đà Nẵng.',
      {
        priority: 0.7,
        entityId: 'entity-mai-dang-chon',
        keywordClusterId: 'kc-mai-dang-chon',
        breadcrumbId: 'bc-nam-da-nang',
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.LOCATION, 'BĐS FPT City Đà Nẵng đầu tư', '', { project: 'FPT City' });
    return content(
      '/bat-dong-san/fpt-city',
      PageType.LOCATION,
      p.title,
      'BĐS FPT City Đà Nẵng đầu tư: đất nền, shophouse phía Tây — quy hoạch, giá và timeline cho nhà đầu tư.',
      {
        priority: 0.7,
        entityId: 'entity-fpt-city',
        keywordClusterId: 'kc-fpt-city',
      },
    );
  })(),
  (() => {
    // Inventory page — catalog-style title (transactional listing), not project brand navigational
    const p = patterned(PageType.CATALOG, 'Giá căn hộ Sun Symphony đang bán', '');
    return content(
      '/bat-dong-san/sun-symphony',
      PageType.PROJECT,
      p.title,
      'Giá căn hộ Sun Symphony đang bán / thứ cấp — giỏ hàng liên quan ven sông Hàn để thẩm định trước khi chốt.',
      {
        priority: 0.7,
        entityId: 'entity-sun-symphony',
        keywordClusterId: 'kc-sun-symphony-inventory',
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Căn hộ Sun Cosmo đang bán', '');
    return content(
      '/bat-dong-san/sun-cosmo',
      PageType.PROJECT,
      p.title,
      'Căn hộ Sun Cosmo đang bán / cho thuê — giá thứ cấp và cơ hội dòng tiền tại trung tâm Đà Nẵng.',
      {
        priority: 0.7,
        entityId: 'entity-sun-cosmo',
        keywordClusterId: 'kc-sun-cosmo-inventory',
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Shophouse Sun Ponte đang bán', '');
    return content(
      '/bat-dong-san/sun-ponte',
      PageType.PROJECT,
      p.title,
      'Shophouse & căn hộ Sun Ponte đang bán — tiềm năng thương mại ven sông Hàn và dòng tiền thuê.',
      {
        priority: 0.7,
        entityId: 'entity-sun-ponte',
        keywordClusterId: 'kc-sun-ponte-inventory',
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.LOCATION, 'Đất nền Hòa Xuân đầu tư', '', { project: 'Hòa Xuân' });
    return content(
      '/bat-dong-san/hoa-xuan',
      PageType.LOCATION,
      p.title,
      'Đất nền Hòa Xuân đầu tư: giá, pháp lý và nhà phố khu vực — danh sách đang giao dịch cho nhà đầu tư.',
      {
        priority: 0.7,
        entityId: 'entity-hoa-xuan',
        keywordClusterId: 'kc-hoa-xuan',
      },
    );
  })(),
  (() => {
    const p = patterned(PageType.CATALOG, 'Danh mục dự án BĐS Đà Nẵng', '');
    return content(
      '/du-an',
      PageType.CATALOG,
      p.title,
      'Danh mục dự án BĐS Đà Nẵng: Sun Group, Nam Đà Nẵng và BĐS nổi bật — so sánh quỹ hàng theo góc nhìn đầu tư.',
      {
        priority: 0.9,
        keywordClusterId: 'kc-portfolio-hub',
        breadcrumbId: 'bc-du-an',
        moneyPages: MONEY,
        relatedPages: ['/du-an/sun-symphony', '/du-an/nam-da-nang', '/du-an/bds-noi-bat'],
      },
    );
  })(),
  content(
    '/kien-thuc-dau-tu',
    PageType.ARTICLE,
    'Kiến thức đầu tư BĐS Đà Nẵng | Estoria',
    'Kiến thức đầu tư BĐS Đà Nẵng: pháp lý, dòng tiền, chọn dự án và rủi ro — khung tư duy trước khi xuống tiền.',
    {
      schemaType: ARTICLE_SCHEMAS,
      priority: 0.7,
      keywordClusterId: 'kc-knowledge-hub',
      faqId: 'faq-investor-base',
    },
  ),
  content('/tin-thi-truong', PageType.ARTICLE, 'Tin Thị Trường BĐS Đà Nẵng | Cập Nhật Mới Nhất', 'Tin tức thị trường bất động sản Đà Nẵng: giá đất, giao dịch, chính sách và xu hướng 2026.', {
    schemaType: ARTICLE_SCHEMAS,
    priority: 0.7,
  }),
  content('/phan-tich', PageType.ARTICLE, 'Phân Tích BĐS Đà Nẵng | Báo Cáo Đầu Tư', 'Phân tích chuyên sâu thị trường bất động sản Đà Nẵng theo khu vực, phân khúc và dòng tiền.', {
    schemaType: ARTICLE_SCHEMAS,
    priority: 0.7,
  }),
  (() => {
    const p = patterned(PageType.LOCATION, 'Review khu vực đầu tư Đà Nẵng', '');
    return content(
      '/review-khu-vuc',
      PageType.LOCATION,
      p.title,
      'Review khu vực đầu tư Đà Nẵng: Nam Đà Nẵng, ven sông Hàn, ven biển — ưu nhược điểm theo khẩu vị rủi ro.',
      {
        schemaType: ARTICLE_SCHEMAS,
        priority: 0.7,
        keywordClusterId: 'kc-review-areas',
      },
    );
  })(),
  content('/tin-tuc', PageType.ARTICLE, 'Tin Tức & Phân Tích BĐS Đà Nẵng 2026 | Estoria', 'Tin tức, phân tích và review khu vực bất động sản Đà Nẵng dành cho nhà đầu tư trung và dài hạn.', {
    schemaType: ARTICLE_SCHEMAS,
    priority: 0.7,
    breadcrumbId: 'bc-tin-tuc',
  }),
  (() => {
    const p = patterned(PageType.FINANCIAL, 'Dữ liệu thị trường BĐS Nam Đà Nẵng', '', { project: 'Nam Đà Nẵng' });
    return content(
      '/nha-dau-tu',
      PageType.FINANCIAL,
      p.title,
      buildIntentDescription({
        pageType: PageType.FINANCIAL,
        primaryKeyword: 'dữ liệu thị trường bđs nam đà nẵng',
        project: 'Nam Đà Nẵng',
        year: YEAR,
      }),
      {
        priority: 0.8,
        keywordClusterId: 'kc-market-data',
        moneyPages: MONEY,
      },
    );
  })(),
  content('/gioi-thieu', PageType.ARTICLE, 'Giới Thiệu Estoria | Tư Vấn BĐS Đà Nẵng', 'Estoria — đội ngũ tư vấn bất động sản Đà Nẵng hỗ trợ nhà đầu tư bằng dữ liệu minh bạch và góc nhìn thẩm định thực tế.', {
    schemaType: ARTICLE_SCHEMAS,
    ogType: 'article',
    priority: 0.6,
  }),
  (() => {
    const p = patterned(PageType.FINANCIAL, 'Tài liệu phân tích đầu tư Nam Đà Nẵng', '', { project: 'Nam Đà Nẵng' });
    return content(
      '/tai-lieu-dau-tu',
      PageType.FINANCIAL,
      p.title,
      buildIntentDescription({
        pageType: PageType.FINANCIAL,
        primaryKeyword: 'tài liệu phân tích đầu tư nam đà nẵng',
        project: 'Nam Đà Nẵng',
        year: YEAR,
      }),
      {
        priority: 0.7,
        keywordClusterId: 'kc-investor-docs',
        moneyPages: MONEY,
      },
    );
  })(),
  content('/lien-he', PageType.ARTICLE, 'Liên Hệ Tư Vấn BĐS Đà Nẵng | Hotline & Zalo', 'Liên hệ Estoria: hotline, Zalo, Messenger, email. Tư vấn miễn phí bất động sản Đà Nẵng cho nhà đầu tư.', {
    schemaType: ['defaultPage', 'BreadcrumbList', 'LocalBusiness'],
    priority: 0.6,
    breadcrumbId: 'bc-lien-he',
    moneyPages: MONEY,
  }),
  (() => {
    const p = patterned(PageType.LEGAL, 'Chính sách bảo mật tư vấn BĐS', '');
    return content(
      '/chinh-sach-bao-mat',
      PageType.LEGAL,
      p.title,
      buildIntentDescription({ pageType: PageType.LEGAL, primaryKeyword: 'chính sách bảo mật tư vấn bđs', year: YEAR }),
      { priority: 0.3, keywordClusterId: 'kc-legal-privacy' },
    );
  })(),
  (() => {
    const p = patterned(PageType.LEGAL, 'Điều khoản sử dụng tư vấn BĐS', '');
    return content(
      '/dieu-khoan-su-dung',
      PageType.LEGAL,
      p.title,
      buildIntentDescription({ pageType: PageType.LEGAL, primaryKeyword: 'điều khoản sử dụng tư vấn bđs', year: YEAR }),
      { priority: 0.3, keywordClusterId: 'kc-legal-terms' },
    );
  })(),
  (() => {
    const p = patterned(PageType.LEGAL, 'Chính sách cookie website BĐS', '');
    return content(
      '/chinh-sach-cookie',
      PageType.LEGAL,
      p.title,
      buildIntentDescription({ pageType: PageType.LEGAL, primaryKeyword: 'chính sách cookie website bđs', year: YEAR }),
      { priority: 0.3, keywordClusterId: 'kc-legal-cookie' },
    );
  })(),
  (() => {
    const p = patterned(PageType.LEGAL, 'Miễn trừ trách nhiệm tư vấn BĐS', '');
    return content(
      '/mien-tru-trach-nhiem',
      PageType.LEGAL,
      p.title,
      buildIntentDescription({ pageType: PageType.LEGAL, primaryKeyword: 'miễn trừ trách nhiệm tư vấn bđs', year: YEAR }),
      { priority: 0.3, keywordClusterId: 'kc-legal-disclaimer' },
    );
  })(),
  content('/tac-gia/nguyen-phan-hoang-linh', PageType.ARTICLE, 'Linh Nguyễn | Tư Vấn BĐS Nam Đà Nẵng', 'Hồ sơ Linh Nguyễn — tư vấn bất động sản Nam Đà Nẵng, hỗ trợ nhà đầu tư với dữ liệu thị trường và chiến lược thẩm định.', {
    schemaType: ['defaultPage', 'BreadcrumbList', 'Person'],
    ogType: 'article',
    priority: 0.5,
  }),
];

/** Shophouse Sun topic hub + money pages — publishable via existing pipeline */
const SHOPHOUSE_SUN_PAGES: SeoContent[] = [
  content(
    SHOPHOUSE_HUB,
    PageType.CATALOG,
    buildIntentTitle({
      pageType: PageType.CATALOG,
      primaryKeyword: 'Shophouse Sun Đà Nẵng',
      brand: SITE.name,
      year: YEAR,
    }),
    'Hub Shophouse Sun Đà Nẵng: khối đế Symphony & Sun Group — giá, dòng tiền, pháp lý, cho thuê và so sánh với căn hộ để thẩm định đầu tư.',
    {
      priority: 0.95,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-shophouse-sun-hub',
      breadcrumbId: 'bc-shophouse-hub',
      faqId: 'faq-shophouse-hub',
      moneyPages: MONEY,
      relatedPages: [...SHOPHOUSE_SUPPORT, '/du-an/sun-symphony', '/du-an/sun-ponte', '/lien-he'],
      keywords: [
        'shophouse sun đà nẵng',
        'shophouse khối đế sun group',
        'đầu tư shophouse sun',
      ],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/gia-shophouse-sun-da-nang',
    PageType.FINANCIAL,
    buildIntentTitle({
      pageType: PageType.FINANCIAL,
      primaryKeyword: 'Giá shophouse Sun Symphony',
      project: 'Shophouse Sun',
      brand: SITE.name,
      year: YEAR,
    }),
    'Giá shophouse Sun Symphony / khối đế Đà Nẵng: tham chiếu sơ cấp & thứ cấp, yếu tố mặt tiền và checklist thẩm định trước khi xuống tiền.',
    {
      priority: 0.9,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-gia-shophouse-sun',
      breadcrumbId: 'bc-gia-shophouse',
      faqId: 'faq-gia-shophouse',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/dong-tien-shophouse-sun', '/chinh-sach-thanh-toan-shophouse-sun', '/du-an/sun-symphony'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/shophouse-khoi-de-sun-symphony',
    PageType.PROJECT,
    buildIntentTitle({
      pageType: PageType.PROJECT,
      primaryKeyword: 'Shophouse khối đế Sun Symphony',
      project: 'Sun Symphony',
      brand: SITE.name,
      year: YEAR,
    }),
    'Shophouse khối đế Sun Symphony: vị trí mặt tiền, mô hình kinh doanh, tiến độ và góc nhìn đầu tư dòng tiền tại Đà Nẵng.',
    {
      priority: 0.9,
      entityId: 'entity-sun-symphony',
      keywordClusterId: 'kc-khoi-de-symphony',
      breadcrumbId: 'bc-khoi-de-symphony',
      faqId: 'faq-khoi-de-symphony',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/gia-shophouse-sun-da-nang', '/du-an/sun-symphony', '/phap-ly-shophouse-sun'],
      group: 'landing',
      schemaType: ARTICLE_SCHEMAS,
      ogType: 'article',
    },
  ),
  content(
    '/dau-tu-shophouse-sun-da-nang',
    PageType.FINANCIAL,
    buildIntentTitle({
      pageType: PageType.FINANCIAL,
      primaryKeyword: 'Đầu tư shophouse Sun Đà Nẵng',
      project: 'Shophouse Sun',
      brand: SITE.name,
      year: YEAR,
    }),
    'Đầu tư shophouse Sun Đà Nẵng: ROI, rủi ro, chiến lược nắm giữ và checklist thẩm định khối đế trước khi giải ngân.',
    {
      priority: 0.9,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-dau-tu-shophouse',
      breadcrumbId: 'bc-dau-tu-shophouse',
      faqId: 'faq-dau-tu-shophouse',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/dong-tien-shophouse-sun', '/phap-ly-shophouse-sun', '/so-sanh-shophouse-va-can-ho-sun'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/dong-tien-shophouse-sun',
    PageType.FINANCIAL,
    buildIntentTitle({
      pageType: PageType.FINANCIAL,
      primaryKeyword: 'Dòng tiền shophouse khối đế',
      project: 'Shophouse Sun',
      brand: SITE.name,
      year: YEAR,
    }),
    'Dòng tiền shophouse khối đế: ước tính lợi nhuận shophouse Sun, tỷ lệ lấp đầy, chi phí vận hành và kịch bản cash flow thận trọng.',
    {
      priority: 0.85,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-dong-tien-shophouse',
      breadcrumbId: 'bc-dong-tien-shophouse',
      faqId: 'faq-dong-tien-shophouse',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/cho-thue-shophouse-sun', '/gia-shophouse-sun-da-nang', '/dau-tu-shophouse-sun-da-nang'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/cho-thue-shophouse-sun',
    PageType.FINANCIAL,
    buildIntentTitle({
      pageType: PageType.FINANCIAL,
      primaryKeyword: 'Cho thuê shophouse Sun',
      project: 'Shophouse Sun',
      brand: SITE.name,
      year: YEAR,
    }),
    'Cho thuê shophouse Sun Đà Nẵng: giá thuê kỳ vọng, đối tượng khách thuê, hợp đồng và yield sau phí quản lý.',
    {
      priority: 0.85,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-cho-thue-shophouse',
      breadcrumbId: 'bc-cho-thue-shophouse',
      faqId: 'faq-cho-thue-shophouse',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/dong-tien-shophouse-sun', '/gia-shophouse-sun-da-nang'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/phap-ly-shophouse-sun',
    PageType.LEGAL,
    buildIntentTitle({
      pageType: PageType.LEGAL,
      primaryKeyword: 'Pháp lý shophouse Sun Đà Nẵng',
      year: YEAR,
      brand: SITE.name,
    }),
    'Pháp lý shophouse Sun Đà Nẵng: sổ hồng, quy định kinh doanh khối đế, phí quản lý và checklist kiểm tra trước giao dịch.',
    {
      priority: 0.8,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-phap-ly-shophouse',
      breadcrumbId: 'bc-phap-ly-shophouse',
      faqId: 'faq-phap-ly-shophouse',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/chinh-sach-thanh-toan-shophouse-sun', '/dau-tu-shophouse-sun-da-nang'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/chinh-sach-thanh-toan-shophouse-sun',
    PageType.FINANCIAL,
    buildIntentTitle({
      pageType: PageType.FINANCIAL,
      primaryKeyword: 'Chính sách thanh toán shophouse Sun',
      project: 'Shophouse Sun',
      brand: SITE.name,
      year: YEAR,
    }),
    'Chính sách thanh toán shophouse Sun: tiến độ, ưu đãi ngoại giao, hỗ trợ vay và lưu ý lãi chậm trước khi ký.',
    {
      priority: 0.85,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-tt-shophouse',
      breadcrumbId: 'bc-tt-shophouse',
      faqId: 'faq-tt-shophouse',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/gia-shophouse-sun-da-nang', '/phap-ly-shophouse-sun'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/bang-gia-can-ho-sun-da-nang',
    PageType.FINANCIAL,
    buildIntentTitle({
      pageType: PageType.FINANCIAL,
      primaryKeyword: 'Bảng giá căn hộ Sun Đà Nẵng',
      project: 'Căn hộ Sun',
      brand: SITE.name,
      year: YEAR,
    }),
    'Bảng giá căn hộ Sun Đà Nẵng 2026: Symphony, Cosmo, Ponte — sơ cấp & thứ cấp theo ngân sách đầu tư.',
    {
      priority: 0.9,
      entityId: 'entity-can-ho',
      keywordClusterId: 'kc-bang-gia-can-ho-sun',
      breadcrumbId: 'bc-bang-gia-can-ho-sun',
      faqId: 'faq-bang-gia-can-ho-sun',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/can-ho-sun-group-da-nang', '/du-an/sun-symphony', '/so-sanh-shophouse-va-can-ho-sun'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/can-ho-sun-group-da-nang',
    PageType.CATALOG,
    buildIntentTitle({
      pageType: PageType.CATALOG,
      primaryKeyword: 'Căn hộ Sun Group Đà Nẵng đầu tư',
      brand: SITE.name,
      year: YEAR,
    }),
    'Căn hộ Sun Group Đà Nẵng đầu tư: Symphony, Cosmo, Ponte — thanh khoản, yield và giỏ hàng để thẩm định trước khi mua.',
    {
      priority: 0.9,
      entityId: 'entity-can-ho',
      keywordClusterId: 'kc-can-ho-sun-group',
      breadcrumbId: 'bc-can-ho-sun-group',
      faqId: 'faq-can-ho-sun-group',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/bang-gia-can-ho-sun-da-nang', '/can-ho-cao-cap-da-nang', '/so-sanh-shophouse-va-can-ho-sun'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
  content(
    '/so-sanh-shophouse-va-can-ho-sun',
    PageType.COMPARISON,
    buildIntentTitle({
      pageType: PageType.COMPARISON,
      primaryKeyword: 'so sánh shophouse và căn hộ sun',
      project: 'Shophouse Sun',
      projectB: 'Căn hộ Sun',
      comparisonIntent: 'ROI & dòng tiền',
      brand: SITE.name,
      year: YEAR,
    }),
    'So sánh shophouse và căn hộ Sun Đà Nẵng: vốn, ROI, thanh khoản, vận hành cho thuê — chọn sản phẩm theo khẩu vị rủi ro.',
    {
      priority: 0.85,
      entityId: 'entity-shophouse-sun',
      keywordClusterId: 'kc-so-sanh-shop-can',
      breadcrumbId: 'bc-so-sanh-shop-can',
      faqId: 'faq-so-sanh-shop-can',
      moneyPages: MONEY,
      relatedPages: [SHOPHOUSE_HUB, '/can-ho-sun-group-da-nang', '/shophouse-khoi-de-sun-symphony', '/dong-tien-shophouse-sun'],
      group: 'landing',
      schemaType: [...DEFAULT_PAGE_SCHEMAS, 'FAQPage'],
    },
  ),
];

SEO_CONTENT_REGISTRY.push(...SHOPHOUSE_SUN_PAGES);

const PROJECT_META: Record<
  string,
  {
    primaryKeyword: string;
    project: string;
    description: string;
    entityId: string;
    faqId: string;
    breadcrumbId: string;
    clusterId: string;
  }
> = {
  'du-an-sun-group-da-nang': {
    primaryKeyword: 'Dự án Sun Group Đà Nẵng',
    project: 'Sun Group',
    description:
      'Dự án Sun Group Đà Nẵng: căn hộ cao cấp ven sông Hàn, shophouse khối đế Symphony/Cosmo/Ponte — quỹ hàng và khung thẩm định đầu tư.',
    entityId: 'entity-sun-group',
    faqId: 'faq-sun-symphony',
    breadcrumbId: 'bc-project-sun-group',
    clusterId: 'kc-home-core',
  },
  'sun-cosmo': {
    primaryKeyword: 'ROI căn hộ Sun Cosmo Đà Nẵng',
    project: 'Sun Cosmo',
    description:
      'ROI căn hộ Sun Cosmo Đà Nẵng: yield, chính sách thanh toán, pháp lý và thanh khoản thứ cấp cho nhà đầu tư dòng tiền.',
    entityId: 'entity-sun-cosmo',
    faqId: 'faq-sun-cosmo',
    breadcrumbId: 'bc-sun-cosmo',
    clusterId: 'kc-sun-cosmo-project',
  },
  'sun-symphony': {
    primaryKeyword: 'Phân tích đầu tư Sun Symphony',
    project: 'Sun Symphony',
    description:
      'Phân tích đầu tư Sun Symphony: tiến độ thi công, pháp lý, ROI theo tháp Sonata/Spana/Cora/S-Light và rủi ro thanh khoản.',
    entityId: 'entity-sun-symphony',
    faqId: 'faq-sun-symphony',
    breadcrumbId: 'bc-sun-symphony',
    clusterId: 'kc-sun-symphony',
  },
  'sun-ponte': {
    primaryKeyword: 'Tiềm năng thương mại Sun Ponte',
    project: 'Sun Ponte',
    description:
      'Tiềm năng thương mại Sun Ponte: shophouse & căn hộ ven sông Hàn — dòng tiền thuê, vị trí và khung thẩm định đầu tư.',
    entityId: 'entity-sun-ponte',
    faqId: 'faq-sun-ponte',
    breadcrumbId: 'bc-sun-ponte',
    clusterId: 'kc-sun-ponte-project',
  },
  'nam-da-nang': {
    primaryKeyword: 'Quỹ hàng BĐS Nam Đà Nẵng',
    project: 'Nam Đà Nẵng',
    description:
      'Quỹ hàng BĐS Nam Đà Nẵng: đất nền, nhà phố, kho xưởng, căn hộ — tài sản đang giao dịch để thẩm định ROI và pháp lý.',
    entityId: 'entity-nam-da-nang',
    faqId: 'faq-nam-da-nang',
    breadcrumbId: 'bc-project-nam-da-nang',
    clusterId: 'kc-nam-da-nang-project',
  },
  'bds-noi-bat': {
    primaryKeyword: 'BĐS cắt lỗ Đà Nẵng',
    project: 'Đà Nẵng',
    description:
      'BĐS cắt lỗ / giá đầu tư Đà Nẵng: deal ngộp, ngoại giao và tài sản đáng thẩm định ngoài một dự án cố định.',
    entityId: 'entity-bds-noi-bat',
    faqId: 'faq-bds-noi-bat',
    breadcrumbId: 'bc-bds-noi-bat',
    clusterId: 'kc-bds-gia-dau-tu',
  },
};

for (const slug of PROJECT_SLUGS) {
  const meta = PROJECT_META[slug];
  const title = meta
    ? buildIntentTitle({
        pageType: PageType.PROJECT,
        primaryKeyword: meta.primaryKeyword,
        project: meta.project,
        brand: SITE.name,
        year: YEAR,
      })
    : slug;
  SEO_CONTENT_REGISTRY.push(
    content(`/du-an/${slug}`, PageType.PROJECT, title, meta?.description || '', {
      schemaType: ARTICLE_SCHEMAS,
      ogType: 'article',
      priority: 0.8,
      group: 'project',
      entityId: meta?.entityId,
      faqId: meta?.faqId,
      breadcrumbId: meta?.breadcrumbId,
      keywordClusterId: meta?.clusterId,
      moneyPages: slug === 'sun-symphony' || slug === 'nam-da-nang' || slug === 'du-an-sun-group-da-nang' ? MONEY : undefined,
      relatedPages:
        slug === 'du-an-sun-group-da-nang'
          ? [SHOPHOUSE_HUB, '/du-an', '/can-ho-cao-cap-da-nang', '/can-ho-sun-group-da-nang']
          : slug === 'sun-symphony' || slug === 'sun-ponte' || slug === 'sun-cosmo'
          ? [SHOPHOUSE_HUB, '/du-an', '/bat-dong-san', '/can-ho-sun-group-da-nang']
          : ['/du-an', '/bat-dong-san', SHOPHOUSE_HUB],
    }),
  );
}

const LANDING_MAP: Record<string, { title: string; description: string; clusterId: string }> = {
  'dau-tu-da-nang': {
    title: 'Hướng dẫn đầu tư BĐS Đà Nẵng | Estoria',
    description:
      'Hướng dẫn đầu tư BĐS Đà Nẵng: chọn khu vực, pháp lý, dòng tiền và rủi ro — khung cho nhà đầu tư mới trước khi xuống tiền.',
    clusterId: 'kc-investor-guide',
  },
  'dau-tu-nam-da-nang': {
    title: 'ROI đầu tư Nam Đà Nẵng | Phân tích rủi ro 2026',
    description:
      'ROI đầu tư Nam Đà Nẵng: quy hoạch, lợi nhuận đất nền, thanh khoản và rủi ro — góc nhìn thẩm định trung–dài hạn.',
    clusterId: 'kc-invest-nam',
  },
  'dau-tu-fpt-city': {
    title: 'Chiến lược đầu tư FPT City | Estoria',
    description:
      'Chiến lược đầu tư FPT City: đất nền, shophouse, timeline và checklist cho nhà đầu tư Hà Nội / liên tỉnh.',
    clusterId: 'kc-invest-fpt',
  },
  'can-ho-da-nang-cho-thue': {
    title: 'Rental yield căn hộ Đà Nẵng | Dòng tiền ổn định',
    description:
      'Rental yield căn hộ Đà Nẵng: cách tính dòng tiền, khu vực hot và checklist chọn căn đầu tư cho thuê.',
    clusterId: 'kc-rental-yield',
  },
  'can-ho-dau-tu-da-nang': {
    title: 'Căn hộ Sun Group ven sông Hàn đầu tư | Estoria',
    description:
      'Căn hộ Sun Group ven sông Hàn đầu tư: giá vào, thanh khoản thứ cấp, so sánh Symphony / Cosmo / Ponte.',
    clusterId: 'kc-can-ho-invest-landing',
  },
  'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang': {
    title: 'Nhà đầu tư Hà Nội mua BĐS Đà Nẵng | Hướng dẫn',
    description:
      'Nhà đầu tư Hà Nội mua BĐS Đà Nẵng: quy trình thẩm định từ xa, pháp lý giao dịch liên tỉnh và checklist khảo sát.',
    clusterId: 'kc-hanoi-investor',
  },
  'dat-nen-nam-da-nang': {
    title: 'Mua đất nền Nam Đà Nẵng | Checklist pháp lý 2026',
    description:
      'Mua đất nền Nam Đà Nẵng: bản đồ giá, pháp lý sổ hồng, dự án ven sông và checklist mua đất an toàn.',
    clusterId: 'kc-dat-nen-landing',
  },
};

for (const slug of SEO_LANDING_SLUGS) {
  const landing = LANDING_MAP[slug] || { title: slug, description: '', clusterId: undefined as unknown as string };
  SEO_CONTENT_REGISTRY.push(
    content(`/${slug}`, PageType.ARTICLE, landing.title, landing.description, {
      schemaType: ARTICLE_SCHEMAS,
      ogType: 'article',
      priority: 0.7,
      group: 'landing',
      faqId: 'faq-investor-base',
      keywordClusterId: landing.clusterId,
      breadcrumbId: slug === 'dau-tu-da-nang' ? 'bc-dau-tu-da-nang' : undefined,
      moneyPages: slug === 'dau-tu-da-nang' || slug === 'can-ho-dau-tu-da-nang' ? MONEY : undefined,
      relatedPages: ['/tai-lieu-dau-tu', '/bat-dong-san'],
    }),
  );
}

const BY_SLUG = new Map(SEO_CONTENT_REGISTRY.map(entry => [normalizePathname(entry.slug), entry]));

export function getSeoContentRecord(pathname: string): SeoContent | undefined {
  return BY_SLUG.get(normalizePathname(pathname));
}

export function listSeoContentRecords(): readonly SeoContent[] {
  return SEO_CONTENT_REGISTRY;
}

export function listSeoContentPaths(): string[] {
  return SEO_CONTENT_REGISTRY.map(entry => entry.slug).filter(slug => slug !== '/');
}
