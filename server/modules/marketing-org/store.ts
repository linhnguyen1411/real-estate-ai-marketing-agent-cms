/**
 * Persist Marketing Org workspace in AppSetting (no new CRM / publisher tables).
 */

import { prisma } from '../../prisma';
import type {
  ContentPack,
  ContentReusePlan,
  MarketingLearningState,
  MarketingOrgSnapshot,
} from './types';
import { FUNNEL_STAGES } from './types';

const SETTING_KEY = 'marketing_org_h4';

type StoredState = {
  packs: ContentPack[];
  reusePlans: ContentReusePlan[];
  learning: MarketingLearningState;
  defaultTopic: string;
};

const DEFAULT_LEARNING: MarketingLearningState = {
  bestFormats: ['Reel 15s', 'Threads 3-part'],
  bestHours: ['08:00', '18:00', '20:00'],
  bestCtas: ['Comment INFO', 'Nhắn GIÁ'],
  bestCampaigns: [],
  notes: [],
  updatedAt: new Date().toISOString(),
};

export async function loadMarketingState(): Promise<StoredState> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const data = (row?.data || {}) as Partial<StoredState>;
  return {
    packs: Array.isArray(data.packs) ? data.packs : [],
    reusePlans: Array.isArray(data.reusePlans) ? data.reusePlans : [],
    learning: data.learning || DEFAULT_LEARNING,
    defaultTopic: typeof data.defaultTopic === 'string' ? data.defaultTopic : 'Mai Đăng Chơn',
  };
}

export async function saveMarketingState(state: StoredState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

export function emptySnapshotExtras(): Pick<MarketingOrgSnapshot, 'funnel' | 'version'> {
  return { version: 'h4_v1', funnel: FUNNEL_STAGES };
}
