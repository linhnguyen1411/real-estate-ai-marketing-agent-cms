import type { InvestorLead } from '../types/investorLead';
import { getAuthToken } from './api';

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type InvestorLeadCallStatus =
  | 'called'
  | 'unreachable'
  | 'callback_scheduled'
  | 'qualified'
  | 'unqualified';

export async function fetchInvestorLeads(params: {
  includeConverted?: boolean;
} = {}): Promise<InvestorLead[]> {
  const qs = params.includeConverted ? '?includeConverted=1' : '';
  const response = await fetch(`/api/investor-leads${qs}`, { headers: authHeaders() });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || 'Failed');
  return json.data || [];
}

export async function updateInvestorLeadStatus(id: string, status: InvestorLead['status']) {
  const response = await fetch(`/api/investor-leads/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const json = await response.json();
    throw new Error(json.message || 'Failed');
  }
}

export async function callInvestorLead(
  id: string,
  payload: { status: InvestorLeadCallStatus | string; note?: string; callbackAt?: string },
) {
  const response = await fetch(`/api/investor-leads/${id}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { message?: string }).message || `API lỗi ${response.status}`);
  }
  return (json as { data?: unknown }).data ?? json;
}

export async function convertInvestorLeadToCustomer(id: string) {
  const response = await fetch(`/api/investor-leads/${id}/convert-to-customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { message?: string }).message || `API lỗi ${response.status}`);
  }
  return (json as { data?: unknown }).data ?? json;
}
