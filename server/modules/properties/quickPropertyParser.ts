/**
 * Quick Property Parser & Auto-SEO Generation Engine.
 *
 * Implements "Quick Post & Auto SEO Engine" for CMS bdsdanang.site:
 * 1. Quick Parse via Regex & NLP:
 *    - Extracts: Project/Area, Block, Lot, Street/Road Width, Area, Direction, Price, Legal, Phone, Property Type.
 * 2. Auto-SEO Generation:
 *    - Standard Title: [Loại hình] [Vị trí/Block] [Tên dự án] - [Tuyến đường] - [Diện tích]m² - Giá [Giá]
 *    - SEO Slug: slugify standard title
 *    - Meta Description: Compelling SEO snippet (150-160 chars)
 *    - JSON-LD Schema: RealEstateListing / SingleFamilyResidence with price VND, InStock, Da Nang address
 *    - Auto Article Description: 200 - 300 words unique copy preventing thin/duplicate content penalty.
 */

import { slugify } from '../../../src/seo/utils/slugify';

export interface QuickParsedProperty {
  type: 'Đất nền' | 'Nhà Phố' | 'Căn Hộ' | 'Shophouse' | 'Kho xưởng' | 'Nhà hàng' | 'Khách sạn' | 'Biệt thự' | 'Villa' | 'Khác';
  transaction_type: 'Bán' | 'Cho thuê';
  project_name: string;
  location: string;
  block: string;
  lot: string;
  street: string;
  road_width: number;
  area: number;
  price: number; // in billion VND
  direction: string;
  legal_status: string;
  contact_phone: string;
  title: string;
  slug: string;
  seo_title: string;
  meta_description: string;
  rich_description: string;
  selling_points: string[];
  schema_json_ld: Record<string, unknown>;
}

// Vietnamese accents remover for slug/regex
export function removeVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * 1. Regex & NLP Parser for raw message text (Zalo, Facebook, SMS).
 */
export function parseQuickPropertyText(rawText: string): QuickParsedProperty {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const noAccents = removeVietnameseAccents(lower);

  // 1. Transaction Type
  let transaction_type: 'Bán' | 'Cho thuê' = 'Bán';
  if (/cho\s*thuê|cần\s*cho\s*thuê|cho\s*mướn|tìm\s*người\s*thuê/i.test(lower)) {
    transaction_type = 'Cho thuê';
  }

  // 2. Property Type
  let type: QuickParsedProperty['type'] = 'Đất nền';
  if (/nhà\s*phố|nhà\s*mặt\s*tiền|nhà\s*kiệt|nhà\s*mới|nhà\s*\d+\s*tầng/i.test(lower)) {
    type = 'Nhà Phố';
  } else if (/căn\s*hộ|chung\s*cư|condo|studio/i.test(lower)) {
    type = 'Căn Hộ';
  } else if (/shophouse|nhà\s*phố\s*thương\s*mại/i.test(lower)) {
    type = 'Shophouse';
  } else if (/biệt\s*thự|villa/i.test(lower)) {
    type = 'Biệt thự';
  } else if (/kho\s*xưởng|kho\s*bãi|xưởng/i.test(lower)) {
    type = 'Kho xưởng';
  } else if (/khách\s*sạn|hotel|homestay/i.test(lower)) {
    type = 'Khách sạn';
  } else if (/đất|lô\s*đất|quỹ\s*đất|nền/i.test(lower)) {
    type = 'Đất nền';
  }

  // 3. Project Name
  let project_name = 'Nam Hòa Xuân';
  if (/nam\s*hòa\s*xuân/i.test(lower)) {
    project_name = 'Nam Hòa Xuân';
  } else if (/hòa\s*xuân/i.test(lower)) {
    project_name = 'Hòa Xuân';
  } else if (/fpt(?:\s*city)?/i.test(lower)) {
    project_name = 'FPT City';
  } else if (/hòa\s*quý/i.test(lower)) {
    project_name = 'Hòa Quý';
  } else if (/sun\s*cosmo/i.test(lower)) {
    project_name = 'Sun Cosmo Residence';
  } else if (/sun\s*symphony/i.test(lower)) {
    project_name = 'Sun Symphony Residence';
  } else if (/kim\s*long/i.test(lower)) {
    project_name = 'Kim Long City';
  } else if (/bàu\s*tràm|lakeside/i.test(lower)) {
    project_name = 'Bàu Tràm Lakeside';
  } else if (/ngũ\s*hành\s*sơn/i.test(lower)) {
    project_name = 'Ngũ Hành Sơn';
  } else if (/cẩm\s*lệ/i.test(lower)) {
    project_name = 'Cẩm Lệ';
  } else if (/sơn\s*trà/i.test(lower)) {
    project_name = 'Sơn Trà';
  } else if (/hải\s*châu/i.test(lower)) {
    project_name = 'Hải Châu';
  }

  // 4. Block
  let block = '';
  const blockMatch = text.match(/(?:block\s*|b\s*|khu\s*)([1234][\.\-_][\d]{1,3}|[a-z][\d]{1,2}[\.\-_][\d]{1,3}|[a-z][\d]{1,3})\b/i);
  if (blockMatch) {
    block = blockMatch[1].toUpperCase().replace(/[\._]/g, '-');
    if (!block.startsWith('B') && /^[1234]-/.test(block)) {
      block = `B${block}`;
    }
  } else {
    // Try catching standalone B2-xx or B1-yy
    const directBlock = text.match(/\b(B[1234][\-_]\d{1,3})\b/i);
    if (directBlock) {
      block = directBlock[1].toUpperCase().replace('_', '-');
    }
  }

  // 5. Lot
  let lot = '';
  const lotMatch = text.match(/(?:lô\s*(?:số\s*)?|l\s*)([\d]{1,3}[a-z]?|[\d]{1,2}x)\b/i);
  if (lotMatch) {
    lot = lotMatch[1];
  }

  // 6. Street / Road Width
  let street = '';
  let road_width = 7.5;
  const roadMatch = text.match(/(?:đường\s*)?(\d+(?:[.,]\d+)?)\s*m(?:ét)?\b/i);
  if (roadMatch) {
    road_width = parseFloat(roadMatch[1].replace(',', '.'));
  }

  // Common street names in Da Nang
  const streetNames = [
    'Minh Mạng', 'Nguyễn Phước Lan', 'Võ Chí Công', 'Bùi Tá Hán', 'Lê Quảng Chí',
    'Mai Đăng Chơn', 'Trần Hưng Đạo', 'Bạch Đằng', 'Phạm Văn Đồng', 'Võ Nguyên Giáp',
    'Hoàng Sa', 'Trường Sa', 'Nguyễn Tất Thành', 'Nguyễn Sinh Cung', 'Lê Thanh Nghị',
    '29 Tháng 3', '29/3', 'Nguyễn Hữu Thọ', 'Quảng Nam', 'Trần Nam Trung'
  ];
  for (const sName of streetNames) {
    if (lower.includes(sName.toLowerCase())) {
      street = sName;
      break;
    }
  }
  if (!street && road_width) {
    street = `Đường ${road_width}m`;
  }

  // 7. Area (m2)
  let area = 100;
  const areaMatch = text.match(/(?:dt|diện\s*tích|d\s*t)?\s*[:=\s]?\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²|mét\s*vuông)\b/i);
  if (areaMatch) {
    area = parseFloat(areaMatch[1].replace(',', '.'));
  } else {
    // Look for standard dimensions e.g. 5x20, 5 x 20
    const dimMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*[x*×]\s*(\d+(?:[.,]\d+)?)\b/i);
    if (dimMatch) {
      const w = parseFloat(dimMatch[1].replace(',', '.'));
      const l = parseFloat(dimMatch[2].replace(',', '.'));
      if (w > 0 && l > 0 && w < 100 && l < 100) {
        area = Math.round(w * l * 10) / 10;
      }
    }
  }

  // 8. Direction (Hướng)
  let direction = 'Đông Nam';
  if (/đông\s*nam/i.test(lower)) {
    direction = 'Đông Nam';
  } else if (/tây\s*nam/i.test(lower)) {
    direction = 'Tây Nam';
  } else if (/đông\s*bắc/i.test(lower)) {
    direction = 'Đông Bắc';
  } else if (/tây\s*bắc/i.test(lower)) {
    direction = 'Tây Bắc';
  } else if (/hướng\s*đông\b|h\.đông\b|chính\s*đông/i.test(lower)) {
    direction = 'Đông';
  } else if (/hướng\s*tây\b|h\.tây\b|chính\s*tây/i.test(lower)) {
    direction = 'Tây';
  } else if (/hướng\s*nam\b|h\.nam\b|chính\s*nam/i.test(lower)) {
    direction = 'Nam';
  } else if (/hướng\s*bắc\b|h\.bắc\b|chính\s*bắc/i.test(lower)) {
    direction = 'Bắc';
  }

  // 9. Price (quy chuẩn về tỷ VND)
  let price = 0;
  // Match "3.85 tỷ", "3 tỷ 850", "3t85", "3,85 tỷ", "950 triệu"
  const tyMatch = text.match(/(?:giá|chỉ)?\s*[:=\s]?\s*(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty|t|ti)\s*(\d{1,3})?\b/i);
  if (tyMatch) {
    const main = parseFloat(tyMatch[1].replace(',', '.'));
    const rem = tyMatch[2] ? parseFloat(`0.${tyMatch[2]}`) : 0;
    price = Math.round((main + rem) * 100) / 100;
  } else {
    const trMatch = text.match(/(?:giá|chỉ)?\s*[:=\s]?\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|tr|trđ)\b/i);
    if (trMatch) {
      const millions = parseFloat(trMatch[1].replace(',', '.'));
      price = Math.round((millions / 1000) * 100) / 100;
    }
  }

  // 10. Legal Status
  let legal_status = 'Sổ hồng riêng';
  if (/sổ\s*đỏ|sổ\s*hồng\s*sẵn|sẵn\s*sổ|công\s*chứng\s*ngay/i.test(lower)) {
    legal_status = 'Sổ hồng riêng sẵn sàng';
  } else if (/hợp\s*đồng\s*mua\s*bán|hđmb/i.test(lower)) {
    legal_status = 'Hợp đồng mua bán (HĐMB)';
  } else if (/chờ\s*sổ|đang\s*ra\s*sổ/i.test(lower)) {
    legal_status = 'Đang chờ cấp sổ';
  }

  // 11. Contact Phone
  let contact_phone = '';
  const phoneMatch = text.match(/(?:0|\+84)(?:3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])[\d\.\-\s]{7,10}\b/);
  if (phoneMatch) {
    contact_phone = phoneMatch[0].replace(/[\.\-\s]/g, '');
  }

  // 12. Location summary
  let location = `${project_name}, Đà Nẵng`;
  if (street) {
    location = `${street}, ${project_name}, Đà Nẵng`;
  }

  // 13. Auto-SEO Title Format:
  // [Loại hình] [Vị trí/Block] [Tên dự án] - [Tuyến đường] - [Diện tích]m² - Giá [Giá]
  const blockPart = block ? (lot ? `${block} Lô ${lot}` : block) : '';
  const locationProjectPart = blockPart ? `${blockPart} ${project_name}` : project_name;
  const streetPart = street ? ` - ${street}` : '';
  const areaPart = area ? ` - ${area}m²` : '';
  const priceDisplay = price > 0 ? `${price} tỷ` : 'Thỏa thuận';
  const pricePart = ` - Giá ${priceDisplay}`;

  const title = `${type} ${locationProjectPart}${streetPart}${areaPart}${pricePart}`.replace(/\s+/g, ' ').trim();
  const seo_title = `${title} | House & Life Đà Nẵng`.slice(0, 70);

  // 14. SEO Slug
  const rawSlugBase = `${type} ${blockPart || ''} ${project_name} ${street} ${area}m2 ${price > 0 ? `${price} ty` : ''}`;
  const slug = slugify(rawSlugBase);

  // 15. Meta Description (150 - 160 chars)
  const meta_description = `${type} tại ${locationProjectPart}${streetPart}, diện tích ${area}m², hướng ${direction}, ${legal_status}. Giá bán ${priceDisplay}. Hỗ trợ xem thực tế và công chứng 24/7.`.slice(0, 160);

  // 16. Auto Article Description (200 - 300 words unique copy)
  const rich_description = generateUniquePropertyDescription({
    type,
    transaction_type,
    project_name,
    block,
    lot,
    street,
    road_width,
    area,
    direction,
    price,
    legal_status,
    contact_phone,
  });

  // 17. Selling points
  const selling_points: string[] = [
    `Vị trí chiến lược tại ${project_name}, hạ tầng hoàn thiện đồng bộ`,
    block ? `Lô đất thuộc Block ${block}${lot ? `, Lô số ${lot}` : ''} vị trí đẹp, phong thủy vượng khí` : `Khu dân cư hiện hữu, an ninh tốt`,
    `Tuyến đường ${road_width}m lề rộng thoáng, ô tô ra vào đỗ thoải mái`,
    `Pháp lý minh bạch: ${legal_status}, sang tên công chứng ngay`,
    `Giá bán tốt nhất phân khúc: ${priceDisplay}, tính thanh khoản cao`,
  ];

  // 18. JSON-LD Schema
  const schema_json_ld = generatePropertyJsonLd({
    title,
    type,
    area,
    price,
    location,
    slug,
  });

  return {
    type,
    transaction_type,
    project_name,
    location,
    block,
    lot,
    street,
    road_width,
    area,
    price,
    direction,
    legal_status,
    contact_phone,
    title,
    slug,
    seo_title,
    meta_description,
    rich_description,
    selling_points,
    schema_json_ld,
  };
}

/**
 * 2. Generate unique 200-300 word description for SEO rich content.
 * Prevents Google's thin content and duplicate content penalties.
 */
export function generateUniquePropertyDescription(data: {
  type: string;
  transaction_type: string;
  project_name: string;
  block?: string;
  lot?: string;
  street?: string;
  road_width?: number;
  area: number;
  direction: string;
  price: number;
  legal_status: string;
  contact_phone?: string;
}): string {
  const {
    type,
    transaction_type,
    project_name,
    block,
    lot,
    street,
    road_width = 7.5,
    area,
    direction,
    price,
    legal_status,
    contact_phone,
  } = data;

  const priceText = price > 0 ? `${price} tỷ` : 'thỏa thuận trực tiếp';
  const blockText = block ? `tại Block ${block}${lot ? `, lô số ${lot}` : ''}` : '';
  const roadText = street || `đường quy hoạch ${road_width}m`;

  return `Bất động sản House & Life hân hạnh giới thiệu sản phẩm ${type.toLowerCase()} vị trí đắc địa ${blockText} thuộc khu đô thị sinh thái ${project_name}, Đà Nẵng. Đây là một trong những khu vực bất động sản trọng điểm có tốc độ phát triển và gia tăng giá trị hàng đầu khu vực Nam Đà Nẵng.

Thông tin chi tiết sản phẩm:
- Loại hình bất động sản: ${type} (${transaction_type.toLowerCase()})
- Vị trí: ${block ? `Block ${block}` : ''} ${project_name}, hướng ${direction} đón gió sinh thái thoáng mát
- Diện tích chuẩn quy hoạch: ${area} m² (khuôn viên vuông vắn, bề ngang tiêu chuẩn dễ thiết kế xây dựng)
- Hạ tầng giao thông: Mặt tiền ${roadText}, vỉa hè rộng rãi, kết nối thông suốt ra các trục đường huyết mạch
- Pháp lý hiện trạng: ${legal_status}, hồ sơ đầy đủ, sẵn sàng giao dịch công chứng sang tên ngay
- Mức giá chào bán: ${priceText} (mức giá cực kỳ hấp dẫn, biên độ tăng giá và tỷ suất sinh lời vượt trội)

Lợi thế đầu tư & an cư:
Sản phẩm tọa lạc tại vị trí trung tâm, liền kề hệ thống công viên cây xanh, trường học các cấp và cụm tiện ích thương mại dịch vụ hiện đại. Khí hậu ven sông trong lành, cộng đồng dân cư văn minh tri thức tạo nên không gian sống lý tưởng bậc nhất Đà Nẵng. Đối với các nhà đầu tư, đây là tài sản có tính thanh khoản cao, dễ dàng chuyển nhượng hoặc xây dựng khai thác cho thuê sinh dòng tiền ổn định.

Quý khách hàng quan tâm xem thực tế vị trí và thương lượng trực tiếp, vui lòng liên hệ House & Life qua Hotline/Zalo${contact_phone ? ` ${contact_phone}` : ' 0905.777.594'} để được hỗ trợ thủ tục pháp lý trọn gói và thương lượng giá tốt nhất!`.trim();
}

/**
 * 3. Generate Schema.org JSON-LD (RealEstateListing / SingleFamilyResidence).
 */
export function generatePropertyJsonLd(data: {
  title: string;
  type: string;
  area: number;
  price: number;
  location: string;
  slug: string;
}): Record<string, unknown> {
  const schemaType =
    data.type === 'Nhà Phố' || data.type === 'Biệt thự'
      ? 'SingleFamilyResidence'
      : 'RealEstateListing';

  const priceVnd = data.price > 0 ? Math.round(data.price * 1_000_000_000) : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: data.title,
    description: `${data.title} tại ${data.location}. Diện tích ${data.area}m2. Pháp lý minh bạch, giao dịch an toàn.`,
    url: `https://bdsdanang.site/p/${data.slug}`,
    ...(priceVnd
      ? {
          offers: {
            '@type': 'Offer',
            price: priceVnd,
            priceCurrency: 'VND',
            availability: 'https://schema.org/InStock',
            validFrom: new Date().toISOString().slice(0, 10),
          },
        }
      : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Đà Nẵng',
      addressRegion: 'Đà Nẵng',
      addressCountry: 'VN',
      streetAddress: data.location,
    },
    floorSize: {
      '@type': 'QuantitativeValue',
      value: data.area,
      unitCode: 'MTK',
    },
  };
}
