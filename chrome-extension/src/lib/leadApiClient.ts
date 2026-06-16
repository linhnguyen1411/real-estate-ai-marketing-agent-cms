import { sendToBackground } from './messaging';
import type { CollectedLead } from '../types';
import { normalizeToValidMobile10 } from './extractVietnamPhones';

export interface LeadBatchItem {
  raw_content: string;
  source_url?: string;
  source_title?: string;
  block_id?: string;
  phone?: string;
}

const SAVE_CHUNK_SIZE = 10;

function normalizePhone(phone?: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  return normalizeToValidMobile10(digits);
}

function isValidPhone(phone?: string): boolean {
  return normalizePhone(phone) !== null;
}

/** Gọi API qua background service worker — ổn định hơn fetch từ content script */
export async function extractBatchViaBackground(items: LeadBatchItem[]): Promise<any[]> {
  if (!items.length) return [];

  const res = await sendToBackground<any[]>({
    type: 'API_EXTRACT_BATCH',
    payload: { items }
  });

  if (!res.ok) throw new Error(res.error || 'Extract batch failed');
  return res.data ?? [];
}

async function parseApiResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server lỗi (${res.status}): ${text.slice(0, 150)}`);
  }
}

/** Lưu trực tiếp từ popup — tránh giới hạn sendMessage với 30+ lead */
export async function saveLeadsBatch(
  apiBase: string,
  token: string,
  leads: Array<Record<string, unknown>>,
  source = 'facebook-feed-auto',
  onProgress?: (done: number, total: number) => void
): Promise<{ saved_count: number; duplicate_count: number }> {
  const validLeads = leads.filter(l => isValidPhone(String(l.phone || '')));
  if (!validLeads.length) {
    throw new Error('Không có lead hợp lệ — thiếu SĐT.');
  }

  const url = `${apiBase.replace(/\/$/, '')}/api/leads/batch-save`;
  let saved_count = 0;
  let duplicate_count = 0;

  for (let i = 0; i < validLeads.length; i += SAVE_CHUNK_SIZE) {
    const chunk = validLeads.slice(i, i + SAVE_CHUNK_SIZE);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ leads: chunk, source, slim: true })
    });

    const json = await parseApiResponse(res);
    if (!res.ok || json.status !== 'success') {
      const chunkNo = Math.floor(i / SAVE_CHUNK_SIZE) + 1;
      throw new Error(json.message || `Lưu thất bại (batch ${chunkNo}, HTTP ${res.status})`);
    }

    saved_count += json.data?.saved_count ?? 0;
    duplicate_count += json.data?.duplicate_count ?? 0;
    onProgress?.(Math.min(i + chunk.length, validLeads.length), validLeads.length);
  }

  return { saved_count, duplicate_count };
}

/** Fallback qua background (ít lead) */
export async function saveBatchViaBackground(
  leads: Array<Record<string, unknown>>,
  source = 'facebook-feed-auto'
): Promise<{ saved_count: number; duplicate_count: number }> {
  const validLeads = leads.filter(l => isValidPhone(String(l.phone || '')));
  if (!validLeads.length) {
    throw new Error('Không có lead hợp lệ — thiếu SĐT.');
  }

  const res = await sendToBackground<{ saved_count: number; duplicate_count: number }>({
    type: 'API_BATCH_SAVE',
    payload: { leads: validLeads, source, slim: true }
  });

  if (!res.ok) throw new Error(res.error || 'Batch save failed');
  return res.data ?? { saved_count: 0, duplicate_count: 0 };
}

export function serverItemToCollectedLead(item: any, dedupKey: string): CollectedLead {
  return {
    phone: item.phone || '',
    phones: item.phones || [],
    possible_phones: item.possible_phones || [],
    demand_type: item.demand_type,
    property_type: item.property_type,
    location: item.location,
    budget: item.budget,
    confidence_score: item.confidence_score,
    raw_content: item.raw_content,
    url: item.url || item.source_url,
    source_url: item.url || item.source_url,
    source_title: item.title || item.source_title,
    blockId: item.block_id,
    title: item.title,
    ai_summary: item.ai_summary,
    lead_score: item.lead_score,
    is_duplicate: item.is_duplicate,
    duplicate_reason: item.duplicate_reason,
    selected: true,
    dedupKey,
    collectedAt: new Date().toISOString()
  };
}

export async function enrichLeadsWithServer(leads: CollectedLead[]): Promise<CollectedLead[]> {
  if (!leads.length) return leads;

  const items = leads.map(l => ({
    raw_content: l.raw_content || '',
    source_url: l.source_url || l.url,
    source_title: l.source_title || l.title,
    block_id: l.blockId,
    phone: l.phone
  }));

  try {
    const enriched = await extractBatchViaBackground(items);
    if (!enriched.length) return leads;

    return enriched
      .filter((item: any) => item.phone)
      .map((item: any) => {
        const orig = leads.find(l => l.blockId === item.block_id && l.phone === item.phone)
          || leads.find(l => l.phone === item.phone);
        return serverItemToCollectedLead(item, orig?.dedupKey || `h-${item.phone}`);
      });
  } catch (err) {
    console.warn('[Estoria] enrich failed, giữ lead local', err);
    return leads;
  }
}

export function leadToSavePayload(lead: CollectedLead): Record<string, unknown> | null {
  const phone = normalizePhone(lead.phone);
  if (!phone) return null;

  const baseUrl = (lead.source_url || lead.url || '').split('#')[0];
  const source_url = lead.blockId && baseUrl ? `${baseUrl}#${lead.blockId}` : baseUrl || undefined;

  return {
    phone,
    phones: (lead.phones || []).map(p => normalizePhone(p)).filter(Boolean).slice(0, 5),
    possible_phones: (lead.possible_phones || []).slice(0, 5),
    demand_type: lead.demand_type,
    property_type: lead.property_type,
    location: lead.location,
    budget: lead.budget,
    raw_content: (lead.raw_content || '').slice(0, 4000),
    source_url,
    source_title: lead.source_title || lead.title,
    block_id: lead.blockId
  };
}
