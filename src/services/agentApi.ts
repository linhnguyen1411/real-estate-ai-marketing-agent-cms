import { PublicAgentProfile, Property } from '../types';

export async function fetchPublicAgentByUserId(userId: string): Promise<PublicAgentProfile | null> {
  try {
    const response = await fetch(`/api/public/agents/by-user/${encodeURIComponent(userId)}`);
    if (!response.ok) return null;
    const json = await response.json();
    return json.status === 'success' ? json.data : null;
  } catch {
    return null;
  }
}

export async function fetchPublicAgentBySlug(slug: string): Promise<(PublicAgentProfile & { properties?: Property[] }) | null> {
  try {
    const response = await fetch(`/api/public/agents/${encodeURIComponent(slug)}`);
    if (!response.ok) return null;
    const json = await response.json();
    return json.status === 'success' ? json.data : null;
  } catch {
    return null;
  }
}

export async function fetchPublicAgents(): Promise<PublicAgentProfile[]> {
  try {
    const response = await fetch('/api/public/agents');
    if (!response.ok) return [];
    const json = await response.json();
    return json.status === 'success' && Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}
