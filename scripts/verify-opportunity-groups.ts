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
if (!content || content.type !== 'opportunity-framework') {
  throw new Error('Lead magnet content missing or wrong type');
}

const requiredFields = ['area', 'assetType', 'whyWatch', 'risks', 'suitableBudget'] as const;

for (const rank of [1, 5, 10, 20]) {
  const group = content.groups.find(item => item.rank === rank);
  if (!group) throw new Error(`Missing group rank ${rank}`);

  const missing = requiredFields.filter(field => !group[field].trim());
  if (missing.length > 0) {
    throw new Error(`Group ${rank} missing fields: ${missing.join(', ')}`);
  }
}

console.log('PASS — opportunity groups 01, 05, 10, 20 have full field mapping');
