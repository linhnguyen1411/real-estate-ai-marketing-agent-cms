import type { ShortLink, ShortLinkAnalytics, ShortLinkInput } from '../types/shortLink';
import { getAuthToken } from './api';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

async function parseJson<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || 'Yêu cầu thất bại');
  }
  return json.data as T;
}

export async function resolveShortLink(entityType: string, entityId: string): Promise<ShortLink> {
  const params = new URLSearchParams({ entityType, entityId });
  const response = await fetch(`/api/public/short-links/resolve?${params.toString()}`);
  return parseJson<ShortLink>(response);
}

export async function fetchShortLinks(): Promise<ShortLink[]> {
  const response = await fetch('/api/admin/short-links', {
    headers: authHeaders(),
  });
  return parseJson<ShortLink[]>(response);
}

export async function createShortLink(input: ShortLinkInput): Promise<ShortLink> {
  const response = await fetch('/api/admin/short-links', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  return parseJson<ShortLink>(response);
}

export async function updateShortLink(id: string, input: Partial<ShortLinkInput>): Promise<ShortLink> {
  const response = await fetch(`/api/admin/short-links/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  return parseJson<ShortLink>(response);
}

export async function deleteShortLink(id: string): Promise<void> {
  const response = await fetch(`/api/admin/short-links/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) {
    const json = await response.json();
    throw new Error(json.message || 'Không xóa được short link');
  }
}

export async function fetchShortLinkAnalytics(id: string): Promise<ShortLinkAnalytics> {
  const response = await fetch(`/api/admin/short-links/${id}/analytics`, {
    headers: authHeaders(),
  });
  return parseJson<ShortLinkAnalytics>(response);
}

export function getQrCodeUrl(shortUrl: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(shortUrl)}`;
}
