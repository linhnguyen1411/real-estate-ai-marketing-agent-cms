/**
 * @deprecated LEGACY — Phase 28. Do not use for public content.
 * Use Admin CMS or npm run migrate:legacy-posts to import into DB.
 */
import { buildArticleContent, SeoPostSeed, DEFAULT_COVER } from './contentBuilder';
import { getPostArticle } from './postArticles';
import {
  getClusterRelatedSlugs,
  getLeadMagnetLinkForSlug,
  getPillarLinkForSlug,
  getRelatedAreaLinksForSlug,
  getRelatedProjectLinksForSlug,
  LinkItem,
} from '../../src/seo/internalLinkGraph';

type CategorySlug = 'kien-thuc-dau-tu' | 'tin-thi-truong' | 'phan-tich' | 'review-khu-vuc';
type LinkGroup = 'none' | 'fpt' | 'mai-dang-chon';

interface PostBlueprint {
  title: string;
  slug: string;
  categorySlug: CategorySlug;
  tags: string[];
  focus: string;
  marketAngle: string;
  excerpt: string;
  linkGroup: LinkGroup;
}

const FPT_CITY_LINKS = [{ label: 'Phân tích FPT City', href: '/dau-tu-fpt-city' }];
const MAI_DANG_CHON_LINKS = [{ label: 'BĐS Nam Đà Nẵng', href: '/du-an/nam-da-nang' }];

const fitText = (text: string, max: number) => {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
};

const pickLinks = (group: LinkGroup) => {
  if (group === 'fpt') {
    return FPT_CITY_LINKS;
  }
  if (group === 'mai-dang-chon') {
    return MAI_DANG_CHON_LINKS;
  }
  return undefined;
};

const POSTS: PostBlueprint[] = [
  {
    title: 'Nhà đầu tư Hà Nội nên mua gì ở Đà Nẵng năm 2026?',
    slug: 'nha-dau-tu-ha-noi-nen-mua-gi-o-da-nang-2026',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['nha-dau-tu-ha-noi', 'dau-tu-da-nang', 'chien-luoc-2026'],
    focus: 'lựa chọn sản phẩm phù hợp nhà đầu tư Hà Nội',
    marketAngle: 'sự chênh lệch giữa giá chào, giá khớp và tốc độ hấp thụ',
    excerpt:
      'Phân tích nhóm tài sản phù hợp cho nhà đầu tư Hà Nội tại Đà Nẵng 2026: đất nền, căn hộ, tài sản dòng tiền và cách thẩm định để giảm rủi ro khi đầu tư từ xa.',
    linkGroup: 'none',
  },
  {
    title: 'Vì sao nhà đầu tư phía Bắc đang quan tâm Nam Đà Nẵng?',
    slug: 'vi-sao-nha-dau-tu-phia-bac-quan-tam-nam-da-nang',
    categorySlug: 'tin-thi-truong',
    tags: ['nam-da-nang', 'tin-thi-truong', 'nha-dau-tu-phia-bac'],
    focus: 'làn sóng quan tâm Nam Đà Nẵng từ nhà đầu tư phía Bắc',
    marketAngle: 'tốc độ hình thành dân cư mới và trục kết nối vùng',
    excerpt:
      'Giải mã lý do Nam Đà Nẵng thu hút nhà đầu tư phía Bắc: câu chuyện hạ tầng, mặt bằng giá, khả năng cho thuê và các tiêu chí cần thẩm định trước khi quyết định.',
    linkGroup: 'none',
  },
  {
    title: 'Đầu tư Đà Nẵng 2026: nên chọn đất nền, căn hộ hay tài sản dòng tiền?',
    slug: 'dau-tu-da-nang-2026-dat-nen-can-ho-hay-dong-tien',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['dat-nen', 'can-ho-da-nang', 'tai-san-dong-tien'],
    focus: 'so sánh đất nền, căn hộ và tài sản tạo dòng tiền',
    marketAngle: 'sự khác nhau về chu kỳ vốn và độ linh hoạt thanh khoản',
    excerpt:
      'Bài toán chọn loại tài sản tại Đà Nẵng năm 2026 không chỉ là giá mua. Bài viết giúp so sánh đất nền, căn hộ và tài sản dòng tiền theo mục tiêu lợi nhuận và rủi ro.',
    linkGroup: 'none',
  },
  {
    title: 'Nhà đầu tư Hà Nội mua BĐS Đà Nẵng cần kiểm tra gì trước khi xuống tiền?',
    slug: 'nha-dau-tu-ha-noi-mua-bds-da-nang-can-kiem-tra-gi',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['tham-dinh-phap-ly', 'kiem-tra-bds', 'dau-tu-tu-xa'],
    focus: 'quy trình kiểm tra trước khi đặt cọc bất động sản',
    marketAngle: 'độ minh bạch pháp lý và khả năng khai thác sau mua',
    excerpt:
      'Danh sách kiểm tra dành cho nhà đầu tư Hà Nội khi mua bất động sản Đà Nẵng: pháp lý, quy hoạch, giá trị khai thác, dòng tiền và phương án thoát hàng an toàn.',
    linkGroup: 'none',
  },
  {
    title: '5 sai lầm thường gặp khi đầu tư bất động sản Đà Nẵng từ xa',
    slug: 'sai-lam-khi-dau-tu-bat-dong-san-da-nang-tu-xa',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['sai-lam-dau-tu', 'quan-tri-rui-ro', 'dau-tu-tu-xa'],
    focus: 'những sai lầm phổ biến khi đầu tư từ xa',
    marketAngle: 'chi phí ẩn và sai lệch thông tin tại điểm mua',
    excerpt:
      'Nhận diện 5 sai lầm khiến kế hoạch đầu tư từ xa vào Đà Nẵng kém hiệu quả: thiếu thẩm định, dùng đòn bẩy cao, kỳ vọng sai và bỏ qua kế hoạch quản trị vận hành.',
    linkGroup: 'none',
  },
  {
    title: 'Nam Đà Nẵng có còn dư địa tăng trưởng năm 2026?',
    slug: 'nam-da-nang-co-con-du-dia-tang-truong-2026',
    categorySlug: 'phan-tich',
    tags: ['du-dia-tang-truong', 'nam-da-nang', 'phan-tich-thi-truong'],
    focus: 'dư địa tăng trưởng của Nam Đà Nẵng năm 2026',
    marketAngle: 'nhịp mở rộng dân cư và mức độ hoàn thiện tiện ích',
    excerpt:
      'Đánh giá dư địa tăng trưởng Nam Đà Nẵng năm 2026 qua dữ liệu giá, nhu cầu thực, hạ tầng và thanh khoản để nhà đầu tư xây kế hoạch vốn phù hợp khẩu vị rủi ro.',
    linkGroup: 'none',
  },
  {
    title: '5 khu vực đáng chú ý nhất Nam Đà Nẵng cho nhà đầu tư',
    slug: '5-khu-vuc-dang-chu-y-nhat-nam-da-nang',
    categorySlug: 'review-khu-vuc',
    tags: ['review-khu-vuc', 'nam-da-nang', 'ban-do-dau-tu'],
    focus: '5 khu vực nổi bật tại Nam Đà Nẵng',
    marketAngle: 'sự khác biệt giữa hạ tầng, dân cư và mô hình khai thác',
    excerpt:
      'Review 5 khu vực đáng chú ý tại Nam Đà Nẵng với góc nhìn đầu tư thực tế: tiềm năng tăng giá, mức độ thanh khoản, nhu cầu thuê và các rủi ro cần thẩm định.',
    linkGroup: 'none',
  },
  {
    title: 'Trục FPT City - Làng Đại học - Non Nước dưới góc nhìn chuỗi giá trị',
    slug: 'truc-fpt-city-lang-dai-hoc-non-nuoc',
    categorySlug: 'phan-tich',
    tags: ['fpt-city', 'lang-dai-hoc', 'non-nuoc'],
    focus: 'trục liên kết FPT City - Làng Đại học - Non Nước',
    marketAngle: 'khả năng tạo nhu cầu ở thật và thuê thật theo cụm',
    excerpt:
      'Phân tích trục FPT City - Làng Đại học - Non Nước theo chuỗi giá trị đầu tư, từ hạ tầng, dân cư đến mô hình dòng tiền, giúp nhà đầu tư định vị chiến lược rõ ràng.',
    linkGroup: 'none',
  },
  {
    title: 'Đầu tư Nam Đà Nẵng: hạ tầng, dân cư và dòng tiền cần đọc thế nào?',
    slug: 'dau-tu-nam-da-nang-ha-tang-dan-cu-dong-tien',
    categorySlug: 'phan-tich',
    tags: ['ha-tang', 'dan-cu', 'dong-tien-cho-thue'],
    focus: 'mối liên hệ hạ tầng, dân cư và dòng tiền ở Nam Đà Nẵng',
    marketAngle: 'độ đồng pha giữa tiến độ hạ tầng và sức thuê thực tế',
    excerpt:
      'Cách đọc ba trụ cột hạ tầng - dân cư - dòng tiền khi đầu tư Nam Đà Nẵng để tránh kỳ vọng quá mức, đồng thời chọn tài sản phù hợp với mục tiêu nắm giữ trung hạn.',
    linkGroup: 'none',
  },
  {
    title: 'So sánh Nam Đà Nẵng và trung tâm Đà Nẵng dưới góc nhìn đầu tư',
    slug: 'so-sanh-nam-da-nang-va-trung-tam-da-nang',
    categorySlug: 'phan-tich',
    tags: ['so-sanh-khu-vuc', 'trung-tam-da-nang', 'nam-da-nang'],
    focus: 'so sánh Nam Đà Nẵng với khu trung tâm',
    marketAngle: 'biên lợi nhuận kỳ vọng đi kèm rủi ro thanh khoản',
    excerpt:
      'Bài so sánh Nam Đà Nẵng và khu trung tâm theo giá vốn, tốc độ tăng trưởng, khả năng cho thuê và áp lực thanh khoản để nhà đầu tư chọn chiến lược phù hợp.',
    linkGroup: 'none',
  },
  {
    title: 'FPT City Đà Nẵng có đáng đầu tư năm 2026?',
    slug: 'fpt-city-da-nang-co-dang-dau-tu-2026',
    categorySlug: 'phan-tich',
    tags: ['fpt-city', 'phan-tich-du-an', 'dau-tu-2026'],
    focus: 'mức độ hấp dẫn đầu tư tại FPT City năm 2026',
    marketAngle: 'khả năng hút cư dân tri thức và nhu cầu dịch vụ đi kèm',
    excerpt:
      'Đánh giá FPT City năm 2026 từ góc nhìn nhà đầu tư: tiềm năng, rủi ro, khung thẩm định pháp lý và tiêu chí chọn sản phẩm phù hợp mục tiêu dòng tiền hoặc tích sản.',
    linkGroup: 'fpt',
  },
  {
    title: 'Tiềm năng cho thuê quanh FPT City Đà Nẵng',
    slug: 'tiem-nang-cho-thue-quanh-fpt-city',
    categorySlug: 'phan-tich',
    tags: ['cho-thue-fpt-city', 'dong-tien', 'can-ho-dich-vu'],
    focus: 'tiềm năng cho thuê quanh FPT City',
    marketAngle: 'cơ cấu người thuê và tỉ lệ lấp đầy theo mùa',
    excerpt:
      'Phân tích tiềm năng cho thuê quanh FPT City dựa trên nhu cầu ở thật của chuyên gia, giảng viên, sinh viên và lao động tri thức, kèm khuyến nghị thẩm định trước khi mua.',
    linkGroup: 'fpt',
  },
  {
    title: 'FPT City phù hợp với nhà đầu tư vốn bao nhiêu?',
    slug: 'fpt-city-phu-hop-voi-nha-dau-tu-von-bao-nhieu',
    categorySlug: 'phan-tich',
    tags: ['von-dau-tu', 'fpt-city', 'phan-bo-von'],
    focus: 'ngưỡng vốn phù hợp để đầu tư tại FPT City',
    marketAngle: 'đòn bẩy tài chính và khả năng chịu áp lực lãi vay',
    excerpt:
      'Nhà đầu tư cần bao nhiêu vốn để tham gia FPT City hiệu quả? Bài viết chia theo nhóm vốn, mục tiêu nắm giữ và khẩu vị rủi ro để xây kế hoạch giải ngân thực tế.',
    linkGroup: 'fpt',
  },
  {
    title: 'So sánh FPT City và Hòa Xuân cho mục tiêu tích sản',
    slug: 'so-sanh-fpt-city-va-hoa-xuan',
    categorySlug: 'phan-tich',
    tags: ['fpt-city', 'hoa-xuan', 'so-sanh-dau-tu'],
    focus: 'so sánh FPT City và Hòa Xuân',
    marketAngle: 'điểm cân bằng giữa tiềm năng tăng vốn và thanh khoản',
    excerpt:
      'So sánh FPT City và Hòa Xuân theo dữ liệu giá, pháp lý, nhu cầu thuê, hạ tầng và khả năng thanh khoản để nhà đầu tư chọn điểm rơi vốn phù hợp mục tiêu tích sản.',
    linkGroup: 'fpt',
  },
  {
    title: 'Chuyên gia công nghệ tạo nhu cầu thuê quanh FPT City ra sao?',
    slug: 'chuyen-gia-cong-nghe-tao-nhu-cau-thue-quanh-fpt-city',
    categorySlug: 'phan-tich',
    tags: ['chuyen-gia-cong-nghe', 'nhu-cau-thue', 'fpt-city'],
    focus: 'tác động của chuyên gia công nghệ đến nhu cầu thuê',
    marketAngle: 'độ bền của nhóm khách thuê tri thức trong trung hạn',
    excerpt:
      'Nhu cầu thuê quanh FPT City được tạo bởi nhóm chuyên gia công nghệ như thế nào, bền vững đến đâu và nhà đầu tư cần thẩm định gì để không định giá quá kỳ vọng.',
    linkGroup: 'fpt',
  },
  {
    title: 'Mai Đăng Chơn có gì đặc biệt với nhà đầu tư?',
    slug: 'mai-dang-chon-co-gi-dac-biet-voi-nha-dau-tu',
    categorySlug: 'phan-tich',
    tags: ['mai-dang-chon', 'mat-tien-kinh-doanh', 'phan-tich-khu-vuc'],
    focus: 'đặc điểm đầu tư tại trục Mai Đăng Chơn',
    marketAngle: 'vai trò mặt tiền giao thương trong khả năng khai thác',
    excerpt:
      'Mai Đăng Chơn hấp dẫn nhờ mặt tiền thương mại và vị trí kết nối, nhưng hiệu quả đầu tư phụ thuộc vào thẩm định pháp lý, quy hoạch và mô hình khai thác phù hợp.',
    linkGroup: 'mai-dang-chon',
  },
  {
    title: 'Quỹ đất mặt tiền Mai Đăng Chơn phù hợp mô hình kinh doanh nào?',
    slug: 'quy-dat-mat-tien-mai-dang-chon-phu-hop-mo-hinh-kinh-doanh-nao',
    categorySlug: 'phan-tich',
    tags: ['quy-dat-mat-tien', 'mai-dang-chon', 'mo-hinh-kinh-doanh'],
    focus: 'quỹ đất mặt tiền Mai Đăng Chơn',
    marketAngle: 'sự phù hợp giữa loại tài sản và tệp khách hàng mục tiêu',
    excerpt:
      'Đánh giá các mô hình kinh doanh phù hợp với quỹ đất mặt tiền Mai Đăng Chơn: dịch vụ lưu trú, thương mại nhỏ, văn phòng linh hoạt và tài sản khai thác hỗn hợp.',
    linkGroup: 'mai-dang-chon',
  },
  {
    title: 'Đầu tư căn hộ dịch vụ trục Mai Đăng Chơn có khả thi không?',
    slug: 'dau-tu-can-ho-dich-vu-truc-mai-dang-chon',
    categorySlug: 'phan-tich',
    tags: ['can-ho-dich-vu', 'mai-dang-chon', 'dong-tien-thue'],
    focus: 'khả năng đầu tư căn hộ dịch vụ trên trục Mai Đăng Chơn',
    marketAngle: 'cân đối công suất phòng, chi phí vận hành và giá thuê',
    excerpt:
      'Căn hộ dịch vụ trên trục Mai Đăng Chơn có thể tạo dòng tiền nếu chọn đúng vị trí và mô hình vận hành. Bài viết tập trung vào số liệu thuê, chi phí và rủi ro thực tế.',
    linkGroup: 'mai-dang-chon',
  },
  {
    title: 'Mai Đăng Chơn hưởng lợi từ FPT City và Làng Đại học như thế nào?',
    slug: 'mai-dang-chon-huong-loi-tu-fpt-city-va-lang-dai-hoc',
    categorySlug: 'phan-tich',
    tags: ['mai-dang-chon', 'fpt-city', 'lang-dai-hoc'],
    focus: 'liên kết Mai Đăng Chơn với FPT City và Làng Đại học',
    marketAngle: 'hiệu ứng lan tỏa nhu cầu ở và dịch vụ theo cụm',
    excerpt:
      'Phân tích cơ chế Mai Đăng Chơn hưởng lợi từ FPT City và Làng Đại học: dòng cư dân mới, nhu cầu thuê, hoạt động thương mại và tiêu chí chọn tài sản phòng thủ.',
    linkGroup: 'mai-dang-chon',
  },
  {
    title: 'Checklist pháp lý khi mua đất mặt tiền Mai Đăng Chơn',
    slug: 'checklist-phap-ly-khi-mua-dat-mat-tien-mai-dang-chon',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['checklist-phap-ly', 'dat-mat-tien', 'mai-dang-chon'],
    focus: 'checklist pháp lý khi mua đất mặt tiền Mai Đăng Chơn',
    marketAngle: 'rủi ro pháp lý và điều kiện giao dịch an toàn',
    excerpt:
      'Tổng hợp checklist pháp lý quan trọng khi mua đất mặt tiền Mai Đăng Chơn: quy hoạch, lộ giới, mục đích sử dụng đất, giấy tờ chủ quyền và điều khoản hợp đồng.',
    linkGroup: 'mai-dang-chon',
  },
  {
    title: 'Đầu tư căn hộ cho thuê Đà Nẵng: các chỉ số cần biết',
    slug: 'dau-tu-can-ho-cho-thue-da-nang-chi-so-can-biet',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['can-ho-cho-thue', 'chi-so-dau-tu', 'da-nang'],
    focus: 'các chỉ số cốt lõi khi đầu tư căn hộ cho thuê',
    marketAngle: 'mức thuê ròng, tỉ lệ trống và chi phí giữ tài sản',
    excerpt:
      'Những chỉ số quan trọng khi đầu tư căn hộ cho thuê tại Đà Nẵng gồm công suất, giá thuê ròng, chi phí vận hành và thời gian hoàn vốn để tránh kỳ vọng thiếu thực tế.',
    linkGroup: 'none',
  },
  {
    title: 'Căn hộ cao cấp Đà Nẵng có phù hợp nhà đầu tư Hà Nội?',
    slug: 'can-ho-cao-cap-da-nang-phu-hop-nha-dau-tu-ha-noi',
    categorySlug: 'phan-tich',
    tags: ['can-ho-cao-cap', 'nha-dau-tu-ha-noi', 'phan-khuc-cao-cap'],
    focus: 'mức độ phù hợp của căn hộ cao cấp với nhà đầu tư Hà Nội',
    marketAngle: 'cân bằng giữa thương hiệu dự án và hiệu suất khai thác',
    excerpt:
      'Phân tích căn hộ cao cấp Đà Nẵng cho nhà đầu tư Hà Nội: tiềm năng tăng giá, độ bền dòng tiền và các điều kiện cần thẩm định trước khi tham gia phân khúc này.',
    linkGroup: 'none',
  },
  {
    title: 'Dòng tiền cho thuê Đà Nẵng: kỳ vọng nào là hợp lý?',
    slug: 'dong-tien-cho-thue-da-nang-ky-vong-hop-ly',
    categorySlug: 'phan-tich',
    tags: ['dong-tien-cho-thue', 'ky-vong-loi-nhuan', 'quan-tri-rui-ro'],
    focus: 'mức kỳ vọng dòng tiền cho thuê hợp lý tại Đà Nẵng',
    marketAngle: 'độ biến động giá thuê theo mùa và theo vị trí',
    excerpt:
      'Đặt kỳ vọng dòng tiền cho thuê tại Đà Nẵng cần bám dữ liệu vận hành thực tế, không chạy theo cam kết hấp dẫn. Bài viết gợi ý cách lập kịch bản doanh thu thận trọng.',
    linkGroup: 'none',
  },
  {
    title: 'Đất nền hay căn hộ: lựa chọn tốt hơn tại Đà Nẵng?',
    slug: 'dat-nen-hay-can-ho-lua-chon-tot-hon-tai-da-nang',
    categorySlug: 'kien-thuc-dau-tu',
    tags: ['dat-nen', 'can-ho', 'lua-chon-dau-tu'],
    focus: 'so sánh đất nền và căn hộ cho nhà đầu tư Đà Nẵng',
    marketAngle: 'sự khác nhau về vòng quay vốn và áp lực nắm giữ',
    excerpt:
      'Đất nền hay căn hộ tại Đà Nẵng là lựa chọn tốt hơn tùy mục tiêu vốn, khẩu vị rủi ro và kế hoạch khai thác. Bài viết đưa khung so sánh thực tế cho từng trường hợp.',
    linkGroup: 'none',
  },
  {
    title: 'Căn hộ gần biển Đà Nẵng: tiềm năng và rủi ro nhà đầu tư cần biết',
    slug: 'can-ho-gan-bien-da-nang-tiem-nang-va-rui-ro',
    categorySlug: 'review-khu-vuc',
    tags: ['can-ho-gan-bien', 'review-khu-vuc', 'rui-ro-dau-tu'],
    focus: 'căn hộ gần biển Đà Nẵng',
    marketAngle: 'mối quan hệ giữa vị trí du lịch và hiệu quả khai thác thật',
    excerpt:
      'Review căn hộ gần biển Đà Nẵng dưới góc nhìn đầu tư: cơ hội tăng giá, khả năng cho thuê ngắn hạn, chi phí vận hành và các rủi ro cần thẩm định kỹ trước khi mua.',
    linkGroup: 'none',
  },
  {
    title: 'Review Làng Đại học Đà Nẵng cho nhà đầu tư',
    slug: 'review-lang-dai-hoc-da-nang-cho-nha-dau-tu',
    categorySlug: 'review-khu-vuc',
    tags: ['lang-dai-hoc', 'review-dau-tu', 'nhu-cau-thue'],
    focus: 'khu vực Làng Đại học Đà Nẵng',
    marketAngle: 'nguồn cầu thuê từ sinh viên và chuyên gia đào tạo',
    excerpt:
      'Review Làng Đại học Đà Nẵng: tiềm năng cho thuê, biên độ tăng giá, quy hoạch xung quanh và tiêu chí lựa chọn tài sản phù hợp cho nhà đầu tư trung hạn.',
    linkGroup: 'none',
  },
  {
    title: 'Review Hòa Xuân: ưu điểm, rủi ro và thanh khoản',
    slug: 'review-hoa-xuan-uu-diem-rui-ro-thanh-khoan',
    categorySlug: 'review-khu-vuc',
    tags: ['hoa-xuan', 'thanh-khoan', 'review-khu-vuc'],
    focus: 'khu vực Hòa Xuân dưới góc nhìn đầu tư',
    marketAngle: 'sự cân bằng giữa nguồn cung và nhịp hấp thụ',
    excerpt:
      'Bài review Hòa Xuân tập trung vào ưu điểm, rủi ro pháp lý - quy hoạch và khả năng thanh khoản thực tế để nhà đầu tư đánh giá mức phù hợp với danh mục hiện tại.',
    linkGroup: 'none',
  },
  {
    title: 'Review Non Nước: bất động sản nghỉ dưỡng và căn hộ cho thuê',
    slug: 'review-non-nuoc-bat-dong-san-nghi-duong-can-ho-cho-thue',
    categorySlug: 'review-khu-vuc',
    tags: ['non-nuoc', 'nghi-duong', 'can-ho-cho-thue'],
    focus: 'khu vực Non Nước với tài sản nghỉ dưỡng và cho thuê',
    marketAngle: 'độ bền cầu du lịch so với nhu cầu ở thật',
    excerpt:
      'Review Non Nước cho nhà đầu tư quan tâm bất động sản nghỉ dưỡng và căn hộ cho thuê: tiềm năng khai thác, biến động mùa vụ và các rủi ro vận hành cần lường trước.',
    linkGroup: 'none',
  },
  {
    title: 'Review Điện Ngọc: vùng giáp ranh Đà Nẵng - Hội An',
    slug: 'review-dien-ngoc-vung-giap-ranh-da-nang-hoi-an',
    categorySlug: 'review-khu-vuc',
    tags: ['dien-ngoc', 'giap-ranh-da-nang-hoi-an', 'review-thi-truong'],
    focus: 'Điện Ngọc - vùng giáp ranh Đà Nẵng và Hội An',
    marketAngle: 'lợi thế liên vùng đi cùng rủi ro pháp lý dự án',
    excerpt:
      'Điện Ngọc có lợi thế vị trí giáp ranh Đà Nẵng - Hội An, nhưng cần thẩm định sâu pháp lý, tiến độ và thanh khoản từng dự án trước khi đưa vốn vào khu vực này.',
    linkGroup: 'none',
  },
  {
    title: 'Review Sun Symphony và Sun Cosmo dưới góc nhìn đầu tư',
    slug: 'review-sun-symphony-sun-cosmo-goc-nhin-dau-tu',
    categorySlug: 'review-khu-vuc',
    tags: ['sun-symphony', 'sun-cosmo', 'review-du-an'],
    focus: 'Sun Symphony và Sun Cosmo',
    marketAngle: 'định vị sản phẩm cao cấp và kỳ vọng vận hành thực tế',
    excerpt:
      'Review Sun Symphony và Sun Cosmo với góc nhìn đầu tư: chất lượng vị trí, tiềm năng dòng tiền, mức giá vào và các điều kiện cần kiểm chứng để tránh kỳ vọng quá mức.',
    linkGroup: 'none',
  },
];

const titleBySlug = new Map(POSTS.map(item => [item.slug, item.title]));

export const SEO_POSTS: SeoPostSeed[] = POSTS.map((post) => {
  const extraLinks = pickLinks(post.linkGroup);
  const relatedClusterLinks = getClusterRelatedSlugs(post.slug, 4).map(slug => ({
    label: titleBySlug.get(slug) || slug,
    href: `/tin-tuc/${slug}`,
  }));
  const pillarLink = getPillarLinkForSlug(post.slug);
  const leadMagnetLink = getLeadMagnetLinkForSlug(post.slug);
  const relatedProjectLinks = getRelatedProjectLinksForSlug(post.slug);
  const relatedAreaLinks = getRelatedAreaLinksForSlug(post.slug);
  const currentIndex = POSTS.findIndex(item => item.slug === post.slug);
  const nextPost = POSTS[(currentIndex + 1) % POSTS.length];
  const sequentialLink = {
    label: nextPost.title,
    href: `/tin-tuc/${nextPost.slug}`,
  };
  const uniqueLinks: LinkItem[] = [];
  for (const link of [
    ...(pillarLink ? [pillarLink] : []),
    leadMagnetLink,
    sequentialLink,
    ...relatedClusterLinks,
    ...relatedProjectLinks,
    ...relatedAreaLinks,
    ...(extraLinks || []),
  ]) {
    if (uniqueLinks.some(item => item.href === link.href)) continue;
    uniqueLinks.push(link);
    if (uniqueLinks.length >= 5) break;
  }

  const article = getPostArticle(post.slug);
  const intro = article.intro;
  const sections = article.sections;
  const faqs = article.faqs;

  return {
    title: post.title,
    slug: post.slug,
    excerpt: fitText(post.excerpt, 150),
    metaTitle: fitText(article.metaTitle, 60),
    metaDescription: fitText(article.metaDescription, 155),
    categorySlug: post.categorySlug,
    tags: post.tags,
    coverImage: DEFAULT_COVER,
    faqs,
    extraLinks: uniqueLinks,
    content: buildArticleContent(intro, sections, uniqueLinks, article.cta),
  };
});
