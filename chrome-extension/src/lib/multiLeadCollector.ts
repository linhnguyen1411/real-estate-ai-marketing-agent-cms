import { getPostBlocks, type ScanScope } from './postBlockScanner';
import { cleanFacebookNoise } from './cleanFacebookNoise';
import { extractVietnamPhones } from './extractVietnamPhones';
import { extractLeadContextAroundPhone } from './phoneContextExtractor';
import { makePostHash } from './hash';
import type { CollectedLead, ScanRoundResult, ScanRoundStats, SkippedItem } from '../types';

function findRawMatchForPhone(rawMatches: string[], phone: string): string {
  const digits = phone.replace(/\D/g, '');
  for (const raw of rawMatches) {
    if (raw.replace(/\D/g, '').includes(digits)) return raw;
  }
  return phone;
}

function buildLeadKey(phone: string, context: string): string {
  return makePostHash(phone, context.slice(0, 500));
}

/** Quét DOM — scope loaded = toàn feed đã load (auto scroll), viewport = chỉ vùng nhìn thấy */
export function scanVisibleBlocks(seenBlockIds: Set<string>, scope: ScanScope = 'viewport'): ScanRoundResult {
  const blocks = getPostBlocks(scope);
  const leads: CollectedLead[] = [];
  const skipped: SkippedItem[] = [];
  let phonesFoundTotal = 0;
  let dedupedCount = 0;
  let skippedNoiseCount = 0;
  let newBlocksCount = 0;
  const roundKeys = new Set<string>();

  for (const block of blocks) {
    if (seenBlockIds.has(block.blockId)) {
      continue;
    }
    seenBlockIds.add(block.blockId);
    newBlocksCount += 1;

    const cleaned = cleanFacebookNoise(block.text);
    if (!cleaned || cleaned.length < 15) {
      skippedNoiseCount += 1;
      skipped.push({ blockId: block.blockId, skippedReason: 'empty_block' });
      continue;
    }

    const phoneResult = extractVietnamPhones(cleaned);
    phonesFoundTotal += phoneResult.validPhones.length;

    if (!phoneResult.validPhones.length) {
      continue;
    }

    for (const phone of phoneResult.validPhones) {
      const rawMatch = findRawMatchForPhone(phoneResult.rawMatches, phone);
      const { cleanContextText } = extractLeadContextAroundPhone(cleaned, rawMatch);
      const dedupKey = buildLeadKey(phone, cleanContextText);

      if (roundKeys.has(dedupKey)) {
        dedupedCount += 1;
        continue;
      }
      roundKeys.add(dedupKey);

      leads.push({
        phone,
        phones: phoneResult.validPhones,
        possible_phones: phoneResult.possiblePhones,
        raw_content: cleanContextText,
        url: block.url,
        source_url: block.url,
        source_title: block.sourceTitle,
        blockId: block.blockId,
        title: block.sourceTitle,
        selected: true,
        dedupKey,
        collectedAt: new Date().toISOString()
      });
    }
  }

  const stats: ScanRoundStats = {
    visibleBlocksCount: blocks.length,
    newBlocksCount,
    phonesFoundTotal,
    leadsCreated: leads.length,
    dedupedCount,
    skippedNoiseCount,
    skippedNoBdsContextCount: 0
  };

  return { leads, skipped, stats };
}

export function mergeScanLeads(
  existing: CollectedLead[],
  incoming: CollectedLead[]
): { merged: CollectedLead[]; added: number; dedupedCount: number; possibleDuplicates: number } {
  const keys = new Set(existing.map(l => l.dedupKey));
  const phoneKeys = new Map<string, string[]>();
  existing.forEach(l => {
    const list = phoneKeys.get(l.phone) || [];
    list.push(l.dedupKey);
    phoneKeys.set(l.phone, list);
  });

  const merged = [...existing];
  let added = 0;
  let dedupedCount = 0;
  let possibleDuplicates = 0;

  for (const lead of incoming) {
    if (keys.has(lead.dedupKey)) {
      dedupedCount += 1;
      continue;
    }

    if ((phoneKeys.get(lead.phone) || []).length > 0) {
      lead.possibleDuplicate = true;
      possibleDuplicates += 1;
    }

    keys.add(lead.dedupKey);
    const list = phoneKeys.get(lead.phone) || [];
    list.push(lead.dedupKey);
    phoneKeys.set(lead.phone, list);

    merged.push({ ...lead, leadIndex: merged.length + 1, selected: lead.selected !== false });
    added += 1;
  }

  merged.forEach((l, i) => { l.leadIndex = i + 1; });
  return { merged, added, dedupedCount, possibleDuplicates };
}
