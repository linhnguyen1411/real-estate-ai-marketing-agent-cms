import { PageType } from '../types/PageType';
import type { FaqItem, FaqSet } from '../types/SeoContent';

function item(
  id: string,
  question: string,
  answer: string,
  opts: Partial<Pick<FaqItem, 'entityIds' | 'pageTypes' | 'schemaEligible'>> = {},
): FaqItem {
  return {
    id,
    question,
    answer,
    entityIds: opts.entityIds,
    pageTypes: opts.pageTypes,
    schemaEligible: opts.schemaEligible !== false,
  };
}

/**
 * Reusable FAQ definitions — migrated from portfolioHub / landingPages shared FAQs.
 */
export const FAQ_SETS: FaqSet[] = [
  {
    id: 'faq-sun-default',
    entityIds: ['entity-sun-group'],
    pageTypes: [PageType.PROJECT],
    items: [
      item(
        'faq-sun-default-1',
        'Làm sao nhận bảng giá căn Sun Group đang mở bán?',
        'Liên hệ hotline hoặc Zalo — chúng tôi gửi giỏ hàng ngoại giao và căn thứ cấp phù hợp ngân sách, kèm pháp lý sơ bộ.',
        { entityIds: ['entity-sun-group'], pageTypes: [PageType.PROJECT] },
      ),
    ],
  },
  {
    id: 'faq-sun-symphony',
    entityIds: ['entity-sun-symphony'],
    pageTypes: [PageType.PROJECT],
    items: [
      item(
        'faq-sun-symphony-1',
        'Sun Symphony khác các tòa S Light / Spana thế nào?',
        'Mỗi tòa có vị trí, view và chính sách cho thuê khác nhau. Cần so sánh giá/m², phí quản lý và thanh khoản thứ cấp trước khi chọn.',
        { entityIds: ['entity-sun-symphony', 'entity-s-light-tower', 'entity-spana-tower'], pageTypes: [PageType.PROJECT, PageType.COMPARISON] },
      ),
      item(
        'faq-sun-symphony-2',
        'Làm sao nhận bảng giá căn Sun Group đang mở bán?',
        'Liên hệ hotline hoặc Zalo — chúng tôi gửi giỏ hàng ngoại giao và căn thứ cấp phù hợp ngân sách, kèm pháp lý sơ bộ.',
        { entityIds: ['entity-sun-group'], pageTypes: [PageType.PROJECT] },
      ),
    ],
  },
  {
    id: 'faq-sun-cosmo',
    entityIds: ['entity-sun-cosmo'],
    pageTypes: [PageType.PROJECT],
    items: [
      item(
        'faq-sun-cosmo-1',
        'Sun Cosmo cho thuê có ổn không?',
        'Tùy tầng, view và nội thất. Cần tính yield ròng sau phí quản lý và mùa thấp điểm du lịch.',
        { entityIds: ['entity-sun-cosmo'], pageTypes: [PageType.PROJECT, PageType.FINANCIAL] },
      ),
      item(
        'faq-sun-cosmo-2',
        'Làm sao nhận bảng giá căn Sun Group đang mở bán?',
        'Liên hệ hotline hoặc Zalo — chúng tôi gửi giỏ hàng ngoại giao và căn thứ cấp phù hợp ngân sách, kèm pháp lý sơ bộ.',
        { entityIds: ['entity-sun-group'], pageTypes: [PageType.PROJECT] },
      ),
    ],
  },
  {
    id: 'faq-sun-ponte',
    entityIds: ['entity-sun-ponte'],
    pageTypes: [PageType.PROJECT],
    items: [
      item(
        'faq-sun-ponte-1',
        'Làm sao nhận bảng giá căn Sun Group đang mở bán?',
        'Liên hệ hotline hoặc Zalo — chúng tôi gửi giỏ hàng ngoại giao và căn thứ cấp phù hợp ngân sách, kèm pháp lý sơ bộ.',
        { entityIds: ['entity-sun-group'], pageTypes: [PageType.PROJECT] },
      ),
    ],
  },
  {
    id: 'faq-nam-da-nang',
    entityIds: ['entity-nam-da-nang'],
    pageTypes: [PageType.PROJECT, PageType.LOCATION],
    items: [
      item(
        'faq-nam-da-nang-1',
        'Nam Đà Nẵng nên ưu tiên loại hình nào?',
        'Tùy vốn và mục tiêu: đất nền/nhà phố cho tích sản dài hạn; kho xưởng hoặc khách sạn cho dòng tiền thương mại. Nên thẩm định pháp lý từng lô.',
        { entityIds: ['entity-nam-da-nang'], pageTypes: [PageType.LOCATION, PageType.PROJECT] },
      ),
      item(
        'faq-nam-da-nang-2',
        'Mai Đăng Chơn thuộc phân khúc nào?',
        'Mai Đăng Chơn nằm trong danh mục BĐS Nam Đà Nẵng — quỹ đất mặt tiền và nhà phố thương mại, không tách riêng như dự án Sun Group.',
        { entityIds: ['entity-mai-dang-chon', 'entity-nam-da-nang'], pageTypes: [PageType.LOCATION] },
      ),
    ],
  },
  {
    id: 'faq-bds-noi-bat',
    entityIds: ['entity-bds-noi-bat'],
    pageTypes: [PageType.PROJECT],
    items: [
      item(
        'faq-bds-noi-bat-1',
        'BĐS nổi bật khác danh mục Sun Group / Nam Đà Nẵng thế nào?',
        'Sun Group và Nam Đà Nẵng là hai trụ cột có định hướng rõ. BĐS nổi bật gom các deal đặc biệt — giá tốt, cắt lỗ, hoặc vị trí độc đáo — từ nhiều nơi, kể cả ngoài Nam Đà Nẵng.',
        { entityIds: ['entity-bds-noi-bat', 'entity-sun-group', 'entity-nam-da-nang'], pageTypes: [PageType.PROJECT] },
      ),
      item(
        'faq-bds-noi-bat-2',
        'Làm sao xem danh sách BĐS nổi bật hiện tại?',
        'Vào trang Bất động sản hoặc liên hệ Zalo để nhận danh sách cập nhật theo ngân sách và loại hình bạn quan tâm.',
        { entityIds: ['entity-bds-noi-bat'], pageTypes: [PageType.PROJECT, PageType.CATALOG] },
      ),
    ],
  },
  {
    id: 'faq-investor-base',
    entityIds: ['entity-da-nang'],
    pageTypes: [PageType.ARTICLE, PageType.FINANCIAL],
    items: [
      item(
        'faq-investor-base-1',
        'Nhà đầu tư nên bắt đầu từ đâu khi mua BĐS Đà Nẵng?',
        'Nên xác định mục tiêu (ở, cho thuê hay tích lũy), ngân sách và thời gian nắm giữ. Sau đó chọn 2–3 khu vực trọng điểm (Nam Đà Nẵng, FPT City, ven biển) và yêu cầu danh sách sản phẩm có pháp lý rõ để so sánh trước khi xuống Đà Nẵng khảo sát.',
        { entityIds: ['entity-da-nang', 'entity-nam-da-nang'], pageTypes: [PageType.ARTICLE] },
      ),
      item(
        'faq-investor-base-2',
        'Mua BĐS Đà Nẵng từ xa có an toàn không?',
        'Có thể an toàn nếu làm việc với đơn vị tư vấn uy tín, kiểm tra pháp lý tại Sở Tư pháp, xem hình ảnh thực tế và ký hợp đồng qua luật sư. Estoria hỗ trợ checklist pháp lý và lịch khảo sát trực tiếp cho nhà đầu tư.',
        { entityIds: ['entity-da-nang'], pageTypes: [PageType.ARTICLE] },
      ),
      item(
        'faq-investor-base-3',
        'Làm sao nhận danh sách cơ hội đầu tư?',
        'Điền form bên dưới để nhận danh sách cơ hội đầu tư Đà Nẵng được lọc theo ngân sách và mục tiêu — không spam, tư vấn 1-1.',
        { entityIds: ['entity-da-nang'], pageTypes: [PageType.ARTICLE, PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-shophouse-hub',
    entityIds: ['entity-shophouse-sun', 'entity-sun-group'],
    pageTypes: [PageType.CATALOG, PageType.FINANCIAL],
    items: [
      item(
        'faq-shophouse-hub-1',
        'Shophouse khối đế Sun khác căn hộ Sun thế nào?',
        'Shophouse khối đế nằm tầng thương mại, tối ưu mặt tiền và dòng tiền thuê; căn hộ thiên về ở / cho thuê dài hạn. Nên so sánh ROI, vốn ban đầu và khẩu vị vận hành trước khi chọn.',
        { entityIds: ['entity-shophouse-sun', 'entity-can-ho'], pageTypes: [PageType.CATALOG, PageType.COMPARISON] },
      ),
      item(
        'faq-shophouse-hub-2',
        'Estoria hỗ trợ đầu tư shophouse Sun những gì?',
        'Gửi bảng giá / giỏ hàng thứ cấp, mô phỏng dòng tiền, checklist pháp lý và kết nối khảo sát thực tế tại Đà Nẵng — không cam kết lợi nhuận.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.CATALOG, PageType.FINANCIAL] },
      ),
      item(
        'faq-shophouse-hub-3',
        'Nên bắt đầu từ trang nào khi tìm shophouse Sun?',
        'Bắt đầu từ hub Shophouse Sun Đà Nẵng, rồi đi sâu giá, dòng tiền, pháp lý hoặc so sánh với căn hộ tùy mục tiêu đầu tư.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.CATALOG] },
      ),
    ],
  },
  {
    id: 'faq-gia-shophouse',
    entityIds: ['entity-shophouse-sun'],
    pageTypes: [PageType.FINANCIAL],
    items: [
      item(
        'faq-gia-shophouse-1',
        'Giá shophouse Sun Symphony lấy theo đâu?',
        'Tham chiếu giỏ ngoại giao / thứ cấp thực tế, vị trí mặt tiền, diện tích và tiến độ thanh toán — liên hệ để nhận bảng giá cập nhật theo ngân sách.',
        { entityIds: ['entity-shophouse-sun', 'entity-sun-symphony'], pageTypes: [PageType.FINANCIAL] },
      ),
      item(
        'faq-gia-shophouse-2',
        'Giá sơ cấp và thứ cấp khác nhau thế nào?',
        'Sơ cấp theo chính sách chủ đầu tư; thứ cấp phản ánh thanh khoản thị trường. Cần so sánh tổng chi phí vào và khả năng cho thuê trước khi chốt.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-khoi-de-symphony',
    entityIds: ['entity-shophouse-sun', 'entity-sun-symphony'],
    pageTypes: [PageType.PROJECT],
    items: [
      item(
        'faq-khoi-de-1',
        'Shophouse khối đế Sun Symphony phù hợp mô hình kinh doanh nào?',
        'Thường phù hợp F&B, dịch vụ, showroom nhỏ hoặc cho thuê dài hạn — tùy vị trí mặt tiền và quy hoạch vận hành dự án.',
        { entityIds: ['entity-sun-symphony'], pageTypes: [PageType.PROJECT] },
      ),
      item(
        'faq-khoi-de-2',
        'Có nên mua khối đế để tích sản dài hạn?',
        'Có thể nếu chấp nhận vốn lớn hơn căn hộ và chủ động vận hành/cho thuê. Cần thẩm định pháp lý và kịch bản dòng tiền trước.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.PROJECT, PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-dau-tu-shophouse',
    entityIds: ['entity-shophouse-sun'],
    pageTypes: [PageType.FINANCIAL],
    items: [
      item(
        'faq-dau-tu-shophouse-1',
        'ROI shophouse Sun Đà Nẵng kỳ vọng ra sao?',
        'ROI phụ thuộc giá vào, tỷ lệ lấp đầy và chi phí vận hành. Dùng kịch bản thận trọng / cơ sở / lạc quan thay vì một con số marketing.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
      item(
        'faq-dau-tu-shophouse-2',
        'Rủi ro chính khi đầu tư shophouse khối đế?',
        'Vốn lớn, thanh khoản chậm hơn căn hộ, phụ thuộc khách thuê và quy định vận hành dự án. Cần checklist pháp lý và khảo sát thực tế.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-dong-tien-shophouse',
    entityIds: ['entity-shophouse-sun'],
    pageTypes: [PageType.FINANCIAL],
    items: [
      item(
        'faq-dong-tien-1',
        'Cách ước tính dòng tiền shophouse khối đế?',
        'Lấy giá thuê kỳ vọng × tỷ lệ lấp đầy − phí quản lý − thuế/chi phí vận hành. So với vốn tự có và lãi vay nếu có.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
      item(
        'faq-dong-tien-2',
        'Lợi nhuận shophouse Sun ổn định hơn căn hộ?',
        'Không mặc định. Shophouse có thể cao hơn nếu thuê tốt, nhưng biến động theo mùa và chất lượng vận hành. Cần so sánh từng căn.',
        { entityIds: ['entity-shophouse-sun', 'entity-can-ho'], pageTypes: [PageType.FINANCIAL, PageType.COMPARISON] },
      ),
    ],
  },
  {
    id: 'faq-cho-thue-shophouse',
    entityIds: ['entity-shophouse-sun'],
    pageTypes: [PageType.FINANCIAL],
    items: [
      item(
        'faq-cho-thue-1',
        'Cho thuê shophouse Sun nên ký hợp đồng bao lâu?',
        'Thường 1–3 năm tùy ngành thuê. Ưu tiên điều khoản tăng giá thuê, đặt cọc và trách nhiệm cải tạo rõ ràng.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
      item(
        'faq-cho-thue-2',
        'Đối tượng thuê phổ biến là ai?',
        'F&B, dịch vụ cá nhân, văn phòng nhỏ hoặc thương hiệu local — tùy vị trí mặt tiền và mật độ dân cư quanh dự án.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-phap-ly-shophouse',
    entityIds: ['entity-shophouse-sun'],
    pageTypes: [PageType.LEGAL],
    items: [
      item(
        'faq-phap-ly-1',
        'Pháp lý shophouse Sun cần kiểm tra những gì?',
        'Loại hình sở hữu, tiến độ sổ, nghĩa vụ phí quản lý, quy định kinh doanh tại khối đế và điều khoản chuyển nhượng.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.LEGAL] },
      ),
      item(
        'faq-phap-ly-2',
        'Estoria có cam kết pháp lý không?',
        'Không. Thông tin mang tính tham khảo; nhà đầu tư nên kiểm tra hồ sơ gốc và/hoặc luật sư trước giao dịch.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.LEGAL] },
      ),
    ],
  },
  {
    id: 'faq-tt-shophouse',
    entityIds: ['entity-shophouse-sun'],
    pageTypes: [PageType.FINANCIAL],
    items: [
      item(
        'faq-tt-1',
        'Chính sách thanh toán shophouse Sun gồm những gì?',
        'Thường có lịch tạm ứng / theo tiến độ / bàn giao. Cần làm rõ lãi chậm, điều kiện vay và ưu đãi ngoại giao nếu có.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
      item(
        'faq-tt-2',
        'Có hỗ trợ vay ngân hàng cho shophouse không?',
        'Tùy ngân hàng và hồ sơ tài sản. Estoria hỗ trợ định hướng giấy tờ; phê duyệt thuộc ngân hàng.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-bang-gia-can-ho-sun',
    entityIds: ['entity-can-ho', 'entity-sun-group'],
    pageTypes: [PageType.FINANCIAL],
    items: [
      item(
        'faq-bang-gia-can-ho-1',
        'Bảng giá căn hộ Sun Đà Nẵng cập nhật thế nào?',
        'Theo giỏ hàng thực tế Symphony / Cosmo / Ponte (sơ cấp & thứ cấp). Liên hệ để nhận bảng giá theo ngân sách và mục tiêu.',
        { entityIds: ['entity-can-ho', 'entity-sun-group'], pageTypes: [PageType.FINANCIAL] },
      ),
      item(
        'faq-bang-gia-can-ho-2',
        'Giá căn hộ có gồm phí quản lý không?',
        'Giá niêm yết thường là giá chuyển nhượng; phí quản lý và nội thất tính riêng. Cần hỏi rõ từng căn.',
        { entityIds: ['entity-can-ho'], pageTypes: [PageType.FINANCIAL] },
      ),
    ],
  },
  {
    id: 'faq-can-ho-sun-group',
    entityIds: ['entity-can-ho', 'entity-sun-group'],
    pageTypes: [PageType.CATALOG],
    items: [
      item(
        'faq-can-ho-sun-1',
        'Căn hộ Sun Group Đà Nẵng nào đáng đầu tư?',
        'Phụ thuộc yield, thanh khoản và ngân sách. So sánh Symphony / Cosmo / Ponte theo vị trí, view và chính sách thanh toán.',
        { entityIds: ['entity-can-ho', 'entity-sun-symphony'], pageTypes: [PageType.CATALOG] },
      ),
      item(
        'faq-can-ho-sun-2',
        'Nên chọn căn hộ hay shophouse Sun?',
        'Căn hộ dễ vận hành hơn; shophouse cần vốn lớn hơn và quản trị thuê chủ động. Xem trang so sánh để chọn theo khẩu vị.',
        { entityIds: ['entity-can-ho', 'entity-shophouse-sun'], pageTypes: [PageType.CATALOG, PageType.COMPARISON] },
      ),
    ],
  },
  {
    id: 'faq-so-sanh-shop-can',
    entityIds: ['entity-shophouse-sun', 'entity-can-ho'],
    pageTypes: [PageType.COMPARISON],
    items: [
      item(
        'faq-so-sanh-1',
        'Khi nào chọn shophouse thay vì căn hộ Sun?',
        'Khi ưu tiên mặt tiền thương mại và chấp nhận vốn / vận hành cao hơn để săn dòng tiền thuê.',
        { entityIds: ['entity-shophouse-sun'], pageTypes: [PageType.COMPARISON] },
      ),
      item(
        'faq-so-sanh-2',
        'Khi nào căn hộ Sun phù hợp hơn?',
        'Khi muốn thanh khoản linh hoạt hơn, vốn thấp hơn và mô hình cho thuê đơn giản hơn shophouse khối đế.',
        { entityIds: ['entity-can-ho'], pageTypes: [PageType.COMPARISON] },
      ),
    ],
  },
];

const BY_ID = new Map(FAQ_SETS.map(set => [set.id, set]));

export function getFaqSetRecord(id: string): FaqSet | undefined {
  return BY_ID.get(id);
}

/** Shape compatible with existing portfolioHub / landingPages FAQ arrays. */
export function getFaqQaPairs(faqSetId: string): { question: string; answer: string }[] {
  const set = BY_ID.get(faqSetId);
  if (!set) return [];
  return set.items.map(({ question, answer }) => ({ question, answer }));
}

export function listFaqSetRecords(): readonly FaqSet[] {
  return FAQ_SETS;
}
