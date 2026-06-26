export type LeadMagnetContentSource = 'static-framework' | 'mixed' | 'database';

export const LEAD_MAGNET_FRAMEWORK_SOURCE_LABEL =
  'Tài liệu tổng hợp từ khung phân tích thị trường và các nhóm tài sản đang được theo dõi.';

export const LEAD_MAGNET_DISCLAIMER =
  'Tài liệu này là khung tham khảo phục vụ nghiên cứu thị trường, không phải bảng chào bán sản phẩm cụ thể, không phải cam kết lợi nhuận. Nhà đầu tư cần kiểm tra pháp lý, quy hoạch, giá giao dịch thực tế và khả năng khai thác trước khi ra quyết định.';

export function formatOpportunityGroupLabel(rank: number): string {
  return `Nhóm ${String(rank).padStart(2, '0')}`;
}

export interface OpportunityGroup {
  rank: number;
  name: string;
  area: string;
  assetType: string;
  whyWatch: string;
  risks: string;
  suitableBudget: string;
}

export interface BudgetTier {
  range: string;
  assetTypes: string[];
  advantages: string[];
  limitations: string[];
}

export interface BudgetFrameworkSection {
  kind: 'budget-framework';
  id: string;
  title: string;
  intro: string;
  tiers: BudgetTier[];
}

export interface OperationalRiskItem {
  topic: string;
  description: string;
  mitigation: string;
}

export interface RemoteOpsRiskSection {
  kind: 'remote-ops-risk';
  id: string;
  title: string;
  intro: string;
  items: OperationalRiskItem[];
}

export interface ChecklistPhase {
  label: string;
  items: string[];
}

export interface PrePurchaseChecklistSection {
  kind: 'pre-purchase-checklist';
  id: string;
  title: string;
  intro: string;
  phases: ChecklistPhase[];
}

export interface MarketInsightSection {
  kind: 'market-insight';
  id: string;
  title: string;
  summary: string;
  keyDrivers: string[];
  watchPoints: string[];
  investorFit: string;
  risks: string[];
}

export type ReportSection =
  | MarketInsightSection
  | BudgetFrameworkSection
  | RemoteOpsRiskSection
  | PrePurchaseChecklistSection;

export interface InvestmentMapZone {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  note: string;
}

export type ReportChapterBlock =
  | {
      kind: 'prose';
      id: string;
      heading?: string;
      paragraphs: string[];
    }
  | {
      kind: 'zone-focus';
      id: string;
      zone: string;
      paragraphs: string[];
    }
  | {
      kind: 'product-segment';
      id: string;
      name: string;
      buyerProfile: string;
      renterProfile: string;
      liquidity: string;
      strengths: string;
      limitations: string;
      strategyFit: string;
    }
  | {
      kind: 'factor';
      id: string;
      factor: string;
      analysis: string;
    }
  | {
      kind: 'due-diligence';
      id: string;
      topic: string;
      guidance: string;
    };

export interface InvestmentReportChapter {
  number: number;
  title: string;
  blocks: ReportChapterBlock[];
}

export interface InvestmentReportContent {
  type: 'investment-report';
  edition: string;
  publisher: string;
  chapters: InvestmentReportChapter[];
  source: LeadMagnetContentSource;
  sourceLabel: string;
}

export interface PlaybookTableRow {
  label: string;
  cells: string[];
}

export interface PlaybookSubsection {
  id: string;
  title: string;
  analysis: string[];
  tableHeaders: string[];
  tableRows: PlaybookTableRow[];
  keyInsight: string;
  whoFits: string;
  watchPoints: string[];
}

export interface PlaybookChapter {
  number: number;
  id: string;
  title: string;
  executiveSummary: string;
  subsections: PlaybookSubsection[];
}

export interface InvestmentPlaybookContent {
  type: 'investment-playbook';
  edition: string;
  publisher: string;
  chapters: PlaybookChapter[];
  closingMessage: string;
  source: LeadMagnetContentSource;
  sourceLabel: string;
}

export type LeadMagnetContent =
  | InvestmentPlaybookContent
  | InvestmentReportContent
  | {
      type: 'report';
      sections: ReportSection[];
      source: LeadMagnetContentSource;
      sourceLabel: string;
    }
  | {
      type: 'opportunity-framework';
      groups: OpportunityGroup[];
      source: LeadMagnetContentSource;
      sourceLabel: string;
    }
  | {
      type: 'map';
      zones: InvestmentMapZone[];
      source: LeadMagnetContentSource;
      sourceLabel: string;
    };

export interface LeadMagnetContentMeta {
  slug: string;
  title: string;
  contentType: LeadMagnetContent['type'];
  source: LeadMagnetContentSource;
  itemCount: number;
}
