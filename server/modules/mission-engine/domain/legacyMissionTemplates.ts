/**
 * Legacy mission templates (workflowVersion=1) moved under mission-engine domain
 * to keep a single official mission registry source.
 */

export interface LegacyMissionTemplateSchedule {
  cadence: 'hourly' | 'every_2h' | 'every_4h' | 'daily' | 'manual';
  preferredHoursLocal?: number[];
  timezone?: string;
}

export interface LegacyMissionTemplateRules {
  sourceIds: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  minFindingScore: number;
  minScore: number;
  notifyScore: number;
  maxItemsPerRun: number;
  analysisInstructions: string;
  preferredSourceTypes?: Array<'facebook_group' | 'website' | 'forum' | 'search'>;
}

export interface LegacyMissionTemplate {
  id: string;
  name: string;
  objective: string;
  rules: LegacyMissionTemplateRules;
  schedule: LegacyMissionTemplateSchedule;
}

const TZ = 'Asia/Ho_Chi_Minh';

export const LEGACY_MISSION_TEMPLATES: LegacyMissionTemplate[] = [
  {
    id: 'land-fund-buyers-south-danang',
    name: 'Tìm khách mua quỹ đất lớn Nam Đà Nẵng',
    objective:
      'Phát hiện nhu cầu mua quỹ đất / lô lớn khu vực Nam Đà Nẵng (Ngũ Hành Sơn, Hòa Xuân, Cẩm Lệ phía nam, ven sông…) để follow-up bán.',
    rules: {
      sourceIds: [],
      preferredSourceTypes: ['facebook_group', 'website', 'forum'],
      positiveKeywords: ['mua đất', 'quỹ đất', 'lô lớn', 'nam đà nẵng', 'ngũ hành sơn', 'hòa xuân', 'cẩm lệ', 'đất nền', 'đầu tư đất', 'cần mua đất'],
      negativeKeywords: ['cho thuê', 'sang nhượng quán', 'tuyển dụng', 'bán sim'],
      minFindingScore: 55,
      minScore: 55,
      notifyScore: 75,
      maxItemsPerRun: 40,
      analysisInstructions:
        'Ưu tiên người đang tìm mua đất/quỹ đất lớn Nam Đà Nẵng. Ghi nhận diện tích, ngân sách, khu vực, mức độ gấp. Bỏ qua tin rao bán thuần túy nếu không có tín hiệu mua.',
    },
    schedule: { cadence: 'every_4h', preferredHoursLocal: [8, 12, 16, 20], timezone: TZ },
  },
  {
    id: 'commercial-lease-danang',
    name: 'Tìm khách thuê mặt bằng Đà Nẵng',
    objective: 'Theo dõi nhu cầu thuê mặt bằng kinh doanh / văn phòng / shop tại Đà Nẵng để kết nối nguồn hàng thuê.',
    rules: {
      sourceIds: [],
      preferredSourceTypes: ['facebook_group', 'website', 'forum'],
      positiveKeywords: ['thuê mặt bằng', 'cần thuê', 'mặt bằng đà nẵng', 'thuê shop', 'thuê cửa hàng', 'thuê văn phòng', 'mặt tiền', 'kinh doanh'],
      negativeKeywords: ['tuyển nhân viên', 'shipper', 'bán sim', 'cho thuê xe'],
      minFindingScore: 50,
      minScore: 50,
      notifyScore: 72,
      maxItemsPerRun: 40,
      analysisInstructions:
        'Tập trung người đang tìm thuê mặt bằng. Trích xuất loại hình (shop/VP/kho), khu vực, diện tích, ngân sách thuê, thời gian cần. Phân biệt tin cho thuê vs tin cần thuê.',
    },
    schedule: { cadence: 'every_2h', preferredHoursLocal: [7, 9, 11, 14, 17, 20], timezone: TZ },
  },
  {
    id: 'apartment-demand-watch',
    name: 'Theo dõi nhu cầu căn hộ',
    objective: 'Theo dõi tín hiệu mua/thuê căn hộ (chung cư) để phát hiện lead và xu hướng nhu cầu theo khu vực.',
    rules: {
      sourceIds: [],
      preferredSourceTypes: ['facebook_group', 'website'],
      positiveKeywords: ['căn hộ', 'chung cư', 'mua căn hộ', 'thuê căn hộ', 'cần căn hộ', 'studio', '2pn', '3pn', 'condo'],
      negativeKeywords: ['tuyển dụng', 'bán sim', 'ship đồ'],
      minFindingScore: 50,
      minScore: 50,
      notifyScore: 70,
      maxItemsPerRun: 50,
      analysisInstructions:
        'Phân loại mua vs thuê căn hộ. Ghi số phòng, ngân sách, dự án/khu vực mong muốn, timeline. Ưu tiên tin có ngân sách hoặc khu vực rõ.',
    },
    schedule: { cadence: 'every_4h', preferredHoursLocal: [8, 13, 18], timezone: TZ },
  },
  {
    id: 'group-hot-topics',
    name: 'Theo dõi chủ đề nổi bật trong các group',
    objective: 'Quét các Facebook group đã cấu hình để phát hiện chủ đề / nhu cầu đang nóng trong ngày (không chỉ lead bán hàng).',
    rules: {
      sourceIds: [],
      preferredSourceTypes: ['facebook_group'],
      positiveKeywords: ['cần tư vấn', 'hỏi mua', 'hỏi thuê', 'giá đất', 'pháp lý', 'quy hoạch', 'dự án', 'đầu tư'],
      negativeKeywords: ['spam', 'like page', 'bán sim', 'tuyển ctv'],
      minFindingScore: 45,
      minScore: 45,
      notifyScore: 68,
      maxItemsPerRun: 60,
      analysisInstructions:
        'Tóm tắt chủ đề thảo luận nổi bật, mức độ quan tâm, và tín hiệu nhu cầu ẩn. Không bịa engagement; chỉ dựa trên nội dung bài đã quét.',
    },
    schedule: { cadence: 'hourly', preferredHoursLocal: [7, 8, 9, 10, 11, 12, 14, 16, 18, 20], timezone: TZ },
  },
  {
    id: 'selected-re-websites',
    name: 'Đọc các website bất động sản được chọn',
    objective: 'Định kỳ đọc các website/forum BĐS đã gắn vào mission để thu thập tin mới và finding theo rule.',
    rules: {
      sourceIds: [],
      preferredSourceTypes: ['website', 'forum'],
      positiveKeywords: ['bất động sản', 'nhà đất', 'căn hộ', 'đất nền', 'mặt bằng', 'đà nẵng', 'cho thuê', 'bán'],
      negativeKeywords: ['tuyển dụng it', 'crypto', 'forex'],
      minFindingScore: 40,
      minScore: 40,
      notifyScore: 70,
      maxItemsPerRun: 80,
      analysisInstructions:
        'Ưu tiên tin có địa điểm Đà Nẵng / miền Trung và tín hiệu giao dịch rõ. Chuẩn hóa tiêu đề, giá, khu vực nếu có trong bài.',
    },
    schedule: { cadence: 'every_4h', preferredHoursLocal: [6, 10, 14, 18, 22], timezone: TZ },
  },
];

export function getLegacyMissionTemplateById(id: string): LegacyMissionTemplate | undefined {
  return LEGACY_MISSION_TEMPLATES.find(t => t.id === id);
}

export function listLegacyMissionTemplates(): LegacyMissionTemplate[] {
  return LEGACY_MISSION_TEMPLATES.map(t => ({
    ...t,
    rules: { ...t.rules, positiveKeywords: [...t.rules.positiveKeywords], negativeKeywords: [...t.rules.negativeKeywords] },
    schedule: { ...t.schedule, preferredHoursLocal: t.schedule.preferredHoursLocal ? [...t.schedule.preferredHoursLocal] : undefined },
  }));
}

export function buildLegacyMissionPayloadFromTemplate(
  template: LegacyMissionTemplate,
  overrides?: {
    sourceIds?: string[];
    name?: string;
    objective?: string;
    status?: string;
  },
) {
  const sourceIds = overrides?.sourceIds?.length ? overrides.sourceIds : template.rules.sourceIds;
  return {
    name: overrides?.name?.trim() || template.name,
    objective: overrides?.objective?.trim() || template.objective,
    status: overrides?.status || 'draft',
    rules: {
      templateId: template.id,
      sourceIds,
      preferredSourceTypes: template.rules.preferredSourceTypes,
      positiveKeywords: template.rules.positiveKeywords,
      negativeKeywords: template.rules.negativeKeywords,
      keywords: template.rules.positiveKeywords,
      minFindingScore: template.rules.minFindingScore,
      minScore: template.rules.minScore,
      notifyScore: template.rules.notifyScore,
      maxItemsPerRun: template.rules.maxItemsPerRun,
      analysisInstructions: template.rules.analysisInstructions,
    },
    schedule: {
      ...template.schedule,
      templateId: template.id,
    },
  };
}
