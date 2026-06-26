import type { InvestorLead } from '../types/investorLead';
import { getAuthToken } from './api';

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchInvestorLeads(): Promise<InvestorLead[]> {
  const response = await fetch('/api/investor-leads', { headers: authHeaders() });
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
