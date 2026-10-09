/**
 * Lead Scoring & Intent Pipeline for Desktop Agent App.
 * Classifies SUPPLY vs DEMAND, scores 0-100, extracts Phone, Price, Nam Hòa Xuân Blocks/Lots.
 */

import { extractLeadData, type DeterministicExtraction } from '../../../../server/agent/extractors/index';
import type { ExtractedLeadData, PostClassification } from '../../shared/types';

export function processRawPostToLead(
  sourceType: 'facebook' | 'zalo',
  sourceName: string,
  rawText: string,
  meta?: {
    externalId?: string;
    sourceUrl?: string;
    authorName?: string;
    senderPhone?: string;
    timestamp?: number;
  }
): ExtractedLeadData {
  const extracted: DeterministicExtraction = extractLeadData(rawText);

  // Map postType to SUPPLY / DEMAND / UNKNOWN
  let classification: PostClassification = 'UNKNOWN';
  if (extracted.leadScoring.postType === 'SUPPLY') {
    classification = 'SUPPLY';
  } else if (extracted.leadScoring.postType === 'DEMAND') {
    classification = 'DEMAND';
  }

  // Detect Nam Hòa Xuân Block / Lot pattern (e.g., B2-12, B2.14, lô 45, block B1-10)
  let projectBlock: string | undefined = undefined;
  const specificBlockMatch = rawText.match(/\b(block\s*B\d{1,2}[-._]\d{1,3}|B\d{1,2}[-._]\d{1,3}|lô\s*\d{1,4})\b/i);
  if (specificBlockMatch) {
    projectBlock = specificBlockMatch[0].toUpperCase();
  } else {
    const areaMatch = rawText.match(/\b(khu\s*đô\s*thị\s*nam\s*hòa\s*xuân|nam\s*hòa\s*xuân|hòa\s*xuân)\b/i);
    if (areaMatch) {
      projectBlock = areaMatch[0].toUpperCase();
    }
  }

  // Primary Phone: prefer extractor, fallback to senderPhone if given from Zalo
  const primaryPhone = extracted.phone.primaryPhone || meta?.senderPhone || undefined;

  // Price formatting
  let askingPrice: string | undefined = undefined;
  if (extracted.money.money.length > 0) {
    const firstWithDisplay = extracted.money.money.find((m) => m.display);
    if (firstWithDisplay?.display) {
      askingPrice = firstWithDisplay.display;
    }
  }
  if (!askingPrice && extracted.money.askingPrice) {
    askingPrice = (extracted.money.askingPrice / 1_000_000_000).toFixed(2) + ' tỷ';
  }

  // Location formatting
  const locationArea = extracted.location.primaryLocation ||
    (extracted.location.normalizedLocations.length > 0 ? extracted.location.normalizedLocations[0] : undefined);

  const intentScore = extracted.leadScoring.intentScore;
  const isHotLead = intentScore >= 70;

  const id = `${sourceType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    sourceType,
    sourceName,
    sourceUrl: meta?.sourceUrl,
    authorName: meta?.authorName || (sourceType === 'zalo' ? 'Zalo Member' : 'Facebook Member'),
    authorPhone: primaryPhone,
    rawText,
    classification,
    intentScore,
    isHotLead,
    askingPrice,
    locationArea,
    projectBlock,
    timestamp: meta?.timestamp || Date.now(),
    syncStatus: 'pending',
  };
}
