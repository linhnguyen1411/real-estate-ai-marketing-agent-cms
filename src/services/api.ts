import {
  AppSettings,
  AuthUser,
  AutomationTask,
  Customer,
  ChatHistoryRecord,
  GeneratedContentRecord,
  InboxMessage,
  MarketingChannel,
  Post,
  PublicChatGuest,
  Property,
  User
} from '../types';

type ApiStatus = 'success' | 'error';

interface ApiResponse<T> {
  status: ApiStatus;
  data: T;
  message?: string;
}

const AUTH_TOKEN_KEY = 'real_estate_ai_auth_token';

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export interface DashboardTrafficItem {
  id: string;
  title: string;
  views: number;
  lastViewAt?: string;
  platform?: string;
  url?: string;
}

export interface DashboardData {
  stats: {
    totalCustomers: number;
    leads: {
      hot: number;
      warm: number;
      cold: number;
    };
    totalProperties: number;
    totalPosts: number;
    pendingInbox: number;
    todayTasksCount: number;
    siteViews?: number;
    propertyViews?: number;
    postViews?: number;
  };
  metrics: Array<{
    platform: string;
    reach: number;
    engagement: number;
    leads: number;
  }>;
  traffic?: {
    lastSiteViewAt?: string;
    topProperties: DashboardTrafficItem[];
    topPosts: DashboardTrafficItem[];
  };
}

export interface InitialAppData {
  dashboard: DashboardData;
  customers: Customer[];
  properties: Property[];
  posts: Post[];
  inbox: InboxMessage[];
  automations: AutomationTask[];
  settings: AppSettings;
  channels: MarketingChannel[];
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {
      status: 'error' as const,
      message: `Server trả về rỗng (${response.status}).`
    };
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'error' as const,
      message: response.ok
        ? 'Phản hồi server không đúng định dạng JSON.'
        : `Server trả lỗi ${response.status}.`
    };
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });

  const json = await parseJsonResponse(response) as ApiResponse<T>;

  if (!response.ok || json.status !== 'success') {
    throw new Error(json.message || `API request failed: ${response.status} ${response.statusText}`);
  }

  return json.data;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setAuthToken(session.token);
  return session;
}

export function logout() {
  clearAuthToken();
}

export function getCurrentUser() {
  return apiRequest<AuthUser>('/api/auth/me');
}

export function updateProfile(payload: {
  name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar_url?: string;
  image?: string;
  public_slug?: string;
  show_public_profile?: boolean;
  current_password?: string;
  new_password?: string;
}) {
  return apiRequest<AuthUser>('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function uploadProfileAvatar(imageDataUrl: string) {
  const user = await updateProfile({ image: imageDataUrl });
  return { url: user.avatar_url || '', user };
}

export async function getInitialAppData(): Promise<InitialAppData> {
  const [
    dashboard,
    customers,
    properties,
    posts,
    inbox,
    automations,
    settings,
    channels
  ] = await Promise.all([
    apiRequest<DashboardData>('/api/dashboard'),
    apiRequest<Customer[]>('/api/customers'),
    apiRequest<Property[]>('/api/properties'),
    apiRequest<Post[]>('/api/posts'),
    apiRequest<InboxMessage[]>('/api/inbox'),
    apiRequest<AutomationTask[]>('/api/automations'),
    apiRequest<AppSettings>('/api/settings'),
    apiRequest<MarketingChannel[]>('/api/channels')
  ]);

  return {
    dashboard,
    customers,
    properties,
    posts,
    inbox,
    automations,
    settings,
    channels
  };
}

export async function refreshTrafficData() {
  const [properties, settings] = await Promise.all([
    apiRequest<Property[]>('/api/properties'),
    apiRequest<AppSettings>('/api/settings')
  ]);
  return { properties, settings };
}

export function analyzeCustomer(customerId: string) {
  return apiRequest<Customer>('/api/ai/analyze-customer', {
    method: 'POST',
    body: JSON.stringify({ customerId })
  });
}

export function generatePropertyMarketing(propertyId: string, tone: string) {
  return apiRequest<Property>('/api/ai/generate-content', {
    method: 'POST',
    body: JSON.stringify({ propertyId, tone })
  });
}

export function generateInboxReply(messageId: string) {
  return apiRequest<InboxMessage>('/api/ai/generate-reply', {
    method: 'POST',
    body: JSON.stringify({ messageId })
  });
}

export function sendInboxReply(messageId: string, replyText: string) {
  return apiRequest<InboxMessage>(`/api/inbox/${messageId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ replyText })
  });
}

export function createCustomer(customer: Record<string, unknown>) {
  return apiRequest<Customer>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(customer)
  });
}

export function updateCustomer(customerId: string, customer: Record<string, unknown>) {
  return apiRequest<Customer>(`/api/customers/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify(customer)
  });
}

export function createProperty(property: Record<string, unknown>) {
  return apiRequest<Property>('/api/properties', {
    method: 'POST',
    body: JSON.stringify(property)
  });
}

export function updateProperty(propertyId: string, property: Record<string, unknown>) {
  return apiRequest<Property>(`/api/properties/${propertyId}`, {
    method: 'PUT',
    body: JSON.stringify(property)
  });
}

export function deleteProperty(propertyId: string) {
  return apiRequest<Property>(`/api/properties/${propertyId}`, {
    method: 'DELETE'
  });
}

export function updatePost(postId: string, post: Record<string, unknown>) {
  return apiRequest<Post>(`/api/posts/${postId}`, {
    method: 'PUT',
    body: JSON.stringify(post)
  });
}

export type MemberPermissionCollection = 'customers' | 'properties' | 'posts';

export interface BulkMemberPermissionResult {
  updated: number;
  collection: MemberPermissionCollection;
  member_id: string;
  assign: boolean;
  items: Array<Customer | Property | Post>;
}

export function bulkMemberPermissions(payload: {
  member_id: string;
  collection: MemberPermissionCollection;
  assign: boolean;
  resource_ids?: string[];
}) {
  return apiRequest<BulkMemberPermissionResult>('/api/member-permissions/bulk', {
    method: 'POST',
    body: JSON.stringify({
      member_id: payload.member_id,
      collection: payload.collection,
      assign: payload.assign,
      resource_ids: payload.resource_ids,
    }),
  });
}

export async function fetchPublicSeoKeywords() {
  const response = await fetch('/api/public/seo');
  if (!response.ok) return [] as string[];
  const json = await parseJsonResponse(response);
  return Array.isArray(json.data?.keywords) ? json.data.keywords as string[] : [];
}

export function toggleAutomation(id: string) {
  return apiRequest<AutomationTask>(`/api/automations/${id}/toggle`, {
    method: 'POST'
  });
}

export function runDemoAutomations() {
  return apiRequest<AutomationTask[]>('/api/automations/run-demo', {
    method: 'POST'
  });
}

export function sendAssistantMessage(message: string) {
  return apiRequest<string>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
}

export function getAIStatus() {
  return apiRequest<Array<{
    provider: 'ollama' | 'openai' | 'gemini';
    ok: boolean;
    model?: string;
    endpoint?: string;
    message: string;
  }>>('/api/ai/status');
}

export function getChatHistory(scope?: 'mine') {
  return apiRequest<ChatHistoryRecord[]>(`/api/chat/history${scope ? `?scope=${scope}` : ''}`);
}

export function getPublicChatGuests() {
  return apiRequest<PublicChatGuest[]>('/api/chat/guests');
}

export function getPublicChatGuestHistory(sessionId: string) {
  return apiRequest<ChatHistoryRecord[]>(`/api/chat/guests/${encodeURIComponent(sessionId)}/history`);
}

export function updatePublicChatGuestAi(sessionId: string, aiEnabled: boolean) {
  return apiRequest<PublicChatGuest>(`/api/chat/guests/${encodeURIComponent(sessionId)}/ai`, {
    method: 'PUT',
    body: JSON.stringify({ ai_enabled: aiEnabled })
  });
}

export function sendPublicChatGuestMessage(sessionId: string, message: string) {
  return apiRequest<ChatHistoryRecord>(`/api/chat/guests/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message })
  });
}

export function deleteChatSession(sessionUserId: string) {
  return apiRequest<{ sessionUserId: string; deletedMessages: number; guestDeleted: boolean }>(
    `/api/chat/sessions/${encodeURIComponent(sessionUserId)}/delete`,
    { method: 'POST' }
  );
}

export function getGeneratedContents(params?: { channel?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.channel) searchParams.set('channel', params.channel);
  if (params?.status) searchParams.set('status', params.status);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiRequest<GeneratedContentRecord[]>(`/api/content/generated${suffix}`);
}

export function verifyContent(contentId: string, verifiedContent: string) {
  return apiRequest<{ id: string; status: 'verified' }>(`/api/content/generated/${contentId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ verifiedContent })
  });
}

export function getUsers() {
  return apiRequest<User[]>('/api/users');
}

export function createUser(user: Record<string, unknown>) {
  return apiRequest<User>('/api/users', {
    method: 'POST',
    body: JSON.stringify(user)
  });
}

export function updateUser(userId: string, user: Record<string, unknown>) {
  return apiRequest<User>(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(user)
  });
}

export function saveSettings(settings: AppSettings) {
  return apiRequest<AppSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}
