import type { LeadCapturePayload } from '../types/investorLead';
import { getLeadSessionId, getUtmParams, inferChannel, trackGa4Event } from './analytics';
import { getLeadMagnet } from './leadMagnets';
import { normalizeLeadMagnetContent } from './normalizeLeadMagnetContent';
import type { LeadMagnetContent } from '../types/leadMagnetContent';

export interface SubmitLeadResult {
  id: string;
  investor_score: number;
  access_token: string;
}

export async function submitInvestorLead(
  payload: Omit<LeadCapturePayload, 'session_id' | 'channel'> & {
    channel?: string;
    gaEvent?: string;
  }
): Promise<SubmitLeadResult> {
  const utm = getUtmParams();
  const body: LeadCapturePayload = {
    ...payload,
    session_id: getLeadSessionId(),
    channel: payload.channel || inferChannel(),
    utm_source: utm.utm_source || undefined,
    utm_medium: utm.utm_medium || undefined,
    utm_campaign: utm.utm_campaign || undefined,
    page_path: payload.page_path || (typeof window !== 'undefined' ? window.location.pathname : ''),
  };

  const response = await fetch('/api/public/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || 'Gửi thất bại');

  trackGa4Event(payload.gaEvent || 'generate_lead', {
    form_type: payload.form_type || 'simple',
    magnet_slug: payload.magnet_slug,
    investor_score: json.data.investor_score,
  });

  return json.data;
}

export async function fetchLeadMagnetContent(slug: string, token: string): Promise<LeadMagnetContent> {
  const magnet = getLeadMagnet(slug);
  if (!magnet) throw new Error('Không tìm thấy tài liệu');

  const response = await fetch(
    `/api/public/lead-magnets/${encodeURIComponent(slug)}/content?token=${encodeURIComponent(token)}`
  );
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || 'Không tải được tài liệu');
  }

  const raw = json.data?.content ?? json.data;
  const content = normalizeLeadMagnetContent(raw, magnet);
  if (!content) {
    throw new Error('Định dạng nội dung tài liệu không hợp lệ');
  }
  return content;
}
