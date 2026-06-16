import type { LeadCapturePayload } from '../types/investorLead';
import { getLeadSessionId, getUtmParams, inferChannel, trackGa4Event } from './analytics';

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
