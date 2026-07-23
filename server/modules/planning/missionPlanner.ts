/**
 * Mission Planner — proposes buyer/investor missions from campaign context.
 * Does not start Mission Engine runs.
 */

import { createHash } from 'node:crypto';
import type { MissionProposal } from './types';

const PERSONAS: Array<Omit<MissionProposal, 'id' | 'name' | 'areaHint'> & { name: string; area: string }> = [
  {
    name: 'Buyer',
    persona: 'Người mua ở',
    area: 'property',
    intent: 'mua ở thực',
    priority: 'high',
    suggestedTemplateKey: 'scan-facebook-group',
  },
  {
    name: 'Investor Hà Nội',
    persona: 'Nhà đầu tư Hà Nội',
    area: 'Hà Nội → Đà Nẵng',
    intent: 'đầu tư',
    priority: 'high',
    suggestedTemplateKey: 'scan-facebook-group',
  },
  {
    name: 'Người hỏi đất Nam Đà Nẵng',
    persona: 'Buyer đất nền',
    area: 'Nam Đà Nẵng',
    intent: 'hỏi đất',
    priority: 'medium',
    suggestedTemplateKey: 'scan-facebook-group',
  },
  {
    name: 'Người hỏi FPT',
    persona: 'Buyer/Investor FPT',
    area: 'FPT City',
    intent: 'hỏi FPT',
    priority: 'medium',
    suggestedTemplateKey: 'scan-facebook-group',
  },
  {
    name: 'Người hỏi Ngũ Hành Sơn',
    persona: 'Buyer NHS',
    area: 'Ngũ Hành Sơn',
    intent: 'hỏi NHS',
    priority: 'medium',
    suggestedTemplateKey: 'scan-facebook-group',
  },
  {
    name: 'Đầu tư nghỉ dưỡng',
    persona: 'NĐT nghỉ dưỡng',
    area: 'ven biển ĐN',
    intent: 'nghỉ dưỡng',
    priority: 'low',
    suggestedTemplateKey: 'scan-facebook-group',
  },
  {
    name: 'Đổi nhà',
    persona: 'Gia đình đổi nhà',
    area: 'Đà Nẵng',
    intent: 'đổi nhà',
    priority: 'medium',
    suggestedTemplateKey: 'scan-facebook-group',
  },
];

export function proposeMissions(input: {
  propertyHint: string;
  campaignName?: string;
}): MissionProposal[] {
  const property = input.propertyHint || input.campaignName || 'Đà Nẵng';
  return PERSONAS.map((p, idx) => {
    const name =
      p.name === 'Buyer' ? `Buyer — ${property}` : p.name.includes(property) ? p.name : `${p.name}`;
    const id = `msn_${createHash('sha1').update(`${name}:${idx}`).digest('hex').slice(0, 10)}`;
    return {
      id,
      name,
      persona: p.persona,
      areaHint: p.area === 'property' ? property : p.area,
      intent: p.intent,
      priority: p.priority,
      suggestedTemplateKey: p.suggestedTemplateKey,
    };
  });
}
