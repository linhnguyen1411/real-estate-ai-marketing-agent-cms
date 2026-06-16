import type { BlogArticle, BlogAuthor, BlogCategory, BlogTag } from '../types';

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await response.json();
  if (!response.ok || json.status === 'error') {
    throw new Error(json.message || `Request failed: ${response.status}`);
  }
  return json.data as T;
}

export function fetchPublicBlogPosts(categorySlug?: string) {
  const params = new URLSearchParams();
  if (categorySlug) params.set('category', categorySlug);
  const query = params.toString();
  return readJson<BlogArticle[]>(`/api/public/blog/posts${query ? `?${query}` : ''}`);
}

export function fetchPublicBlogPost(slug: string) {
  return readJson<BlogArticle>(`/api/public/blog/posts/${encodeURIComponent(slug)}`);
}

export function fetchBlogPosts(token: string, filters?: { status?: string; category?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.category) params.set('category', filters.category);
  const query = params.toString();
  return readJson<BlogArticle[]>(`/api/blog/posts${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createBlogPost(token: string, payload: Record<string, unknown>) {
  return readJson<BlogArticle>('/api/blog/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateBlogPost(token: string, id: string, payload: Record<string, unknown>) {
  return readJson<BlogArticle>(`/api/blog/posts/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteBlogPost(token: string, id: string) {
  return readJson<void>(`/api/blog/posts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchBlogCategories(token: string) {
  return readJson<BlogCategory[]>('/api/blog/categories', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchBlogTags(token: string) {
  return readJson<BlogTag[]>('/api/blog/tags', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchBlogAuthors(token: string) {
  return readJson<BlogAuthor[]>('/api/blog/authors', {
    headers: { Authorization: `Bearer ${token}` },
  });
}
