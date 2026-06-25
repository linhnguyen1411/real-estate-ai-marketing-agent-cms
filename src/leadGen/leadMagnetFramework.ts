import type {
  InvestmentMapZone,
  OpportunityGroup,
  ReportSection,
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

export const MARKET_REPORT_SECTIONS: ReportSection[] = [
  {
    kind: 'market-insight',
    id: 'insight-sun-group',
    title: 'Sun Group — quần thể căn hộ Nam Đà Nẵng',
    summary:
      'Sun Group là thương hiệu chủ đạo tại Nam Đà Nẵng với năm dòng căn hộ theo dõi sát: Symphony, FourS, S Light, Cora và Spana. Khung phân tích tách riêng phí quản lý resort, chính sách cho thuê từng tòa và comps secondary 60 ngày — không đặt cạnh đất nền ven sông hay nhà phố nội đô.',
    keyDrivers: [
      'Symphony · FourS · S Light · Cora · Spana',
      'Hạ tầng nội khu Sun ven biển phía Nam',
      'Sàn secondary và volume tin chuyển nhượng',
      'Shophouse và biệt thự trong master plan',
    ],
    watchPoints: [
      'Phí quản lý và quy chế tòa nhà trước khi tính yield',
      'Giá thuê thực tế từ 3 căn tương đương, không chỉ tin đăng',
      'Chênh giá view biển / hướng nội trong cùng tòa',
      'Chính sách cho thuê ngắn hạn từng tòa Sun',
    ],
    investorFit:
      'Hồ sơ phù hợp: người ưu tiên thương hiệu chủ đầu tư quốc tế ven biển, sẵn sàng theo dõi phí quản lý resort và chính sách cho thuê từng tòa Sun.',
    risks: [
      'Phí quản lý ăn vào yield ròng',
      'Cung căn chuyển nhượng làm giá thuê đi ngang',
      'Kỳ vọng giá đã phản ánh trong giá bán hiện tại',
    ],
  },
  {
    kind: 'market-insight',
    id: 'insight-mai-dang-chon',
    title: 'Trục Mai Đăng Chơn — đô thị ven sông phía Nam',
    summary:
      'Khu Mai Đăng Chơn ven Cổ Cò — đo tiến độ đường nội bộ, điện nước và số shophouse đã khai trương từng quý. Không gom toàn dự án một mức giá.',
    keyDrivers: [
      'Master plan ven sông Cổ Cò',
      'Mặt tiền và shophouse phục vụ cư dân mới',
      'Hạ tầng kết nối Nam Hòa Xuân — Hòa Quý',
      'Dòng vốn tích lũy dài hạn ven đô thị mới',
    ],
    watchPoints: [
      'Lộ trình giao thông nối Mai Đăng Chơn — Hòa Quý',
      'Diện tích sàn kinh doanh trên bản vẽ phê duyệt',
      'Footfall cuối tuần tại shophouse đã mở',
      'Khoảng cách lô tới mép sông thực địa',
    ],
    investorFit:
      'Phù hợp nhà đầu tư nắm giữ ven sông 5 năm+, chấp nhận shophouse trống giai đoạn đầu — có người tại Đà Nẵng theo dõi tiến độ block.',
    risks: [
      'Chậm tiến độ block 2–3 so với cam kết',
      'Shophouse pioneer trống 12 tháng đầu',
      'Điều chỉnh mật độ ven sông',
    ],
  },
  {
    kind: 'market-insight',
    id: 'insight-land-townhouse',
    title: 'Đất nền & nhà phố Nam Đà Nẵng',
    summary:
      'Đất nền và nhà phố Nam tập trung Nam Hòa Xuân và ven đô thị mới — mua khi sổ tách thửa rõ hoặc nhà đã có hộ ở thực. Không so với căn Sun; chu kỳ chủ yếu theo dân cư dọn về.',
    keyDrivers: [
      'Dân cư mới Nam Hòa Xuân và khu đô thị ven sông',
      'Đất nền ven đô thị có đường nội bộ đã thông',
      'Nhà phố và shophouse phục vụ hộ gia đình',
      'Đất TM mặt tiền ven trục dân cư',
    ],
    watchPoints: [
      'Sổ đỏ tách thửa và ranh giới thực địa — đo lại trên hiện trường',
      'Số hộ đã nhận nhà trong khu đô thị mới — hỏi ban quản lý',
      'Giá thuê nhà phố từ chủ nhà trực tiếp, không chỉ tin đăng',
      'Lộ giới và hành lang điện khi lô ven đường lớn',
    ],
    investorFit:
      'Hồ sơ phù hợp: người mua nhà phố hoặc lô đất đã có sổ tách thửa, chấp nhận chờ dân cư về 2–3 năm — không kỳ vọng lướt sóng như căn hộ secondary.',
    risks: [
      'Đất chưa tách sổ khó vay và khó bán lại',
      'Nhà phố hẻm sâu khó cho thuê gia đình',
      'Mua theo slide marketing chưa có comps',
    ],
  },
  {
    kind: 'budget-framework',
    id: 'budget-fit',
    title: 'Khung lựa chọn sản phẩm phù hợp khẩu vị vốn',
    intro:
      'Khẩu vị vốn lọc phân khúc trước khi chọn khu: căn Sun (dòng tiền), đất/shophouse Mai (tích lũy), nhà phố Nam (gia đình). Định hướng phân tích, không phải bảng giá.',
    tiers: [
      {
        range: 'Dưới 3 tỷ',
        assetTypes: ['Studio Sun secondary', 'Lô đất Mai giai đoạn 1', 'Phòng trọ đã cải tạo Nam'],
        advantages: [
          'Vốn vào thấp, thử nghiệm danh mục nhỏ.',
          'Tài sản bàn giao đo được dòng tiền sớm.',
        ],
        limitations: [
          'Yield dễ bị ảo nếu không trừ phí quản lý, thuế và thời gian trống phòng.',
          'Đất xa trung tâm Nam có thể mất thanh khoản 2–3 năm nếu hạ tầng chậm.',
        ],
      },
      {
        range: '3–7 tỷ',
        assetTypes: ['Căn FourS / Cora cho thuê', 'Lô đất ven sông Nam', 'Nhà phố nhỏ Nam Hòa Xuân'],
        advantages: [
          'Phân bổ vốn giữa dòng tiền căn Sun và tích lũy đất ven sông.',
          'Nhiều lựa chọn trong tầm vốn trung tại Nam.',
        ],
        limitations: [
          'Cung căn 2PN mới có thể làm giá thuê đi ngang sau 2–3 năm.',
          'Đất nền cần xác minh quy hoạch 1/500 — không mua theo slide marketing.',
        ],
      },
      {
        range: '7–15 tỷ',
        assetTypes: ['Shophouse Mai Đăng Chơn mặt tiền', 'Căn Sun Symphony / Spana', 'Lô TM kinh doanh Nam'],
        advantages: [
          'Dòng tiền từ kinh doanh hoặc cho thuê mặt bằng thường cao hơn căn hộ thuần.',
          'Vị trí mặt tiền hoặc view biển Sun giữ giá tốt hơn khi thị trường điều chỉnh.',
        ],
        limitations: [
          'Vốn bị khóa lâu; khó thoái vốn nhanh nếu sai vị trí hoặc sai mục đích sử dụng đất.',
          'Chi phí sửa chữa, thuế và phí môi giới ăn vào biên lợi nhuận đáng kể.',
        ],
      },
      {
        range: 'Trên 15 tỷ',
        assetTypes: ['Biệt thự / liền kề Sun resort Nam', 'Quỹ đất lớn Mai Đăng Chơn', 'BĐS thương mại tổ hợp'],
        advantages: [
          'Tính khan hiếm vị trí ven biển Sun hoặc mặt tiền lớn Mai Đăng Chơn — ít đối thủ cùng phân khúc.',
          'Phù hợp chiến lược tích lũy 5–10 năm và chuyển giao thế hệ.',
        ],
        limitations: [
          'Thanh khoản thấp; bán gấp thường phải chiết khấu sâu.',
          'Chi phí bảo trì, bảo vệ và quản lý tài sản lớn khi đầu tư từ xa.',
        ],
      },
    ],
  },
  {
    kind: 'remote-ops-risk',
    id: 'remote-ops',
    title: 'Rủi ro vận hành khi đầu tư từ xa',
    intro:
      'Mua đúng tại Nam Đà Nẵng chỉ là bước đầu. Với nhà đầu tư không sống tại Đà Nẵng, rủi ro tập trung ở khâu vận hành sau sở hữu — từ quản lý hiện trạng đến thu tiền thuê và giám sát pháp lý. Phần này không lặp lại khung ngân sách hay phân tích khu vực; chỉ tập trung vận hành từ xa.',
    items: [
      {
        topic: 'Quản lý tài sản',
        description:
          'Không có người đại diện tại chỗ, tài sản dễ bị bỏ bê: hư hỏng nhỏ kéo dài, tranh chấp hàng xóm phát hiện muộn, chi phí sửa chữa phình to.',
        mitigation:
          'Ký hợp đồng quản lý có KPI (ảnh hiện trạng hàng tháng, báo cáo chi phí). Chỉ trả phí theo mốc đã thực hiện.',
      },
      {
        topic: 'Vận hành cho thuê',
        description:
          'Tỷ lệ lấp đầy trên giấy khác xa thực tế: mùa thấp điểm, cạnh tranh homestay, chi phí dọn phòng và marketing không được tính vào mô hình lạc quan.',
        mitigation:
          'Lấy data thuê từ 3 căn tương đương trong cùng tòa (không chỉ tin đăng). Dự phòng 2 tháng trống phòng/năm trong dự toán.',
      },
      {
        topic: 'Kiểm soát pháp lý',
        description:
          'Sổ đỏ gửi qua đường bay, hợp đồng ký từ xa — rủi ro nhầm thửa, thế chấp chưa giải chấp, hoặc mục đích sử dụng đất không khớp kinh doanh dự kiến.',
        mitigation:
          'Tra cứu thông tin thửa trên cổng chính thống trước đặt cọc. Thuê luật sư địa phương rà soát hợp đồng — chi phí nhỏ so với rủi ro.',
      },
      {
        topic: 'Dòng tiền',
        description:
          'Chuyển khoản cho đối tác không quen, trễ tiền thuê, chi phí phát sinh (nội thất, sửa chữa) không có quỹ dự phòng — dễ âm dòng tiền 6–12 tháng đầu.',
        mitigation:
          'Mở tài khoản riêng cho từng tài sản. Giữ quỹ dự phòng 10–15% giá trị tài sản cho 12 tháng vận hành.',
      },
      {
        topic: 'Nhân sự địa phương',
        description:
          'Môi giới, quản gia, người giới thiệu khách thuê — lợi ích không trùng với nhà đầu tư. Thông tin bị lọc để chốt nhanh.',
        mitigation:
          'Tách vai trò: một bên tìm khách thuê, một bên kiểm tra pháp lý, một bên giám sát hiện trạng. Không gộp vào một người.',
      },
    ],
  },
  {
    kind: 'pre-purchase-checklist',
    id: 'checklist-90d',
    title: 'Checklist 90 ngày trước khi xuống tiền',
    intro:
      'Checklist thực thi — không phải bài phân tích khu vực. Làm lần lượt từng mốc; mỗi việc có thể tick hoàn thành.',
    phases: [
      {
        label: '90 ngày trước',
        items: [
          'Xác định mục tiêu chính: tích lũy, dòng tiền hay kết hợp — ghi một dòng cụ thể.',
          'Chốt trần ngân sách all-in gồm thuế, sửa chữa và quỹ trống phòng 12 tháng.',
          'Rà soát pháp lý sơ bộ từng khu ưu tiên — loại trừ lô/căn thiếu sổ hoặc tranh chấp.',
          'Đặt lịch khảo sát trực tiếp tối thiểu 2 ngày tại Nam Đà Nẵng.',
        ],
      },
      {
        label: '60 ngày trước',
        items: [
          'So sánh giá 5 giao dịch tương đương (cùng loại, cùng khu) — lấy từ tin thật, không từ brochure.',
          'Gọi 2 chủ nhà cho thuê thực tế trong khu để hỏi giá thuê và tỷ lệ trống phòng.',
          'Tra cứu quy hoạch sơ bộ trên bản đồ quy hoạch thành phố.',
          'Loại bỏ các lô/căn không có sổ hoặc đang tranh chấp.',
        ],
      },
      {
        label: '30 ngày trước',
        items: [
          'Rà soát hợp đồng mẫu với luật sư hoặc môi giới độc lập.',
          'Kiểm tra lịch sử thế chấp, công chứng và chữ ký người bán.',
          'Chụp toàn bộ hiện trạng, video walk-through có timestamp.',
          'Thống nhất điều kiện thanh toán theo tiến độ (không chuyển 100% trước khi sang tên).',
        ],
      },
      {
        label: '7 ngày trước',
        items: [
          'Xác nhận lại giá chốt và phụ lục hợp đồng — không đổi miệng.',
          'Kiểm tra số tài khoản nhận tiền trùng tên chủ sở hữu trên sổ.',
          'Chuẩn bị giấy tờ công chứng: CMND/CCCD, giấy đăng ký kết hôn (nếu có).',
          'Đặt lịch nộp thuế và phí trước mốc sang tên.',
        ],
      },
      {
        label: 'Trước đặt cọc',
        items: [
          'Đọc lại điều khoản hoàn cọc khi phát hiện lỗi pháp lý.',
          'Giữ biên lai cọc có đủ thông tin thửa và thời hạn ký HĐMB.',
          'Không chuyển tiền vào tài khoản cá nhân không liên quan đến sổ đỏ.',
          'Chụp ảnh biên bản bàn giao nhà/đất ngay sau cọc nếu được vào hiện trường.',
        ],
      },
    ],
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
