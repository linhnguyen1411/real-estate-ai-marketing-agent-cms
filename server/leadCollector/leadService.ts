import type { Customer } from '../../src/types';
import { createCustomer, findCustomerByPhone, findCrawlerResultByUrl, getCustomers, saveCrawlerLog } from '../dbHelper';
import { extractLeadFromContent, LeadExtractInput, LeadExtractResult, splitBulkLeadText } from './extractLead';

export function findLeadDuplicate(phone: string, sourceUrl: string) {
  if (phone) {
    const byPhone = findCustomerByPhone(phone);
    if (byPhone) return { type: 'phone' as const, customer: byPhone };
  }
  if (sourceUrl) {
    const byUrl = getCustomers().find(c =>
      c.source_url === sourceUrl ||
      String(c.notes || '').includes(sourceUrl)
    );
    if (byUrl) return { type: 'source_url' as const, customer: byUrl };

    const crawlerHit = findCrawlerResultByUrl(sourceUrl);
    if (crawlerHit) return { type: 'source_url' as const, customer: null, crawlerResult: crawlerHit };
  }
  return null;
}

export function extractLeadPreview(input: LeadExtractInput): LeadExtractResult {
  return extractLeadFromContent(input);
}

export function extractBulkLeadPreviews(raw: string) {
  return splitBulkLeadText(raw).map((chunk, index) => ({
    index,
    ...extractLeadFromContent({ raw_content: chunk, title: `Lead #${index + 1}` })
  }));
}

export interface LeadBatchItemInput {
  raw_content: string;
  source_url?: string;
  source_title?: string;
  block_id?: string;
  phone?: string;
}

export function extractLeadBatchItems(items: LeadBatchItemInput[]) {
  return items.map((item, index) => {
    const preview = extractLeadFromContent({
      title: item.source_title || '',
      url: item.source_url || '',
      raw_content: item.raw_content || '',
      selected_text: ''
    });
    const duplicate = findLeadDuplicate(preview.phone, preview.url);
    return {
      index,
      block_id: item.block_id || '',
      ...preview,
      is_duplicate: Boolean(duplicate),
      duplicate_reason: duplicate?.type || null
    };
  });
}

export type LeadSaveInput = LeadBatchItemInput & Partial<LeadExtractResult> & {
  block_id?: string;
  source_url?: string;
  source_title?: string;
};

export function normalizeLeadForSave(input: LeadSaveInput): LeadExtractResult {
  const extracted = extractLeadFromContent({
    title: input.source_title || input.title || '',
    url: input.source_url || input.url || '',
    raw_content: input.raw_content || '',
    selected_text: input.selected_text || ''
  });

  return {
    ...extracted,
    phone: input.phone || extracted.phone,
    phones: input.phones || extracted.phones,
    possible_phones: input.possible_phones || extracted.possible_phones,
    demand_type: (input.demand_type as LeadExtractResult['demand_type']) || extracted.demand_type,
    property_type: (input.property_type as LeadExtractResult['property_type']) || extracted.property_type,
    location: input.location || extracted.location,
    budget: input.budget ?? extracted.budget,
    raw_content: (input.raw_content || extracted.raw_content || '').slice(0, 12000),
    url: input.source_url || input.url || extracted.url
  };
}

export function saveLeadBatchItems(
  leads: LeadSaveInput[],
  meta: { company_id?: string; owner_user_id?: string; source?: Customer['source'] },
  options?: { slim?: boolean }
) {
  const results = leads.map(lead => {
    const merged = normalizeLeadForSave(lead);
    const result = saveLeadFromExtract(merged, meta);
    return result.saved
      ? { saved: true as const, customer: result.customer, block_id: lead.block_id || null }
      : { saved: false as const, duplicate: true as const, reason: result.reason, customer: result.customer, block_id: lead.block_id || null };
  });

  const summary = {
    saved_count: results.filter(r => r.saved).length,
    duplicate_count: results.filter(r => !r.saved).length
  };

  if (options?.slim) return summary;
  return { ...summary, results };
}

export function saveLeadFromExtract(
  extracted: LeadExtractResult,
  meta: { company_id?: string; owner_user_id?: string; source?: Customer['source'] }
) {
  const duplicate = findLeadDuplicate(extracted.phone, extracted.url);
  if (duplicate?.customer) {
    return { saved: false as const, duplicate: true as const, reason: duplicate.type, customer: duplicate.customer };
  }

  const sourceLabel = meta.source || 'extension';
  const customer = createCustomer({
    name: extracted.name,
    phone: extracted.phone,
    phones: extracted.phones,
    possible_phones: extracted.possible_phones,
    confidence_score: extracted.confidence_score,
    email: '',
    source: sourceLabel,
    budget: extracted.budget,
    interested_area: extracted.location,
    property_type: extracted.property_type,
    status: 'new',
    notes: [
      `Nguồn: ${sourceLabel}`,
      extracted.url ? `URL: ${extracted.url}` : '',
      extracted.selected_text ? `Đoạn chọn: ${extracted.selected_text.slice(0, 500)}` : '',
      extracted.raw_content ? `Nội dung: ${extracted.raw_content.slice(0, 1500)}` : ''
    ].filter(Boolean).join('\n'),
    ai_summary: extracted.ai_summary,
    lead_score: extracted.lead_score,
    source_url: extracted.url,
    demand_type: extracted.demand_type,
    company_id: meta.company_id,
    owner_user_id: meta.owner_user_id
  });

  return { saved: true as const, duplicate: false as const, customer };
}

export interface RawLeadPost {
  title?: string;
  text?: string;
  url?: string;
  raw_content?: string;
}

export function batchExtractAndSaveLeads(
  posts: RawLeadPost[],
  meta: { company_id?: string; owner_user_id?: string; source?: Customer['source'] }
) {
  let processed = 0;
  let newLeads = 0;
  let duplicates = 0;
  let leadsFound = 0;

  for (const post of posts) {
    const text = post.text || post.raw_content || '';
    const extracted = extractLeadFromContent({
      title: post.title,
      url: post.url || '',
      raw_content: text,
      selected_text: ''
    });

    if (!extracted.phone) continue;

    leadsFound += 1;
    processed += 1;
    const result = saveLeadFromExtract(extracted, meta);
    if (result.saved) newLeads += 1;
    else if (result.duplicate) duplicates += 1;
  }

  return { processed, newLeads, duplicates, leads_found: leadsFound };
}

export function saveExtensionCollectLog(data: {
  session_id: string;
  started_at: string;
  ended_at: string;
  posts_scanned: number;
  leads_found: number;
  new_leads: number;
  duplicates: number;
  errors: string[];
  page_url?: string;
}) {
  return saveCrawlerLog({
    job_id: `ext-auto-${data.session_id}`,
    pages_scanned: data.posts_scanned,
    new_leads: data.new_leads,
    duplicates: data.duplicates,
    errors: data.errors,
    message: JSON.stringify({
      type: 'extension-auto-scroll',
      started_at: data.started_at,
      ended_at: data.ended_at,
      leads_found: data.leads_found,
      page_url: data.page_url || ''
    })
  });
}
