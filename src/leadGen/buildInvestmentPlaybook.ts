import { OPPORTUNITY_GROUPS } from './leadMagnetFramework';
import type {
  InvestmentPlaybookContent,
  OpportunityGroup,
  PlaybookChapter,
  PlaybookSubsection,
  PlaybookTableRow,
} from '../types/leadMagnetContent';

function groups(...ranks: number[]): OpportunityGroup[] {
  return ranks
    .map(rank => OPPORTUNITY_GROUPS.find(group => group.rank === rank))
    .filter((group): group is OpportunityGroup => Boolean(group));
}

function localizeDisplayText(text: string): string {
  return text
    .replace(/\bsecondary\b/gi, 'thứ cấp')
    .replace(/\byield\b/gi, 'tỷ suất cho thuê')
    .replace(/\bShophouse\b/g, 'Nhà phố thương mại')
    .replace(/\bshophouse\b/g, 'nhà phố thương mại')
    .replace(/\bresort\b/gi, 'nghỉ dưỡng')
    .replace(/\bF&B\b/g, 'ẩm thực')
    .replace(/\boccupancy\b/gi, 'công suất lấp đầy')
    .replace(/\bfootfall\b/gi, 'lưu lượng khách')
    .replace(/\bbrochure\b/gi, 'tài liệu bán hàng')
    .replace(/\bmarket driver\b/gi, 'động lực thị trường')
    .replace(/\bmarket drivers\b/gi, 'động lực thị trường')
    .replace(/\bnarrative\b/gi, 'kịch bản')
    .replace(/\bcomps\b/gi, 'so sánh giao dịch')
    .replace(/\bpremium\b/gi, 'cao hơn mặt bằng')
    .replace(/\blogistics\b/gi, 'hậu cần')
    .replace(/\bslide\b/gi, 'bản trình bày')
    .replace(/\bpioneer\b/gi, 'giai đoạn đầu')
    .replace(/\brender 3D\b/gi, 'hình ảnh 3D')
    .replace(/\bsecond home\b/gi, 'nhà thứ hai')
    .replace(/\bResort & nhà thứ hai\b/g, 'Nghỉ dưỡng & nhà thứ hai')
    .replace(/\bview\b/gi, 'hướng nhìn')
    .replace(/\bblock\b/gi, 'phân khu')
    .replace(/\bhomestay\b/gi, 'lưu trú ngắn hạn')
    .replace(/\bprofile\b/gi, 'đặc thù')
    .replace(/\bcopy\b/gi, 'sao chép')
    .replace(/\bIT\b/g, 'công nghệ thông tin');
}

function productLabel(name: string): string {
  if (/symphony/i.test(name)) return 'Sun Symphony';
  if (/fours|fours/i.test(name)) return 'Sun FourS';
  if (/s light|s-light/i.test(name)) return 'Sun S-Light';
  if (/cora/i.test(name)) return 'Sun Cora';
  if (/spana/i.test(name)) return 'Sun Spana';
  if (/secondary/i.test(name)) return 'Căn thứ cấp ven biển';
  if (/biệt thự|liền kề/i.test(name)) return 'Biệt thự / liền kề nghỉ dưỡng';
  if (/shophouse/i.test(name)) return 'Nhà phố thương mại quần thể';
  return name.split('—')[0]?.trim() || name;
}

function summarizeWatch(groups: OpportunityGroup[]): string[] {
  if (groups.length === 0) return [];
  const merged = groups.map(group => group.whyWatch).join(' ');
  const sentences = merged.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(Boolean) ?? [merged];
  return sentences.slice(0, 3).map(localizeDisplayText);
}

function mergeRisks(groups: OpportunityGroup[]): string[] {
  const seen = new Set<string>();
  const points: string[] = [];
  groups.forEach(group => {
    group.risks.split(/[.—]/).forEach(part => {
      const trimmed = part.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        points.push(trimmed.endsWith('.') ? trimmed : `${trimmed}.`);
      }
    });
  });
  return points.slice(0, 5).map(localizeDisplayText);
}

function mergeBudgets(groups: OpportunityGroup[]): string {
  return [...new Set(groups.map(group => localizeDisplayText(group.suitableBudget)))].join(' · ');
}

function apartmentRow(group: OpportunityGroup): PlaybookTableRow {
  return {
    label: productLabel(group.name),
    cells: [
      localizeDisplayText(group.assetType),
      localizeDisplayText(group.suitableBudget),
      localizeDisplayText(group.whyWatch.split('.')[0]?.trim() || group.whyWatch),
      inferHoldPeriod(group),
      inferLiquidity(group),
      localizeDisplayText(group.risks.split('.')[0]?.trim() || group.risks),
    ],
  };
}

function landRow(group: OpportunityGroup): PlaybookTableRow {
  return {
    label: group.name.split('—')[1]?.trim() || group.name,
    cells: [
      localizeDisplayText(group.assetType),
      localizeDisplayText(group.suitableBudget),
      localizeDisplayText(group.whyWatch.split('.')[0]?.trim() || group.whyWatch),
      inferLiquidity(group),
      inferHoldPeriod(group),
    ],
  };
}

function townhouseRow(group: OpportunityGroup): PlaybookTableRow {
  const assetType = localizeDisplayText(group.assetType);
  return {
    label: group.name.split('—')[1]?.trim() || group.name,
    cells: [
      assetType.includes('Nhà phố thương mại') ? 'Kinh doanh' : assetType.includes('TM') ? 'Thương mại' : 'Ở / cho thuê',
      localizeDisplayText(group.suitableBudget),
      localizeDisplayText(group.whyWatch.split('.')[0]?.trim() || group.whyWatch),
      inferLiquidity(group),
    ],
  };
}

function inferHoldPeriod(group: OpportunityGroup): string {
  if (/dòng tiền|cho thuê/i.test(group.suitableBudget)) return '3–7 năm';
  if (/tích lũy|nắm giữ dài/i.test(group.suitableBudget)) return '5–10 năm';
  if (/lướt|secondary/i.test(group.suitableBudget)) return '1–3 năm';
  return '3–5 năm';
}

function inferLiquidity(group: OpportunityGroup): string {
  if (/căn hộ|secondary/i.test(group.assetType + group.name)) return 'Trung bình — 3–9 tháng';
  if (/đất nền|tích lũy/i.test(group.assetType + group.suitableBudget)) return 'Chậm — 12–24 tháng';
  if (/shophouse|TM/i.test(group.assetType)) return 'Trung bình — theo dòng tiền thực';
  return 'Trung bình';
}

function buildSubsection(
  id: string,
  title: string,
  sourceGroups: OpportunityGroup[],
  tableHeaders: string[],
  mapRow: (group: OpportunityGroup) => PlaybookTableRow,
  extraAnalysis?: string[],
  overrides?: Partial<Pick<PlaybookSubsection, 'keyInsight' | 'whoFits' | 'watchPoints'>>,
): PlaybookSubsection {
  const analysis = (extraAnalysis?.length ? extraAnalysis : summarizeWatch(sourceGroups)).map(localizeDisplayText);
  const keyInsightRaw = sourceGroups.map(group => group.whyWatch).join(' ').slice(0, 280);
  return {
    id,
    title,
    analysis,
    tableHeaders,
    tableRows: sourceGroups.map(mapRow),
    keyInsight:
      overrides?.keyInsight ??
      localizeDisplayText(keyInsightRaw) + (sourceGroups.length > 1 ? '…' : ''),
    whoFits: overrides?.whoFits ?? mergeBudgets(sourceGroups),
    watchPoints: overrides?.watchPoints ?? mergeRisks(sourceGroups),
  };
}

function buildChapter1(): PlaybookChapter {
  const venBien = groups(1, 5, 6, 8);
  const namCanHo = groups(2, 3, 4);
  const shophouse = groups(7);

  return {
    number: 1,
    id: 'chapter-apartment',
    title: 'Đầu tư căn hộ',
    executiveSummary:
      'Căn hộ tại Đà Nẵng không phải một thị trường đồng nhất. Ven sông Hàn phục vụ lao động trí thức trung tâm; ven biển Nam mang đặc thù nghỉ dưỡng và thứ cấp; các dòng Sun FourS, S-Light, Cora, Spana tạo lớp sản phẩm khác nhau về vốn vào, tỷ suất cho thuê và thanh khoản. Nhà phố thương mại khối đế và thương mại trong quần thể Sun là lớp dòng tiền kinh doanh — tách biệt logic định giá với căn thuần.',
    subsections: [
      buildSubsection(
        'apt-riverside',
        'Căn hộ ven sông Hàn',
        [],
        ['Loại', 'Đối tượng', 'Chiến lược', 'Thời gian nắm giữ', 'Thanh khoản', 'Rủi ro'],
        apartmentRow,
        [
          'Phân khúc ven sông Hàn gắn với trung tâm và khu vực làm việc — khách thuê dài hạn từ khách sạn, giáo dục và dịch vụ. Tỷ suất cho thuê ổn định hơn ven biển Nam nhưng biên tăng giá hẹp hơn đất nền phía Nam.',
          'Symphony và các dòng Sun ven sông (nếu có trong danh mục) cần đối chiếu phí quản lý và chính sách cho thuê từng tòa — không sao chép tỷ suất từ tài liệu bán hàng ven biển.',
        ],
        {
          keyInsight:
            'Ven sông Hàn phù hợp chiến lược cho thuê dài hạn — tỷ suất ổn định hơn ven biển Nam, biên tăng giá thấp hơn đất nền phía Nam.',
          whoFits: 'Nhà đầu tư dòng tiền vốn 2–5 tỷ, ưu tiên khách thuê dài hạn trung tâm.',
          watchPoints: [
            'Đối chiếu phí quản lý từng tòa — không sao chép tỷ suất từ tài liệu ven biển.',
            'Symphony và các dòng Sun ven sông cần kiểm tra chính sách cho thuê riêng từng dự án.',
          ],
        },
      ),
      buildSubsection(
        'apt-coastal',
        'Căn hộ ven biển',
        venBien,
        ['Loại', 'Đối tượng', 'Chiến lược', 'Thời gian nắm giữ', 'Thanh khoản', 'Rủi ro'],
        apartmentRow,
      ),
      buildSubsection(
        'apt-south',
        'Căn hộ Nam Đà Nẵng',
        namCanHo,
        ['Loại', 'Đối tượng', 'Chiến lược', 'Thời gian nắm giữ', 'Thanh khoản', 'Rủi ro'],
        apartmentRow,
      ),
      buildSubsection(
        'apt-shophouse-pod',
        'Nhà phố thương mại khối đế',
        shophouse,
        ['Loại', 'Đối tượng', 'Chiến lược', 'Thời gian nắm giữ', 'Thanh khoản', 'Rủi ro'],
        apartmentRow,
        [
          'Nhà phố thương mại khối đế gắn với cư dân đã bàn giao trong quần thể Sun — doanh thu phụ thuộc lưu lượng khách nội khu, không phụ thuộc tour du lịch như mặt tiền ven biển.',
        ],
      ),
      buildSubsection(
        'apt-shophouse-retail',
        'Nhà phố thương mại ven biển',
        shophouse,
        ['Loại', 'Đối tượng', 'Chiến lược', 'Thời gian nắm giữ', 'Thanh khoản', 'Rủi ro'],
        apartmentRow,
        [
          'Nhà phố thương mại ven biển Nam phục vụ ẩm thực và dịch vụ lưu trú — mùa thấp điểm có thể làm doanh thu giảm 30–40%. Mô hình tài chính cần dự phòng theo quý.',
        ],
      ),
    ],
  };
}

function buildChapter2(): PlaybookChapter {
  return {
    number: 2,
    id: 'chapter-land',
    title: 'Đầu tư đất',
    executiveSummary:
      'Đất nền Nam Đà Nẵng không mua theo tên phân khu quảng cáo. Phân loại theo mục đích: mặt tiền kinh doanh, đất phát triển căn hộ, nhà phố thương mại, tích lũy và quỹ đất lớn. Mai Đăng Chơn là ví dụ tham chiếu — không phải danh sách sản phẩm đang chào bán.',
    subsections: [
      buildSubsection(
        'land-frontage',
        'Đất mặt tiền',
        groups(9, 12),
        ['Loại', 'Mục đích', 'Biên tăng trưởng', 'Thanh khoản', 'Thời gian giữ'],
        landRow,
      ),
      buildSubsection(
        'land-apartment-dev',
        'Đất phát triển căn hộ',
        groups(11),
        ['Loại', 'Mục đích', 'Biên tăng trưởng', 'Thanh khoản', 'Thời gian giữ'],
        landRow,
      ),
      buildSubsection(
        'land-shophouse',
        'Đất nhà phố thương mại',
        groups(10, 13),
        ['Loại', 'Mục đích', 'Biên tăng trưởng', 'Thanh khoản', 'Thời gian giữ'],
        landRow,
      ),
      buildSubsection(
        'land-accumulation',
        'Đất tích lũy',
        groups(14, 15),
        ['Loại', 'Mục đích', 'Biên tăng trưởng', 'Thanh khoản', 'Thời gian giữ'],
        landRow,
      ),
      buildSubsection(
        'land-large-lot',
        'Quỹ đất lớn',
        groups(14),
        ['Loại', 'Mục đích', 'Biên tăng trưởng', 'Thanh khoản', 'Thời gian giữ'],
        landRow,
        [
          'Quỹ đất lớn ven đô thị mới phù hợp chiến lược tích lũy 5–10 năm — thanh khoản thấp, cần vốn không gắn đòn bẩy cao.',
        ],
      ),
    ],
  };
}

function buildChapter3(): PlaybookChapter {
  return {
    number: 3,
    id: 'chapter-townhouse',
    title: 'Nhà phố',
    executiveSummary:
      'Nhà phố và nhà phố thương mại Nam phục vụ dân cư thực — khác chu kỳ căn hộ Sun. Phân tích theo mục đích sử dụng: ở, cho thuê, kinh doanh và đất thương mại — không gom theo tên dự án lặp lại.',
    subsections: [
      buildSubsection(
        'th-live',
        'Nhà phố ở',
        groups(16),
        ['Mục đích', 'Ngân sách', 'Dòng tiền / tích lũy', 'Thanh khoản'],
        townhouseRow,
      ),
      buildSubsection(
        'th-rent',
        'Nhà phố cho thuê',
        groups(16),
        ['Mục đích', 'Ngân sách', 'Dòng tiền / tích lũy', 'Thanh khoản'],
        townhouseRow,
        [
          'Nam Hòa Xuân có lớp cư dân gia đình dọn về từng đợt — nguyên căn cho thuê phục vụ hộ có con nhỏ, ổn định hơn lưu trú ngắn hạn.',
        ],
      ),
      buildSubsection(
        'th-shophouse',
        'Nhà phố thương mại',
        groups(17, 10, 13),
        ['Mục đích', 'Ngân sách', 'Dòng tiền / tích lũy', 'Thanh khoản'],
        townhouseRow,
      ),
      buildSubsection(
        'th-commercial-land',
        'Đất thương mại',
        groups(18),
        ['Mục đích', 'Ngân sách', 'Dòng tiền / tích lũy', 'Thanh khoản'],
        townhouseRow,
      ),
    ],
  };
}

function buildChapter4(): PlaybookChapter {
  const drivers = groups(19, 20);

  const driverSubsections: PlaybookSubsection[] = [
    {
      id: 'driver-fpt',
      title: 'FPT City & khu công nghệ',
      analysis: [
        'FPT City và cụm công nghệ phía Nam tạo lớp lao động tri thức — kéo nhu cầu thuê căn hộ và nhà phố trong bán kính 15 phút lái xe. Đây là động lực thị trường, không phải lý do để dồn toàn bộ vốn vào một dự án trong khu.',
      ],
      tableHeaders: ['Yếu tố', 'Tác động', 'Thời gian', 'Rủi ro quan sát'],
      tableRows: [
        {
          label: 'FPT City',
          cells: ['Nhu cầu thuê 6–12 tháng', 'Căn hộ Sun, nhà phố gần trục dân cư', '12–36 tháng', 'Trống phòng mùa dự án công nghệ thông tin'],
        },
      ],
      keyInsight: localizeDisplayText(drivers[0]?.whyWatch.slice(0, 240) ?? ''),
      whoFits: 'Tham chiếu khi chọn vị trí cho thuê — không mua đơn lẻ theo kịch bản công nghệ.',
      watchPoints: mergeRisks(drivers.slice(0, 1)),
    },
    {
      id: 'driver-university',
      title: 'Làng Đại học',
      analysis: [
        'Cụm Làng Đại học và Hòa Quý tạo nhu cầu thuê ổn định từ sinh viên và giảng viên — ít biến động theo mùa du lịch ven biển.',
      ],
      tableHeaders: ['Yếu tố', 'Tác động', 'Thời gian', 'Rủi ro quan sát'],
      tableRows: [
        {
          label: 'Làng Đại học',
          cells: ['Thuê phòng trọ / căn nhỏ', 'Căn S-Light, phòng trọ cải tạo', 'Học kỳ — 12 tháng', 'Trống mùa hè nếu không có khách dài hạn'],
        },
      ],
      keyInsight: 'Nhu cầu thuê học đường hỗ trợ thanh khoản cho căn nhỏ và nhà phố cho thuê gia đình.',
      whoFits: 'Nhà đầu tư dòng tiền vốn 2–4 tỷ.',
      watchPoints: ['Kiểm tra khoảng cách thực tế tới cụm trường — không tin mô tả trên bản trình bày.'],
    },
    {
      id: 'driver-metro',
      title: 'Metro & trục giao thông',
      analysis: [
        'Quy hoạch metro Đà Nẵng (khi có văn bản phê duyệt chính thức) sẽ ảnh hưởng giá đất ven ga — chỉ dùng làm kịch bản dài hạn, không định giá như đã có ga vận hành.',
        'Võ Chí Công, Nguyễn Tất Thành và vành đai phía Nam rút ngắn thời gian tới sân bay và trung tâm — hiệu ứng đã phản ánh một phần vào giá đất ven đô thị mới.',
      ],
      tableHeaders: ['Yếu tố', 'Tác động', 'Thời gian', 'Rủi ro quan sát'],
      tableRows: [
        {
          label: 'Metro (quy hoạch)',
          cells: ['Định giá đất ven ga', 'Chỉ khi có lộ trình khởi công', '5–10 năm', 'Mua theo tin đồn trước văn bản'],
        },
        {
          label: 'Vành đai / Võ Chí Công',
          cells: ['Kết nối Nam — trung tâm', 'Đã vận hành một phần', 'Ngay', 'Giá đã cao hơn mặt bằng tại nút giao thông'],
        },
      ],
      keyInsight: localizeDisplayText(drivers[1]?.whyWatch.slice(0, 240) ?? ''),
      whoFits: 'Tham chiếu định giá đất nền và nhà phố Nam — không thay thế so sánh giao dịch thực tế.',
      watchPoints: mergeRisks(drivers.slice(1)),
    },
    {
      id: 'driver-market',
      title: 'Chợ đầu mối, hậu cần & doanh nghiệp chuyển dịch',
      analysis: [
        'Chợ đầu mối Hòa Cường và hành lang hậu cần tạo việc làm phi nông nghiệp — hỗ trợ nhu cầu nhà ở xã hội và nhà phố cho thuê.',
        'Cơ quan và doanh nghiệp dần chuyển văn phòng về Nam — lớp khách thuê trung cấp ổn định, ít phụ thuộc mùa du lịch.',
      ],
      tableHeaders: ['Yếu tố', 'Tác động', 'Thời gian', 'Rủi ro quan sát'],
      tableRows: [
        {
          label: 'Chợ đầu mối / hậu cần',
          cells: ['Việc làm phi nông nghiệp', 'Thuê nhà phố, căn dịch vụ', '24–36 tháng', 'Dân cư chưa về đủ — nhà phố thương mại trống'],
        },
        {
          label: 'Doanh nghiệp chuyển dịch',
          cells: ['Thuê trung cấp', 'Hòa Quý, Nam Hòa Xuân', '12–24 tháng', 'Cam kết thuê trên bản trình bày chưa có hợp đồng thật'],
        },
      ],
      keyInsight: 'Hạ tầng và hậu cần phía Nam tạo hiệu ứng lan tỏa lên giá đất ven đô thị — đối chiếu số hộ nhận nhà thực tế trước khi trả giá cao.',
      whoFits: 'Nhà đầu tư nắm giữ đất/nhà phố Nam 3–7 năm.',
      watchPoints: mergeRisks(drivers),
    },
    {
      id: 'driver-coastal',
      title: 'Cổ Cò, ven biển & sông',
      analysis: [
        'Mai Đăng Chơn ven sông Cổ Cò và hành lang ven biển Nam (Non Nước, Điện Ngọc) mang kịch bản nghỉ dưỡng — chu kỳ khác đô thị thuần. Ven sông phục vụ nhà phố thương mại hướng nhìn sông; ven biển phụ thuộc mùa du lịch.',
      ],
      tableHeaders: ['Yếu tố', 'Tác động', 'Thời gian', 'Rủi ro quan sát'],
      tableRows: [
        {
          label: 'Sông Cổ Cò / Mai Đăng Chơn',
          cells: ['Nhà phố thương mại hướng nhìn sông', 'Cư dân nội khu', '3–5 năm', 'Nhà phố thương mại giai đoạn đầu trống 12 tháng'],
        },
        {
          label: 'Ven biển Nam',
          cells: ['Nghỉ dưỡng & nhà thứ hai', 'Sun Group, biệt thự', '5–10 năm', 'Mùa thấp điểm du lịch'],
        },
      ],
      keyInsight: 'Phân tách logic ven sông (cư dân) và ven biển (du lịch) — không gom một mức giá.',
      whoFits: 'Vốn dài hạn, chấp nhận giai đoạn nhà phố thương mại/nghỉ dưỡng trống đầu.',
      watchPoints: ['Lưu lượng khách cuối tuần tại phân khu đã mở — quan trọng hơn hình ảnh 3D.'],
    },
  ];

  return {
    number: 4,
    id: 'chapter-drivers',
    title: 'Điều gì đang làm Nam Đà Nẵng thay đổi',
    executiveSummary:
      'Động lực thị trường — không phải sản phẩm cụ thể. FPT City, Làng Đại học, metro, hậu cần, doanh nghiệp chuyển dịch và hành lang ven sông/biển tạo lớp nhu cầu nền. Dùng để tham chiếu định giá và chọn vị trí — không thay thế so sánh giao dịch thực tế.',
    subsections: driverSubsections,
  };
}

export function buildInvestmentPlaybook(): Omit<
  InvestmentPlaybookContent,
  'source' | 'sourceLabel'
> {
  return {
    type: 'investment-playbook',
    edition: 'Ấn bản 2026',
    publisher: 'Estoria · Nghiên cứu Đà Nẵng',
    chapters: [buildChapter1(), buildChapter2(), buildChapter3(), buildChapter4()],
    closingMessage:
      'Nếu muốn nhận danh mục tài sản phù hợp với ngân sách và mục tiêu đầu tư, hãy để lại thông tin để đội ngũ tư vấn gửi bảng hàng mới nhất.',
  };
}
