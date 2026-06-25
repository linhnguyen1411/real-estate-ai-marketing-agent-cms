import type {
  BlogArticle,
  BlogAuthor,
  BlogCategory,
  BlogTag,
  DuplicateCheckReport,
  SeoAuditReport,
} from '../types';

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {
      status: 'error' as const,
      message:
        response.status === 404
          ? 'API chưa có trên server — restart `npm run dev` (hoặc rebuild + restart production) rồi thử lại.'
          : `Server trả về rỗng (${response.status}).`,
    };
  }
  try {
    return JSON.parse(text);
  } catch {
    const looksLikeHtml =
      text.trimStart().toLowerCase().startsWith('<!doctype') || text.trimStart().toLowerCase().startsWith('<html');
    return {
      status: 'error' as const,
      message: looksLikeHtml
        ? 'API blog chưa sẵn sàng — restart server (`npm run dev`) rồi thử lại.'
        : response.ok
          ? 'Phản hồi server không đúng định dạng JSON.'
          : `Server trả lỗi ${response.status}.`,
    };
  }
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await parseJsonResponse(response);
  if (!response.ok || json.status === 'error') {
    throw new Error(json.message || `Request failed: ${response.status}`);
  }
  return json.data as T;
}

async function readJsonFull<T>(url: string, init?: RequestInit): Promise<{ data?: T; message?: string } & T> {
  const response = await fetch(url, init);
  const json = await parseJsonResponse(response);
  if (!response.ok || json.status === 'error') {
    const err = new Error(json.message || `Request failed: ${response.status}`) as Error & { data?: unknown };
    err.data = json.data;
    throw err;
  }
  return json;
}

export function fetchPublicBlogPosts(filters?: { category?: string; tag?: string }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.tag) params.set('tag', filters.tag);
  const query = params.toString();
  return readJson<BlogArticle[]>(`/api/public/blog/posts${query ? `?${query}` : ''}`);
}

export function fetchPublicBlogCategories() {
  return readJson<BlogCategory[]>(`/api/public/blog/categories`);
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

export function uploadBlogCoverImage(token: string, imageDataUrl: string, slug?: string) {
  return readJson<{ url: string }>('/api/blog/upload-cover', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, slug }),
  });
}

export function uploadContentImage(token: string, imageDataUrl: string, slug?: string) {
  return readJson<{ url: string }>('/api/blog/upload-content-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, slug }),
  });
}

export function deleteBlogPost(token: string, id: string) {
  return readJson<void>(`/api/blog/posts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function importMarkdownPost(token: string, markdown: string, authorId: string, categoryId?: string) {
  return readJson<BlogArticle>('/api/blog/posts/import-markdown', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, authorId, categoryId }),
  });
}

export function auditBlogPost(token: string, id: string) {
  return readJson<SeoAuditReport>(`/api/blog/posts/${id}/audit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function duplicateCheckBlogPost(token: string, id: string) {
  return readJson<DuplicateCheckReport>(`/api/blog/posts/${id}/duplicate-check`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function publishBlogPost(token: string, id: string, force = false) {
  return readJsonFull<{ post: BlogArticle; audit: SeoAuditReport; duplicate: DuplicateCheckReport }>(
    `/api/blog/posts/${id}/publish`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }
  );
}

export function suggestBlogPostMeta(token: string, payload: Record<string, unknown>) {
  return readJson<{
    categories: { categorySlug: string; categoryName: string; confidence: number }[];
    tags: { name: string; slug: string; confidence: number }[];
    internalLinks: { label: string; href: string; reason: string }[];
  }>('/api/blog/posts/suggest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchBlogCategories(token: string) {
  return readJson<BlogCategory[]>('/api/blog/categories', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createBlogCategory(token: string, payload: Record<string, unknown>) {
  return readJson<BlogCategory>('/api/blog/categories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchBlogTags(token: string) {
  return readJson<BlogTag[]>('/api/blog/tags', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createBlogTag(token: string, name: string) {
  return readJson<BlogTag>('/api/blog/tags', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function fetchBlogAuthors(token: string) {
  return readJson<BlogAuthor[]>('/api/blog/authors', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function parsePastedMarkdown(token: string, markdown: string) {
  return readJson<{
    title: string;
    slug: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    primaryKeyword: string;
    coverImage: string | null;
    tagNames: string[];
    tagIds: string[];
    markdown: string;
    faqs: { question: string; answer: string }[];
    relatedSuggestions: string[];
    suggestedRelated: { id: string; slug: string; title: string; categoryName: string; score: number }[];
    cta: import('../seo/buildPostCta').PostCta;
    cleanWarnings: string[];
    audit: import('../types').SeoAuditReport;
    duplicate: import('../types').DuplicateCheckReport;
  }>('/api/blog/parse-markdown', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
}

export function generateAiPostDraft(token: string, payload: Record<string, unknown>) {
  return readJson<{
    title: string;
    slug: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    primaryKeyword: string;
    targetIntent?: string;
    categoryId?: string | null;
    categorySlug?: string;
    tagNames?: string[];
    markdown: string;
    faqs?: { question: string; answer: string }[];
    audit?: import('../types').SeoAuditReport;
    duplicate?: import('../types').DuplicateCheckReport;
  }>('/api/blog/ai/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function aiAssistBlog(token: string, action: string, payload: Record<string, unknown>) {
  return readJson<string | { question: string; answer: string }[] | { label: string; href: string }[]>(
    '/api/blog/ai/assist',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    }
  );
}

export function previewBlogChecks(token: string, payload: Record<string, unknown>) {
  return readJson<{ audit: import('../types').SeoAuditReport; duplicate: import('../types').DuplicateCheckReport }>(
    '/api/blog/ai/preview-checks',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function createAiDraft(token: string, payload: Record<string, unknown>) {
  return readJson<{ id: string; status: string }>('/api/blog/ai-drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchAiDrafts(token: string) {
  return readJson<
    {
      id: string;
      status: string;
      input: Record<string, unknown>;
      outputMarkdown?: string | null;
      articleType?: string | null;
      post?: { id: string; slug: string; title: string; status: string };
      createdAt: string;
    }[]
  >('/api/blog/ai-drafts', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchAiDraft(token: string, id: string) {
  return readJson<{
    id: string;
    status: string;
    input: Record<string, unknown>;
    outputMarkdown?: string | null;
    articleType?: string | null;
    errorMessage?: string | null;
    postId?: string | null;
    post?: import('../types').BlogArticle | null;
    audit?: import('../types').SeoAuditReport | null;
    duplicate?: import('../types').DuplicateCheckReport | null;
    bannedCheck?: { passed: boolean; violations: string[] } | null;
    createdAt: string;
  }>(`/api/blog/ai-drafts/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchBlogPost(token: string, id: string) {
  return readJson<import('../types').BlogArticle>(`/api/blog/posts/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchPostRevisions(token: string, postId: string) {
  return readJson<{ id: string; createdAt: string; note?: string }[]>(`/api/blog/posts/${postId}/revisions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchPostSeoAudits(token: string, postId: string) {
  return readJson<{ id: string; passed: boolean; score: number; createdAt: string }[]>(
    `/api/blog/posts/${postId}/seo-audits`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}
