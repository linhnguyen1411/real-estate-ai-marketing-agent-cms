import {
  AppSettings,
  AuthUser,
  AutomationTask,
  Customer,
  InboxMessage,
  MarketingChannel,
  Post,
  Property
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
  };
  metrics: Array<{
    platform: string;
    reach: number;
    engagement: number;
    leads: number;
  }>;
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

  const json = await response.json() as ApiResponse<T>;

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

export function createProperty(property: Record<string, unknown>) {
  return apiRequest<Property>('/api/properties', {
    method: 'POST',
    body: JSON.stringify(property)
  });
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

export function saveSettings(settings: AppSettings) {
  return apiRequest<AppSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}
