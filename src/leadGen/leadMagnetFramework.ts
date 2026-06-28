import type {
  InvestmentMapZone,
  OpportunityGroup,
} from '../types/leadMagnetContent';

/** Commercial mix: 40% Sun Group · 30% Mai Đăng Chơn · 20% đất/nhà phố · 10% FPT (hỗ trợ). */
export const OPPORTUNITY_GROUPS: OpportunityGroup[] = [
  // —— Sun Group (8 / 40%) ——
  {
    rank: 1,
    name: 'Căn hộ Sun Symphony — ven biển Nam Đà Nẵng',
    area: 'Nam Đà Nẵng — ven biển',
    assetType: 'Căn hộ',
    whyWatch:
      'Sun Symphony là phân khúc flagship ven biển phía Nam — so sánh giá/m² với FourS và S Light trong cùng quần thể, kiểm tra view và tầng trước khi chốt.',
    risks:
      'Phí quản lý resort-style có thể ăn vào yield ròng — cần tính vào mô hình trước khi so với căn đô thị thuần.',
    suitableBudget: 'Nắm giữ và cho thuê (ven biển Sun)',
  },
  {
    rank: 2,
    name: 'Căn hộ Sun FourS — Nam Đà Nẵng',
    area: 'Nam Đà Nẵng',
    assetType: 'Căn hộ',
    whyWatch:
      'FourS thuộc dải sản phẩm Sun Group tại Nam — phù hợp theo dõi nếu ưu tiên căn đã bàn giao có cư dân thực và volume tin chuyển nhượng ổn định trong 30 ngày.',
    risks:
      'Cung căn chuyển nhượng đồng loạt có thể đàm phán giá mua thấp — nhưng giá thuê vẫn phụ thuộc nhu cầu thực tế tại tòa.',
    suitableBudget: 'Dòng tiền trung hạn (căn Sun đã bàn giao)',
  },
  {
    rank: 3,
    name: 'Căn hộ S Light — Nam Đà Nẵng',
    area: 'Nam Đà Nẵng',
    assetType: 'Căn hộ',
    whyWatch:
      'S Light là lớp sản phẩm tiếp cận trong hệ sinh thái Sun — thường phù hợp ngân sách vừa và mô hình cho thuê dài hạn. Benchmark giá thuê 1–2PN từ 3 căn tương đương, không chỉ brochure.',
    risks:
      'Căn view hoặc tầng cao chênh giá bán đáng kể — cần đối chiếu yield thực sau khi trừ phí quản lý.',
    suitableBudget: 'Dòng tiền (căn hộ Sun phân khúc vừa)',
  },
  {
    rank: 4,
    name: 'Căn hộ Cora — Nam Đà Nẵng',
    area: 'Nam Đà Nẵng',
    assetType: 'Căn hộ',
    whyWatch:
      'Cora bổ sung phân khúc trong danh mục Sun Group tại Nam — theo dõi khi cần đa dạng hóa danh mục căn hộ ven biển/đô thị mới với profile khách thuê khác Symphony.',
    risks:
      'Tiến độ bàn giao từng block có thể lệch — chỉ dùng dòng tiền thực từ căn đã có cư dân làm comps.',
    suitableBudget: 'Tích lũy và dòng tiền (Sun Cora)',
  },
  {
    rank: 5,
    name: 'Căn hộ Sun Spana — Nam Đà Nẵng',
    area: 'Nam Đà Nẵng',
    assetType: 'Căn hộ',
    whyWatch:
      'Sun Spana thường có layout 2PN tối ưu cho thuê gia đình nhỏ — đối chiếu diện tích thông thủy và phí quản lý với Cora cùng phân khúc trước khi vào vốn.',
    risks:
      'Một số tòa hạn chế cho thuê ngắn hạn — đọc nội quy quản lý trước khi ký HĐMB.',
    suitableBudget: 'Dòng tiền (căn hộ Sun Spana)',
  },
  {
    rank: 6,
    name: 'Sun Group — căn hộ secondary ven biển Nam',
    area: 'Nam Đà Nẵng — ven biển',
    assetType: 'Căn hộ',
    whyWatch:
      'Sàn thứ cấp các dự án Sun ven biển có lịch sử giao dịch — lấy 5 comps cùng loại trong 60 ngày để tránh mua theo giá marketing.',
    risks:
      'Căn view biển và căn hướng nội chênh giá lớn — tách nhóm comps theo hướng và tầng.',
    suitableBudget: 'Nắm giữ (secondary Sun ven biển)',
  },
  {
    rank: 7,
    name: 'Sun Group — shophouse quần thể ven biển',
    area: 'Nam Đà Nẵng — ven biển',
    assetType: 'Shophouse',
    whyWatch:
      'Shophouse trong master plan Sun phục vụ cư dân resort và khách lưu trú ngắn hạn — đo doanh thu F&B thực tế tại block đã bàn giao trước khi nhân rộng.',
    risks:
      'Mùa thấp điểm du lịch có thể làm doanh thu shophouse ven biển giảm 30–40% — mô hình tài chính cần dự phòng theo quý, không chỉ tháng cao điểm.',
    suitableBudget: 'Dòng tiền kinh doanh (shophouse Sun)',
  },
  {
    rank: 8,
    name: 'Sun Group — biệt thự / liền kề resort Nam',
    area: 'Nam Đà Nẵng — ven biển',
    assetType: 'Biệt thự / Liền kề',
    whyWatch:
      'Phân khúc resort Sun Group tại Nam phù hợp tích lũy dài hạn và nghỉ dưỡng gia đình — tách mô hình ở thực và cho thuê ngắn hạn trước khi tính yield.',
    risks:
      'Chi phí bảo trì hồ bơi, sân vườn và bảo vệ cao khi không ở thường xuyên — cần quỹ vận hành riêng.',
    suitableBudget: 'Tích lũy dài hạn (resort Sun Nam)',
  },
  // —— Mai Đăng Chơn (6 / 30%) ——
  {
    rank: 9,
    name: 'Mai Đăng Chơn — đất mặt tiền ven sông Cổ Cò',
    area: 'Nam Đà Nẵng',
    assetType: 'Đất nền / Shophouse',
    whyWatch:
      'Lô mặt tiền Mai Đăng Chơn nên quy đổi giá theo mét ngang mặt tiền — chia giá bán cho frontage để so sánh block, không chỉ so diện tích đất.',
    risks:
      'Giai đoạn sau có thể điều chỉnh mật độ xây dựng — diện tích sàn kinh doanh thực tế cần đối chiếu bản vẽ phê duyệt, không chỉ brochure.',
    suitableBudget: 'Nắm giữ dài hạn (đô thị ven sông Nam)',
  },
  {
    rank: 10,
    name: 'Mai Đăng Chơn — shophouse block đầu tiên',
    area: 'Nam Đà Nẵng',
    assetType: 'Shophouse',
    whyWatch:
      'Block shophouse đầu tiên tại Mai Đăng Chơn thường có ưu đãi thuê cho tenant pioneer — khảo sát 3 mặt bằng đã khai trương để ước giá doanh thu thực, không chỉ cam kết chủ đầu tư.',
    risks:
      'Diện tích tầng 1 dưới 60 m² khó thuê brand cafe quốc tế — frontage và chiều sâu cần đo trực tiếp, không tin mặt bằng trên sơ đồ.',
    suitableBudget: 'Dòng tiền kinh doanh (Mai Đăng Chơn)',
  },
  {
    rank: 11,
    name: 'Mai Đăng Chơn — đất nền giai đoạn 1',
    area: 'Nam Đà Nẵng',
    assetType: 'Đất nền',
    whyWatch:
      'Giai đoạn 1 Mai Đăng Chơn thường có hạ tầng nội bộ rõ hơn các phân khu sau — phù hợp tích lũy khi chấp nhận thanh khoản chậm 2–3 năm đầu.',
    risks:
      'Tiến độ giai đoạn 2–3 chậm có thể kéo thanh khoản — so sánh lộ trình công bố với hiện trường mỗi quý.',
    suitableBudget: 'Tích lũy (đất nền Mai Đăng Chơn)',
  },
  {
    rank: 12,
    name: 'Mai Đăng Chơn — lô view sông và không gian mở',
    area: 'Nam Đà Nẵng',
    assetType: 'Đất nền',
    whyWatch:
      'Lô view sông tại Mai Đăng Chơn được thị trường chấm premium 8–15% so với lô cùng diện tích trong ngõ — cần ảnh chụp view thực tế và kiểm tra hướng nhìn theo mùa mưa.',
    risks:
      'Cây cối lân cận hoặc công trình sau này có thể che view — xác nhận quy hoạch tầng nhìn trên mặt bằng tổng thể, không chỉ tại thời điểm mua.',
    suitableBudget: 'Tích lũu ven sông (Mai Đăng Chơn)',
  },
  {
    rank: 13,
    name: 'Mai Đăng Chơn — shophouse ven sông kinh doanh dịch vụ',
    area: 'Nam Đà Nẵng',
    assetType: 'Shophouse',
    whyWatch:
      'Mặt tiền ven sông Mai Đăng Chơn phù hợp cà phê view nước và dịch vụ cuối tuần — khách hàng chủ yếu cư dân nội khu, không phụ thuộc tour du lịch.',
    risks:
      'Quy định mục đích kinh doanh F&B ven sông có thể hạn chế loại hình ồn ào sau 22h — đọc nội quy khu đô thị trước khi chọn concept.',
    suitableBudget: 'Dòng tiền mặt bằng (Mai Đăng Chơn)',
  },
  {
    rank: 14,
    name: 'Mai Đăng Chơn — tích lũy dài hạn ven đô thị mới',
    area: 'Nam Đà Nẵng',
    assetType: 'Đất nền / Shophouse',
    whyWatch:
      'Danh mục Mai Đăng Chơn nên trộn đất nền và shophouse để cân rủi ro thanh khoản — không dồn toàn bộ vốn vào một block giai đoạn đầu.',
    risks:
      'Chậm tiến độ hạ tầng so với kế hoạch — chỉ vào nếu chấp nhận giữ ít nhất 3–5 năm.',
    suitableBudget: 'Nắm giữ dài hạn (Mai Đăng Chơn)',
  },
  // —— Đất nền & nhà phố Nam Đà Nẵng (4 / 20%) ——
  {
    rank: 15,
    name: 'Đất nền Nam Đà Nẵng ven đô thị mới',
    area: 'Nam Đà Nẵng',
    assetType: 'Đất nền',
    whyWatch:
      'Giá đất ven đô thị Nam nên neo theo 3 giao dịch tương đương trong 90 ngày — không theo bảng giá mới nhất của sàn dự án.',
    risks:
      'Giá đất tăng theo tin đồn quy hoạch trước khi có văn bản — chỉ thẩm định khi có chủ trương hoặc quy hoạch công khai trên cổng thành phố.',
    suitableBudget: 'Tích lũy trung hạn (đất nền Nam)',
  },
  {
    rank: 16,
    name: 'Nhà phố Nam Hòa Xuân — cư dân gia đình',
    area: 'Nam Đà Nẵng',
    assetType: 'Nhà phố',
    whyWatch:
      'Khu dân cư Nam Hòa Xuân có chợ, trường và xe buýt nội đô — nguyên căn cho thuê phục vụ hộ gia đình đang dọn về từng đợt.',
    risks:
      'Nhà trong hẻm sâu khó lấp đầy cho thuê gia đình — đo chiều rộng mặt tiền hẻm và lộ giới trước khi ký.',
    suitableBudget: 'Dòng tiền gia đình (nhà phố Nam)',
  },
  {
    rank: 17,
    name: 'Shophouse phục vụ cư dân mới Nam Đà Nẵng',
    area: 'Nam Đà Nẵng',
    assetType: 'Shophouse',
    whyWatch:
      'Shophouse trong khu dân cư Nam mới phục vụ nhu cầu tiện ích hàng ngày (tạp hóa, phòng khám nhỏ) — occupancy ổn định hơn F&B khi cư dân đã về 60% trở lên.',
    risks:
      'Khu chưa đủ dân thì shophouse tiện ích vẫn lỗ 12–18 tháng — hỏi ban quản lý số hộ đã nhận nhà trước khi ký.',
    suitableBudget: 'Dòng tiền kinh doanh (chờ lấp đầy)',
  },
  {
    rank: 18,
    name: 'Đất thương mại mặt tiền ven trục dân cư Nam',
    area: 'Nam Đà Nẵng',
    assetType: 'Đất thương mại / dịch vụ',
    whyWatch:
      'Lô TM mặt tiền ven trục xe buýt và trường học Nam phù hợp garage, showroom nhỏ hoặc trung tâm đào tạo — khách hàng B2B ít phụ thuộc mùa du lịch.',
    risks:
      'Quy hoạch giao thông cấp trên có thể điều chỉnh mặt tiền — lấy ý kiến tư vấn địa phương trước khi trả giá đất TM.',
    suitableBudget: 'Dòng tiền mặt bằng (sau khi có cư dân)',
  },
  // —— FPT — vai trò hỗ trợ (2 / 10%) ——
  {
    rank: 19,
    name: 'Nhu cầu thuê từ lao động tri thức Nam Đà Nẵng',
    area: 'Nam Đà Nẵng',
    assetType: 'Yếu tố thị trường (cho thuê)',
    whyWatch:
      'Lớp lao động công nghệ và đại học tại Nam (gồm hành lang FPT City và Khu CNC) tạo nhu cầu thuê 6–12 tháng — tác động tích cực lên căn hộ Sun Group, nhà phố và shophouse gần trục dân cư, không phải lý do để chỉ tập trung mua sản phẩm trong khu FPT.',
    risks:
      'Thuê theo mùa tuyển sinh hoặc theo dự án IT có thể trống phòng 1–2 tháng/năm — dự phòng trong mô hình dòng tiền, đừng gom toàn bộ vốn vào một phân khu.',
    suitableBudget: 'Tham chiếu nhu cầu thuê (không phải sản phẩm trung tâm)',
  },
  {
    rank: 20,
    name: 'Động lực tăng trưởng khu Nam — hỗ trợ định giá',
    area: 'Nam Đà Nẵng',
    assetType: 'Yếu tố vĩ mô khu vực',
    whyWatch:
      'Đầu tư hạ tầng và logistics phía Nam (cảng, đường ven biển, khu công nghệ) tạo hiệu ứng lan tỏa lên giá đất ven đô thị — dùng chỉ số này để tham chiếu Mai Đăng Chơn và nhà phố, không để chọn riêng một dự án công nghệ.',
    risks:
      'Narrative tăng trưởng vùng có thể đi trước cư dân thực 2–3 năm — đối chiếu số hộ nhận nhà và doanh nghiệp đã vào hoạt động trước khi trả giá cao.',
    suitableBudget: 'Bối cảnh thị trường (hỗ trợ định giá Nam)',
  },
];

export const INVESTMENT_MAP_ZONES: InvestmentMapZone[] = [
  {
    id: 'sun-group',
    label: 'Sun Group — ven biển Nam',
    x: 72,
    y: 32,
    color: '#e11d48',
    note: 'Symphony · FourS · S Light · Cora · Spana — quần thể căn hộ và resort Sun tại Nam Đà Nẵng.',
  },
  {
    id: 'mai-dang-chon',
    label: 'Mai Đăng Chơn',
    x: 45,
    y: 65,
    color: '#059669',
    note: 'Trục đô thị ven sông Cổ Cò — đất nền, shophouse và tích lũy dài hạn.',
  },
  {
    id: 'hoa-xuan',
    label: 'Nam Hòa Xuân — nhà phố',
    x: 40,
    y: 70,
    color: '#0d9488',
    note: 'Nhà phố cư dân gia đình — dòng tiền khi hạ tầng đã hình thành.',
  },
  {
    id: 'dat-nen-nam',
    label: 'Đất nền Nam Đà Nẵng',
    x: 50,
    y: 58,
    color: '#ca8a04',
    note: 'Vùng đất ở mở rộng phía Nam — kiểm tra quy hoạch 1/500 và lộ giới trước khi đặt cọc.',
  },
  {
    id: 'sun-shophouse',
    label: 'Shophouse Sun / Mai',
    x: 58,
    y: 48,
    color: '#7c3aed',
    note: 'Retail tại quần thể Sun và Mai — đo footfall cuối tuần tại block đã khai trương.',
  },
  {
    id: 'dien-ngoc',
    label: 'Điện Ngọc — hành lang Nam',
    x: 55,
    y: 82,
    color: '#0891b2',
    note: 'Xã ven hành lang phía Nam — đất dịch vụ và liên kết vùng, khác phân khúc căn hộ Sun.',
  },
  {
    id: 'fpt-growth',
    label: 'Hành lang công nghệ Nam',
    x: 35,
    y: 55,
    color: '#64748b',
    note: 'Khu CNC và Làng Đại học — nguồn khách thuê trẻ; dùng làm chỉ báo nhu cầu, không phải danh mục sản phẩm chính.',
  },
];
