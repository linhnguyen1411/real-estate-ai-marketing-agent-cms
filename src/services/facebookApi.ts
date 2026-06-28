import { getAuthToken } from './api';

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {
      status: 'error' as const,
      message: `Server trả về rỗng (${response.status}).`,
    };
  }
  if (text.trimStart().startsWith('<')) {
    return {
      status: 'error' as const,
      message:
        'API trả về HTML thay vì JSON. Hãy chạy `npm run dev` (Express + Vite), đăng nhập admin, hoặc deploy server mới.',
    };
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'error' as const,
      message: response.ok
        ? 'Phản hồi server không đúng định dạng JSON.'
        : `Server trả lỗi ${response.status}.`,
    };
  }
}

async function facebookRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...init?.headers,
    },
  });
  const json = await parseJsonResponse(response);
  if (!response.ok || json.status !== 'success') {
    throw new Error(json.message || `Facebook API failed: ${response.status}`);
  }
  return json.data as T;
}

export interface FacebookInboxItem {
  id: string;
  pageId: string;
  channel: string;
  status: string;
  lastMessageAt?: string;
  contact: {
    id: string;
    psid: string;
    name?: string;
    profilePic?: string;
    leadId?: string;
    leadScore?: number;
  };
  lastMessage?: {
    text?: string;
    direction: string;
    createdAt: string;
  } | null;
  messengerUrl?: string | null;
}

export interface FacebookCommentItem {
  id: string;
  text?: string;
  postId?: string;
  commentId?: string;
  status: string;
  intentTags?: string[];
  canPrivateReply: boolean;
  privateReplyEligible: boolean;
  createdAt: string;
  postUrl?: string | null;
  contact?: { id: string; name?: string; psid: string } | null;
}

export interface FacebookLeadItem {
  id: string;
  name: string;
  phone: string;
  sourceType?: string;
  firstMessage?: string;
  investorScore: number;
  status: string;
  tags: string[];
  createdAt: string;
  contact?: { id: string; name?: string; psid: string } | null;
}

export function fetchFacebookInbox() {
  return facebookRequest<FacebookInboxItem[]>('/api/facebook/inbox');
}

export function fetchFacebookInboxDetail(id: string) {
  return facebookRequest<{
    id: string;
    status: string;
    messengerUrl?: string;
    lead?: FacebookLeadItem | null;
    messages: Array<{ id: string; direction: string; messageType: string; text?: string; createdAt: string }>;
    contact: { id: string; name?: string; psid: string; profilePic?: string };
  }>(`/api/facebook/inbox/${id}`);
}

export function updateFacebookInboxStatus(id: string, status: string) {
  return facebookRequest(`/api/facebook/inbox/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchFacebookComments() {
  return facebookRequest<FacebookCommentItem[]>('/api/facebook/comments');
}

export function updateFacebookCommentStatus(id: string, status: string) {
  return facebookRequest(`/api/facebook/comments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function createLeadFromFacebookComment(id: string) {
  return facebookRequest(`/api/facebook/comments/${id}/create-lead`, { method: 'POST' });
}

export function fetchFacebookLeads() {
  return facebookRequest<FacebookLeadItem[]>('/api/facebook/leads');
}

export function createLeadFromFacebookConversation(conversationId: string) {
  return facebookRequest(`/api/facebook/conversations/${conversationId}/create-lead`, { method: 'POST' });
}

export interface FacebookConnectionTest {
  ok: boolean;
  pageId?: string;
  pageName?: string;
  testedAt: string;
  error?: { message: string; code?: number; type?: string; subcode?: number };
  hint?: string;
}

export async function testFacebookConnection() {
  if (!getAuthToken()) {
    return {
      ok: false,
      testedAt: new Date().toISOString(),
      error: { message: 'Chưa đăng nhập admin — hãy login tại /admin/login trước.' },
      hint: 'Token JWT cần có trong localStorage sau khi đăng nhập.',
    } satisfies FacebookConnectionTest;
  }

  const response = await fetch('/api/admin/facebook/test-connection', { headers: authHeaders() });
  const json = await parseJsonResponse(response);
  if (!json.data) {
    throw new Error(json.message || 'Test connection failed');
  }
  return json.data as FacebookConnectionTest;
}
