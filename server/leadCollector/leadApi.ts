import type { Customer } from '../../src/types';
import {
  extractLeadPreview,
  extractBulkLeadPreviews,
  extractLeadBatchItems,
  findLeadDuplicate,
  normalizeLeadForSave,
  saveLeadFromExtract,
  saveLeadBatchItems,
  batchExtractAndSaveLeads,
  saveExtensionCollectLog,
  type LeadBatchItemInput,
  type LeadSaveInput
} from './leadService';

export const LEAD_API_VERSION = '1.0';

export const LEAD_SOURCES = ['extension', 'facebook-feed-auto', 'manual_import'] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export function parseLeadSource(value: unknown): LeadSource {
  if (value === 'facebook-feed-auto') return 'facebook-feed-auto';
  if (value === 'manual_import') return 'manual_import';
  return 'extension';
}

export function withDuplicateFlags<T extends { phone: string; url: string }>(preview: T) {
  const duplicate = findLeadDuplicate(preview.phone, preview.url);
  return {
    ...preview,
    is_duplicate: Boolean(duplicate),
    duplicate_reason: duplicate?.type ?? null
  };
}

export function normalizeSaveLeads(body: Record<string, unknown>): LeadSaveInput[] {
  if (Array.isArray(body.leads)) {
    return body.leads as LeadSaveInput[];
  }
  if (Array.isArray(body.previews)) {
    return (body.previews as Record<string, unknown>[]).map(p => ({
      ...p,
      raw_content: p.raw_content,
      source_url: p.url || p.source_url,
      source_title: p.title || p.source_title
    })) as LeadSaveInput[];
  }
  return [];
}

export function extractOne(body: Record<string, unknown>) {
  const preview = extractLeadPreview({
    title: String(body.title || ''),
    url: String(body.url || ''),
    raw_content: String(body.raw_content || ''),
    selected_text: String(body.selected_text || '')
  });
  return withDuplicateFlags(preview);
}

export function extractBatch(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? (body.items as LeadBatchItemInput[]) : [];
  const results = extractLeadBatchItems(items);
  return {
    count: results.length,
    with_phone: results.filter(item => item.phone).length,
    items: results
  };
}

export function extractBulkText(body: Record<string, unknown>) {
  const raw = String(body.raw_content || '');
  return extractBulkLeadPreviews(raw).map(item => withDuplicateFlags(item));
}

export function saveOne(
  body: Record<string, unknown>,
  meta: { company_id?: string; owner_user_id?: string; source?: Customer['source'] }
) {
  const extracted = body.preview
    ? normalizeLeadForSave(body.preview as LeadSaveInput)
    : extractLeadPreview({
        title: String(body.title || ''),
        url: String(body.url || ''),
        raw_content: String(body.raw_content || ''),
        selected_text: String(body.selected_text || '')
      });

  return saveLeadFromExtract(extracted, {
    ...meta,
    source: parseLeadSource(body.source)
  });
}

export function saveBatch(
  body: Record<string, unknown>,
  meta: { company_id?: string; owner_user_id?: string }
) {
  const leads = normalizeSaveLeads(body);
  const slim = body.slim === true || body.slim === 'true';
  return saveLeadBatchItems(leads, {
    ...meta,
    source: parseLeadSource(body.source)
  }, { slim });
}

export function extractAndSavePosts(
  body: Record<string, unknown>,
  meta: { company_id?: string; owner_user_id?: string }
) {
  const posts = Array.isArray(body.posts) ? body.posts : [];
  return batchExtractAndSaveLeads(posts, {
    ...meta,
    source: parseLeadSource(body.source)
  });
}

export function finishAutoCollectSession(body: Record<string, unknown>) {
  return saveExtensionCollectLog({
    session_id: String(body.session_id || Date.now()),
    started_at: String(body.started_at || new Date().toISOString()),
    ended_at: String(body.ended_at || new Date().toISOString()),
    posts_scanned: Number(body.posts_scanned) || 0,
    leads_found: Number(body.leads_found) || 0,
    new_leads: Number(body.new_leads) || 0,
    duplicates: Number(body.duplicates) || 0,
    errors: Array.isArray(body.errors) ? body.errors.map(String) : [],
    page_url: body.page_url ? String(body.page_url) : undefined
  });
}

export const LEAD_ENDPOINTS = [
  { method: 'POST', path: '/api/auth/login', auth: false, purpose: 'Lấy JWT token' },
  { method: 'POST', path: '/api/leads/extract', auth: true, purpose: 'Preview 1 lead từ text' },
  { method: 'POST', path: '/api/leads/extract-batch', auth: true, purpose: 'Preview N lead (mảng items)' },
  { method: 'POST', path: '/api/leads', auth: true, purpose: 'Lưu 1 lead vào CRM' },
  { method: 'POST', path: '/api/leads/batch-save', auth: true, purpose: 'Lưu N lead vào CRM (chính)' },
  { method: 'GET', path: '/api/customers', auth: true, purpose: 'Xem lead đã lưu' },
  { method: 'POST', path: '/api/leads/bulk-extract', auth: true, purpose: '[legacy] Tách text dài thành nhiều preview' },
  { method: 'POST', path: '/api/leads/bulk-save', auth: true, purpose: '[legacy] Alias batch-save (previews)' }
] as const;
