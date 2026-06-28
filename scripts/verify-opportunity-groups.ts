import { getLeadMagnetContent } from '../server/services/leadMagnetContentService';
import { normalizeOpportunityGroup } from '../src/leadGen/normalizeOpportunityGroup';

const legacy = {
  rank: 3,
  name: 'Mai Đăng Chơn — Đất nền 100m²',
  area: 'Nam Đà Nẵng',
  price: '2.9 tỷ',
  potential: 'TB+',
  rating: 'B+',
};

const normalized = normalizeOpportunityGroup(legacy, 2);
if (!normalized?.whyWatch || !normalized.assetType) {
  throw new Error('Legacy TOP_20 row did not merge framework fields');
}

const content = getLeadMagnetContent('top-20-co-hoi-dau-tu');
if (!content || content.type !== 'investment-playbook') {
  throw new Error('Lead magnet content missing or wrong type (expected investment-playbook)');
}

if (content.chapters.length !== 4) {
  throw new Error(`Expected 4 chapters, got ${content.chapters.length}`);
}

const subsectionCount = content.chapters.reduce((sum, chapter) => sum + chapter.subsections.length, 0);
if (subsectionCount < 10) {
  throw new Error(`Expected at least 10 subsections, got ${subsectionCount}`);
}

if (!content.closingMessage.includes('danh mục tài sản')) {
  throw new Error('Missing closing CTA message');
}

console.log(
  `PASS — investment playbook: ${content.chapters.length} chapters, ${subsectionCount} subsections`
);
