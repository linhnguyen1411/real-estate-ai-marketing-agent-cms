import React, { useState, useEffect, useMemo, useRef, FormEvent, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Home, 
  Sparkles, 
  FileText, 
  MessageSquare, 
  Bot, 
  Cpu, 
  Layers, 
  Settings as SettingsIcon, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Check, 
  Play, 
  RefreshCw, 
  TrendingUp, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Send,
  MapPin,
  DollarSign,
  Video,
  Image as ImageIcon,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Eye,
  Globe,
  Building2,
  GripVertical,
  FileSearch,
} from 'lucide-react';
import { AuthUser, Property, Post, AutomationTask, AppSettings, GeneratedContentRecord, User } from './types';
import { DEFAULT_SETTINGS } from './config/defaults';
import MarkdownContent from './components/MarkdownContent';
import {
  DashboardData,
  NavigationCounts,
  generatePropertyMarketing,
  getAuthToken,
  getCurrentUser,
  getGeneratedContents,
  getBootstrapData,
  getNavigationCounts,
  listProperties,
  listPosts,
  getUsers,
  login,
  logout,
  refreshTrafficData,
  runDemoAutomations,
  saveSettings,
  updatePost,
  verifyContent,
  invalidateCrmModule,
  cacheInvalidate,
} from './services/api';
import PaginationBar, { DEFAULT_PAGE_SIZE } from './components/common/PaginationBar';
import AppProviders from './app/AppProviders';
import AdminLayout from './app/layouts/AdminLayout';
import LoginPage, { AuthLoadingScreen } from './features/auth/LoginPage';
import {
  AGENT_PATH_TO_TAB,
  AGENT_TAB_TO_PATH,
  ACTIVE_TAB_STORAGE_KEY,
  MXH_POSTS_ENABLED,
  normalizeStoredTab,
  SEO_PATH_TO_TAB,
  SEO_TAB_TO_PATH,
} from './app/navigation/tabPaths';

const InvestorLeadsPage = React.lazy(() => import('./features/investor-leads/pages/InvestorLeadsPage'));
const ShortLinksPanel = React.lazy(() => import('./components/admin/ShortLinksPanel'));
const AdminProjectsPanel = React.lazy(() => import('./components/admin/AdminProjectsPanel'));
const LeadMagnetContentAdmin = React.lazy(() => import('./components/admin/LeadMagnetContentAdmin'));
const SeoContentAdmin = React.lazy(() => import('./components/admin/SeoContentAdmin'));
const AgentPlatformPage = React.lazy(() => import('./pages/AgentPlatformPage'));
const SystemSettingsPage = React.lazy(() => import('./features/settings/pages/SystemSettingsPage'));
const AutomationsPage = React.lazy(() => import('./features/automations/pages/AutomationsPage'));
const IntegrationsPage = React.lazy(() => import('./features/integrations/pages/IntegrationsPage'));
const ProfilePage = React.lazy(() => import('./features/profile/pages/ProfilePage'));
const CustomersPage = React.lazy(() => import('./features/crm/pages/CustomersPage'));
const PropertiesPage = React.lazy(() => import('./features/properties/pages/PropertiesPage'));
const InboxPage = React.lazy(() => import('./features/inbox/pages/InboxPage'));
const ChatFeatureHost = React.lazy(() => import('./features/chat/pages/ChatFeatureHost'));
const UsersPage = React.lazy(() => import('./features/users/pages/UsersPage'));
const ExecutiveKpiGrid = React.lazy(
  () => import('./features/dashboard/components/ExecutiveKpiGrid'),
);

function ModuleFallback({ label = 'Đang tải module…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">{label}</p>
    </div>
  );
}

const EMPTY_DASHBOARD: DashboardData = {
  version: 'h052_executive_command',
  generatedAt: new Date(0).toISOString(),
  summary: '',
  hero: {
    aiStatus: 'Offline',
    aiStatusLabel: 'Offline',
    businessHealth: null,
    todayGoal: null,
    expectedRevenueTy: null,
    currentCampaign: null,
    confidence: null,
  },
  snapshot: [],
  insights: [],
  recommendations: [],
  attention: [],
  quickActions: [],
  kpis: [],
};

const EMPTY_NAV_COUNTS: NavigationCounts = {
  crm: 0,
  properties: 0,
  posts: 0,
  pendingInbox: 0,
  leadIntelligence: 0,
  investorLeads: 0,
  externalInventory: 0,
  notifications: 0,
  jobs: 0,
  sources: 0,
  websiteChat: 0,
  chatHistory: 0,
};

type MarketingCreativeChannel = 'facebook' | 'zalo' | 'tiktok';

const MARKETING_CREATIVE_META: Record<MarketingCreativeChannel, { label: string }> = {
  facebook: { label: 'Facebook 3:4' },
  zalo: { label: 'Zalo 1:1' },
  tiktok: { label: 'TikTok 9:16' }
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>(() =>
    normalizeStoredTab(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || 'dashboard'),
  );
  const [seoMenuOpen, setSeoMenuOpen] = useState(() => {
    const tab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || '';
    return tab.startsWith('seo-');
  });
  const [agentMenuOpen, setAgentMenuOpen] = useState(() => {
    const tab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || '';
    return tab.startsWith('agent-');
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  
  // App variables states
  const [posts, setPosts] = useState<Post[]>([]);
  const [automations, setAutomations] = useState<AutomationTask[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [generatedContents, setGeneratedContents] = useState<GeneratedContentRecord[]>([]);
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  // Loading & interactive states
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedCoreData = useRef(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [userChatInput, setUserChatInput] = useState<string>('');
  const [chatDraftSeed, setChatDraftSeed] = useState(0);

  // Chatbot states

  // Gallery carousel state for properties

  // Modals & form fields state

  const [selectedPropertyForAI, setSelectedPropertyForAI] = useState<Property | null>(null);
  const [aiPropertyOptions, setAiPropertyOptions] = useState<Property[]>([]);
  const [aiGeneratingTone, setAiGeneratingTone] = useState<string>('sang trọng và chuyên nghiệp');


  const [dashboardData, setDashboardData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [navigationCounts, setNavigationCounts] = useState<NavigationCounts>(EMPTY_NAV_COUNTS);
  const [moduleLoading, setModuleLoading] = useState(false);
  const loadedModulesRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!currentUser || activeTab !== 'dashboard') return;

    let cancelled = false;
    const syncTraffic = () => {
      refreshTrafficData()
        .then(({ dashboard, settings: nextSettings }) => {
          if (cancelled) return;
          setDashboardData(dashboard);
          setSettings(nextSettings);
        })
        .catch(() => undefined);
    };

    syncTraffic();
    const timer = window.setInterval(syncTraffic, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab, currentUser]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const restoreSession = async () => {
      if (!getAuthToken()) {
        setAuthLoading(false);
        return;
      }

      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        logout();
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (currentUser && location.pathname === '/admin/login') {
      navigate('/admin/dashboard', { replace: true });
    }
    if (!currentUser && location.pathname !== '/admin/login') {
      navigate('/admin/login', { replace: true });
    }
  }, [authLoading, currentUser, location.pathname, navigate]);

  useEffect(() => {
    const requestedTab = (location.state as { activeTab?: string } | null)?.activeTab;
    if (requestedTab) {
      setActiveTab(requestedTab);
      setAgentMenuOpen(requestedTab.startsWith('agent-'));
      setSeoMenuOpen(requestedTab.startsWith('seo-'));
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    const agentTab = AGENT_PATH_TO_TAB[location.pathname];
    if (agentTab) {
      setActiveTab(agentTab);
      setAgentMenuOpen(true);
      setSeoMenuOpen(false);
      return;
    }
    const seoTab = SEO_PATH_TO_TAB[location.pathname];
    if (seoTab) {
      setActiveTab(seoTab);
      setSeoMenuOpen(true);
      setAgentMenuOpen(false);
    } else if (location.pathname === '/admin/ai-content') {
      setActiveTab('seo-posts');
      setSeoMenuOpen(true);
      setAgentMenuOpen(false);
      navigate('/admin/seo/posts', { replace: true });
    } else if (activeTab === 'seo-content' || activeTab === 'seo-ai-studio') {
      setActiveTab('seo-posts');
      navigate('/admin/seo/posts', { replace: true });
    }
  }, [location.pathname, location.state]);

  const refreshNavigationCounts = async () => {
    try {
      const counts = await getNavigationCounts(true);
      setNavigationCounts(counts);
    } catch {
      /* ignore */
    }
  };

  /** Generated contents + users for creator labels — chat loads in ChatFeatureHost. */
  const loadSecondaryData = async () => {
    const [generatedContents, users] = await Promise.all([
      getGeneratedContents().catch(() => []),
      currentUser?.role === 'owner' || currentUser?.role === 'company'
        ? getUsers().catch(() => [])
        : Promise.resolve([] as AuthUser[]),
    ]);
    setGeneratedContents(generatedContents);
    if (currentUser?.role === 'owner' || currentUser?.role === 'company') {
      setManagedUsers(users);
    } else {
      setManagedUsers([]);
    }
  };


  const loadModuleForTab = async (tab: string, opts?: { force?: boolean }) => {
    if (!currentUser) return;
    const force = opts?.force === true;
    const mark = (key: string) => {
      if (!force && loadedModulesRef.current.has(key)) return false;
      loadedModulesRef.current.add(key);
      return true;
    };

    try {
      if (tab === 'crm' || tab === 'users') {
        return;
      }
      if (tab === 'properties' || tab === 'projects') {
        return;
      }
      if (tab === 'ai-content') {
        setModuleLoading(true);
        if (mark('ai-properties') || force || aiPropertyOptions.length === 0) {
          const result = await listProperties({ page: 1, limit: 100, sort: 'created_at_desc' });
          setAiPropertyOptions(result.items);
          if (selectedPropertyForAI) {
            const fresh = result.items.find(p => p.id === selectedPropertyForAI.id);
            if (fresh) setSelectedPropertyForAI(fresh);
          }
        }
        if (mark('generated') || force) {
          await loadSecondaryData();
        }
        return;
      }
      if (['website-chat', 'chat-history', 'chatbot', 'inbox'].includes(tab)) {
        return;
      }
      if (tab === 'posts' && MXH_POSTS_ENABLED) {
        if (!mark('posts') && !force) return;
        setModuleLoading(true);
        const result = await listPosts({ page: 1, limit: DEFAULT_PAGE_SIZE, search: searchQuery.trim() || undefined });
        setPosts(result.items);
        return;
      }
      if (tab === 'inbox') {
        return;
      }
      if (tab === 'automations') {
        return;
      }
      if (tab === 'integrations') {
        return;
      }
      if (tab === 'settings' || tab === 'profile') {
        return;
      }
    } catch (e: any) {
      showToast(e.message || 'Không tải được dữ liệu module.', 'error');
    } finally {
      setModuleLoading(false);
    }
  };

  // Bootstrap only: auth shell + dashboard metrics + navigation counts (+ settings once).
  const fetchAllData = async () => {
    const isFirstLoad = !hasLoadedCoreData.current;
    if (isFirstLoad) setInitialLoading(true);
    else setRefreshing(true);

    try {
      invalidateCrmModule();
      cacheInvalidate('dashboard');
      cacheInvalidate('navigation-counts');
      const data = await getBootstrapData();
      setDashboardData(data.dashboard);
      setNavigationCounts(data.navigationCounts);
      setSettings(data.settings);
      hasLoadedCoreData.current = true;
      // Drop stale full-list caches when user explicitly refreshes.
      if (!isFirstLoad) {
        loadedModulesRef.current.clear();
        setPosts([]);
          }
    } catch (e: any) {
      console.error('Connection to APIs failed', e);
      showToast(e.message || 'Lỗi kết nối API Server. Hãy kiểm tra logs backend hoặc reload trang.', 'error');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAllData();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || initialLoading) return;
    void loadModuleForTab(activeTab);
  }, [currentUser, activeTab, initialLoading]);

  // Server-side search for posts tab (properties/inbox/CRM own their search).
  useEffect(() => {
    if (!currentUser || initialLoading) return;
    if (activeTab !== 'posts') return;
    const timer = window.setTimeout(() => {
      loadedModulesRef.current.delete('posts');
      void loadModuleForTab(activeTab, { force: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setAuthLoading(true);

    try {
      const session = await login(loginEmail, loginPassword);
      setCurrentUser(session.user);
      setActiveTab('dashboard');
      navigate('/admin/dashboard', { replace: true });
    } catch (error: any) {
      setLoginError(error.message || 'Đăng nhập thất bại.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
    setCurrentUser(null);
    setPosts([]);
    setAutomations([]);
    setGeneratedContents([]);
    setManagedUsers([]);
    setAdminMenuOpen(false);
    navigate('/admin/login', { replace: true });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  // Safe helper to copy text
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Đã sao chép vào bộ nhớ tạm thành công!", "success");
  };

  const handlePostStatusUpdate = async (post: Post, status: Post['status']) => {
    setActionLoading(`post-${status}-${post.id}`);
    try {
      const now = new Date();
      const nextSchedule = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const updatedPost = await updatePost(post.id, {
        status,
        scheduled_at: status === 'draft' ? '' : status === 'scheduled' ? nextSchedule : now.toISOString(),
        engagement: status === 'published'
          ? (post.engagement || { views: 0, likes: 0, shares: 0, comments: 0 })
          : post.engagement
      });

      setPosts(prev => prev.map(item => item.id === updatedPost.id ? updatedPost : item));
      showToast(status === 'published' ? 'Da danh dau dang bai thanh cong.' : 'Da luu lich dang bai.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Khong the cap nhat bai dang.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyGeneratedContent = async (record: GeneratedContentRecord) => {
    setActionLoading(`verify-content-${record.id}`);
    try {
      await verifyContent(record.id, record.verified_content || record.raw_content);
      setGeneratedContents(prev => prev.map(item => item.id === record.id
        ? { ...item, status: 'verified', verified_content: item.verified_content || item.raw_content, verified_at: new Date().toISOString() }
        : item
      ));
      showToast('Da duyet content de luu vao training data.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Khong the duyet content.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // AI property marketing content generator
  const handleAIGeneratePropertyMarketing = async (propId: string) => {
    setActionLoading(`gen-prop-${propId}`);
    try {
      const property = await generatePropertyMarketing(propId, aiGeneratingTone);
      setAiPropertyOptions(prev => prev.map(p => (p.id === propId ? property : p)));
      setSelectedPropertyForAI(property);
      showToast("Đã tạo campaign brief và nội dung đa kênh.", "success");
    } catch (e: any) {
      showToast(e.message || "Lỗi liên tuyến AI Marketing.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // AI Inbox reply smart suggestion

  // Submit reply message simulated

  // Submit add/edit property
  // Run manually test automation reports (sidebar sandbox button)
  const handleRunDemoAutomations = async () => {
    setActionLoading('run-automations');
    try {
      const updatedAutomations = await runDemoAutomations();
      showToast("Đã kích hoạt toàn bộ kịch bản tự động hóa và đồng bộ logs!", "success");
      setAutomations(updatedAutomations);
    } catch (e: any) {
      showToast(e.message || "Lỗi kiểm thử.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Send direct chat message to Assistant Chatbot

  const handleSaveProjectCatalog = async (patch: Partial<AppSettings>) => {
    setActionLoading('save-projects');
    try {
      const updatedSettings = await saveSettings({ ...settings, ...patch });
      setSettings(updatedSettings);
      showToast('Đã lưu danh mục và thứ tự dự án.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Không thể lưu dự án.', 'error');
      throw e;
    } finally {
      setActionLoading(null);
    }
  };





  const filteredPosts = posts.filter(pos => 
    pos.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pos.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const priorityPlatforms = ['facebook', 'zalo'];
  const publishPosts = [...filteredPosts].sort((a, b) => {
    const aPriority = priorityPlatforms.includes(a.platform) ? 0 : 1;
    const bPriority = priorityPlatforms.includes(b.platform) ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.status !== b.status) {
      const order = { draft: 0, scheduled: 1, published: 2 };
      return order[a.status] - order[b.status];
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const priorityGeneratedContents = generatedContents
    .filter(item => priorityPlatforms.includes(item.channel))
    .slice(0, 8);
  const canManageCmsUsers = currentUser?.role === 'owner' || currentUser?.role === 'company';
  const canManageWebsiteChat = canManageCmsUsers;
  if (authLoading && !currentUser) {
    return <AuthLoadingScreen />;
  }

  if (!currentUser) {
    return (
      <LoginPage
        loginEmail={loginEmail}
        loginPassword={loginPassword}
        loginError={loginError}
        authLoading={authLoading}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
      />
    );
  }

  const handleSelectNavTab = (
    id: string,
    opts?: { path?: string; openSeo?: boolean; openAgent?: boolean },
  ) => {
    setActiveTab(id);
    setSearchQuery('');
    if (opts?.openSeo) {
      setSeoMenuOpen(true);
      setAgentMenuOpen(false);
    } else if (opts?.openAgent) {
      setAgentMenuOpen(true);
      setSeoMenuOpen(false);
    }
    navigate(opts?.path || '/admin/dashboard');
  };

  return (
    <AppProviders>
    <>
    <AdminLayout
      toast={toast}
      onDismissToast={() => setToast(null)}
      header={{
        currentUser,
        settings,
        refreshing,
        onOpenMenu: () => setAdminMenuOpen(true),
        onOpenProfile: () => {
          setActiveTab('profile');
          setAdminMenuOpen(false);
          navigate('/admin/dashboard');
        },
        onRefresh: fetchAllData,
        onLogout: handleLogout,
      }}
      sidebar={{
        activeTab,
        adminMenuOpen,
        seoMenuOpen,
        agentMenuOpen,
        navigationCounts,
        canManageWebsiteChat,
        canManageCmsUsers,
        extraBadges: {
          users: managedUsers.length,
        },
        actionLoading,
        onCloseMenu: () => setAdminMenuOpen(false),
        onSelectTab: handleSelectNavTab,
        onToggleSeoMenu: () => setSeoMenuOpen(prev => !prev),
        onToggleAgentMenu: () => setAgentMenuOpen(prev => !prev),
        onRunDemoAutomations: handleRunDemoAutomations,
      }}
    >


          {location.pathname.startsWith('/admin/agents') ? (
            <Suspense fallback={<ModuleFallback label="Đang tải AI Agent…" />}>
              <AgentPlatformPage userRole={currentUser.role} />
            </Suspense>
          ) : (
          <>

          {/* Search bar inside view headers */}
          {['properties', 'posts', 'chat-history'].includes(activeTab) && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-3 sm:p-4 rounded-2xl border border-slate-900">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder={`Tìm kiếm nhanh theo tên, địa lý hoặc chủng loại...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 focus:border-rose-500/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

            </div>
          )}

          {/* Loading Indicator */}
          {initialLoading && (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
              <p className="text-slate-400 text-sm">Đang tải dashboard…</p>
            </div>
          )}

          {!initialLoading && moduleLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-500/30 border-t-rose-500" />
              Đang tải dữ liệu menu…
            </div>
          )}

          {/* Module Views */}
          {!initialLoading && (
            <>
              {/* ==================================================== */}
              {/* TAB 1: DASHBOARD OVERVIEW */}
              {/* ==================================================== */}
              {activeTab === 'dashboard' && (
                <Suspense fallback={<ModuleFallback label="Đang tải Executive KPIs…" />}>
                  <ExecutiveKpiGrid data={dashboardData} refreshing={refreshing} />
                </Suspense>
              )}

              {/* ==================================================== */}
              {/* TAB 2: CRM CUSTOMERS MANAGEMENT */}
              {/* ==================================================== */}
              {activeTab === 'crm' && (
                <Suspense fallback={<ModuleFallback label="Đang tải CRM…" />}>
                  <CustomersPage
                    onNotify={showToast}
                    onCustomersChanged={() => {
                      void refreshNavigationCounts();
                    }}
                    onDraftForCustomer={(prompt) => {
                      setActiveTab('chatbot');
                      setUserChatInput(prompt);
                      setChatDraftSeed(v => v + 1);
                    }}
                  />
                </Suspense>
              )}

              {activeTab === 'investor-leads' && (
                <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
                  <Suspense fallback={<ModuleFallback label="Đang tải Leads đầu tư…" />}>
                    <InvestorLeadsPage />
                  </Suspense>
                </div>
              )}

              {activeTab === 'short-links' && (
                <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
                  <Suspense fallback={<ModuleFallback label="Đang tải Short Links…" />}>
                    <ShortLinksPanel />
                  </Suspense>
                </div>
              )}

              {activeTab === 'lead-magnet-content' && (
                <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
                  <Suspense fallback={<ModuleFallback label="Đang tải Lead Magnet…" />}>
                    <LeadMagnetContentAdmin />
                  </Suspense>
                </div>
              )}

              {activeTab === 'projects' && (
                <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
                  <Suspense fallback={<ModuleFallback label="Đang tải dự án…" />}>
                    <AdminProjectsPanel
                      settings={settings}
                      saving={actionLoading === 'save-projects'}
                      onSave={handleSaveProjectCatalog}
                    />
                  </Suspense>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 3: PROPERTIES DIRECTORY */}
              {/* ==================================================== */}
              {activeTab === 'properties' && currentUser && (
                <Suspense fallback={<ModuleFallback label="Đang tải BĐS…" />}>
                  <PropertiesPage
                    onNotify={showToast}
                    settings={settings}
                    currentUser={currentUser}
                    onPropertySaved={() => {
                      void refreshNavigationCounts();
                    }}
                    onOpenAiContent={(prop) => {
                      setSelectedPropertyForAI(prop);
                      setAiGeneratingTone('sang trọng và chuyên nghiệp');
                      setAiPropertyOptions(prev => {
                        if (prev.some(p => p.id === prop.id)) return prev;
                        return [prop, ...prev];
                      });
                      setActiveTab('ai-content');
                    }}
                  />
                </Suspense>
              )}

              {activeTab === 'ai-content' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      AI Content & Prompt Generator Hub
                    </h2>
                    <p className="text-slate-400 text-sm">Thiết lập tham số bài đăng quảng cáo và yêu cầu AI tự tạo nội dung đa kênh.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Control Parameter Input */}
                    <div className="lg:col-span-5 bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                      <h3 className="text-sm font-bold text-white">Thao tác cấu hình</h3>
                      
                      <div className="space-y-3">
                        <label className="block text-xs font-semibold text-slate-400">1. Chọn sản phẩm bất động sản tiếp thị</label>
                        <select
                          value={selectedPropertyForAI?.id || ''}
                          onChange={(e) => {
                            const found = aiPropertyOptions.find(p => p.id === e.target.value);
                            if (found) {
                              setSelectedPropertyForAI(found);
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                        >
                          <option value="">-- Click để chọn bất động sản cần truyền thông --</option>
                          {aiPropertyOptions.map(p => (
                            <option key={p.id} value={p.id}>{p.title} - ({p.price} Tỷ)</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-semibold text-slate-400">2. Chọn giọng văn AI Agent truyền tải</label>
                        <select
                          value={aiGeneratingTone}
                          onChange={(e) => setAiGeneratingTone(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                        >
                          <option value="chuyên nghiệp, sang trọng tầm trung và cao cấp">Sang trọng & Chuyên nghiệp cao cấp</option>
                          <option value="hài hước, gần gũi, giật gân, ngôn ngữ mạng xã hội viral">Viral tấu hài & Bắt trend mạng xã hội</option>
                          <option value="cảm xúc, kiến tạo ước mơ, nhẹ nhàng, gia đình sum họp">Ấm áp, Cảm xúc & Gia đình sum họp</option>
                          <option value="mạnh mẽ, dứt khoát, gấp rút, hối thúc đầu tư nhanh">Sôi động, Thúc bách, Khuyên đầu tư khẩn</option>
                        </select>
                      </div>

                      {selectedPropertyForAI && (
                        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-900 space-y-2">
                          <span className="text-2xs font-bold text-rose-400 uppercase">Thông tin BĐS Tóm lược</span>
                          <h4 className="text-xs font-bold text-white">{selectedPropertyForAI.title}</h4>
                          <p className="text-2xs text-slate-400 leading-relaxed max-h-24 overflow-y-auto">{selectedPropertyForAI.description}</p>
                          <p className="text-2xs text-slate-500">Ảnh marketing sẽ dùng ảnh thật đầu tiên trong thư viện của BĐS này.</p>
                        </div>
                      )}

                      <button
                        onClick={() => selectedPropertyForAI && handleAIGeneratePropertyMarketing(selectedPropertyForAI.id)}
                        disabled={!selectedPropertyForAI || actionLoading === `gen-prop-${selectedPropertyForAI?.id}`}
                        className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{actionLoading === `gen-prop-${selectedPropertyForAI?.id}` ? "Đang lập chiến lược và viết bài..." : "Tạo Campaign & Content Đa Kênh"}</span>
                      </button>
                    </div>

                    {/* Output Tabs platforms */}
                    <div className="lg:col-span-7 bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Kết quả sáng xuất Marketing</h3>
                        <span className="text-2xs text-indigo-400 font-mono">Xây dựng tự động</span>
                      </div>

                      {selectedPropertyForAI?.ai_posts ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-900">
                            {['facebook', 'zalo', 'tiktok'].map((plat) => (
                              <button
                                key={plat}
                                className="text-2xs py-1.5 px-2 rounded-lg font-bold capitalize transition-all truncate hover:bg-slate-800 text-slate-300"
                                onClick={() => {
                                  const text = selectedPropertyForAI.ai_posts?.[plat as keyof typeof selectedPropertyForAI.ai_posts];
                                  if (typeof text === 'string') handleCopyText(text);
                                }}
                              >
                                {plat.replace('_', ' ')} 📋
                              </button>
                            ))}
                          </div>

                          <div className="space-y-4">
                            {selectedPropertyForAI.ai_posts.strategy && (
                              <div className="p-4 bg-gradient-to-br from-indigo-950/50 to-slate-950 rounded-xl border border-indigo-500/20 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-indigo-300">Campaign Brief do AI phát triển</span>
                                  <span className="text-3xs text-slate-500 uppercase">Chiến lược trước, content sau</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-2xs">
                                  <div><span className="text-slate-500 block mb-1">Khách mục tiêu</span><p className="text-slate-200 leading-relaxed">{selectedPropertyForAI.ai_posts.strategy.target_customer}</p></div>
                                  <div><span className="text-slate-500 block mb-1">Insight khách hàng</span><p className="text-slate-200 leading-relaxed">{selectedPropertyForAI.ai_posts.strategy.customer_insight}</p></div>
                                  <div><span className="text-slate-500 block mb-1">Góc bán</span><p className="text-slate-200 leading-relaxed">{selectedPropertyForAI.ai_posts.strategy.campaign_angle}</p></div>
                                  <div><span className="text-slate-500 block mb-1">Creative concept</span><p className="text-slate-200 leading-relaxed">{selectedPropertyForAI.ai_posts.strategy.creative_concept}</p></div>
                                </div>
                                <div className="pt-2 border-t border-indigo-500/10">
                                  <span className="text-slate-500 text-2xs block mb-1">Thông điệp chủ đạo</span>
                                  <p className="text-sm font-semibold text-white">{selectedPropertyForAI.ai_posts.strategy.key_message}</p>
                                </div>
                              </div>
                            )}

                            {selectedPropertyForAI.ai_posts.seo && (
                              <div className="p-4 bg-gradient-to-br from-emerald-950/40 to-slate-950 rounded-xl border border-emerald-500/20 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-emerald-300">Bộ SEO & Hashtag cho sản phẩm</span>
                                  <button
                                    onClick={() => handleCopyText(selectedPropertyForAI.ai_posts?.seo?.hashtags.join(' ') || '')}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5"
                                  >
                                    <Copy className="w-3.5 h-3.5" /> Copy hashtag
                                  </button>
                                </div>
                                <div>
                                  <span className="text-2xs text-slate-500 block mb-1">SEO title ({selectedPropertyForAI.ai_posts.seo.title.length}/60)</span>
                                  <p className="text-sm font-semibold text-white">{selectedPropertyForAI.ai_posts.seo.title}</p>
                                </div>
                                <div>
                                  <span className="text-2xs text-slate-500 block mb-1">Meta description ({selectedPropertyForAI.ai_posts.seo.meta_description.length}/155)</span>
                                  <p className="text-xs leading-relaxed text-slate-300">{selectedPropertyForAI.ai_posts.seo.meta_description}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {selectedPropertyForAI.ai_posts.seo.hashtags.map(hashtag => (
                                    <span key={hashtag} className="rounded-md bg-emerald-500/10 px-2 py-1 text-2xs font-semibold text-emerald-300">
                                      {hashtag}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-3xs text-slate-500">
                                  SEO title/meta dùng cho Google. Hashtag được tự gắn vào Facebook và TikTok; Zalo giữ nội dung sạch.
                                </p>
                              </div>
                            )}

                            {/* Facebook Section Column */}
                            {selectedPropertyForAI.ai_posts.facebook && (
                              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-900 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-blue-400">Facebook Post Phiên bản AI</span>
                                  <button onClick={() => selectedPropertyForAI.ai_posts?.facebook && handleCopyText(selectedPropertyForAI.ai_posts.facebook)} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5" /> Copy
                                  </button>
                                </div>
                                <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">{selectedPropertyForAI.ai_posts.facebook}</p>
                              </div>
                            )}

                            {/* Zalo Section Column */}
                            {selectedPropertyForAI.ai_posts.zalo && (
                              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-900 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-emerald-400">Zalo Message Phiên bản AI</span>
                                  <button onClick={() => selectedPropertyForAI.ai_posts?.zalo && handleCopyText(selectedPropertyForAI.ai_posts.zalo)} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5" /> Copy
                                  </button>
                                </div>
                                <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">{selectedPropertyForAI.ai_posts.zalo}</p>
                              </div>
                            )}

                            {/* TikTok Section */}
                            {selectedPropertyForAI.ai_posts.tiktok && (
                              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-900 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-rose-400">TikTok Reel Script 30-45 giây</span>
                                  <button onClick={() => selectedPropertyForAI.ai_posts?.tiktok && handleCopyText(selectedPropertyForAI.ai_posts.tiktok)} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5" /> Copy
                                  </button>
                                </div>
                                <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto">{selectedPropertyForAI.ai_posts.tiktok}</p>
                              </div>
                            )}

                            {/* Copy-ready image generation prompts */}
                            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-900 space-y-3">
                              <div>
                                <span className="text-xs font-bold text-amber-400 block">Prompt tạo ảnh cho ChatGPT / Gemini</span>
                                <span className="text-2xs text-slate-500">Tải hoặc đính kèm ảnh reference bên dưới vào ChatGPT/Gemini, sau đó copy prompt theo đúng kênh.</span>
                              </div>
                              {(selectedPropertyForAI.gallery_images?.[0] || selectedPropertyForAI.images) && (
                                <div className="flex gap-3 items-center p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                                  <img
                                    src={selectedPropertyForAI.gallery_images?.[0] || selectedPropertyForAI.images}
                                    alt="Ảnh listing dùng làm reference"
                                    className="w-20 h-20 rounded-lg object-cover"
                                  />
                                  <div className="text-2xs text-slate-400 leading-relaxed">
                                    <strong className="text-slate-200 block mb-1">Ảnh reference cần đính kèm</strong>
                                    Prompt yêu cầu AI tạo ảnh mới nhưng vẫn giữ đúng nhận diện và kiến trúc của tài sản này.
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {(['facebook', 'zalo', 'tiktok'] as MarketingCreativeChannel[]).map(channel => {
                                  const prompt = selectedPropertyForAI.ai_posts?.image_prompts?.[channel];
                                  return (
                                    <div key={channel} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-2xs font-bold text-slate-300">{MARKETING_CREATIVE_META[channel].label}</span>
                                        <button
                                          disabled={!prompt}
                                          onClick={() => prompt && handleCopyText(prompt)}
                                          className="text-2xs text-amber-400 disabled:text-slate-700 flex items-center gap-1"
                                        >
                                          <Copy className="w-3 h-3" /> Copy prompt
                                        </button>
                                      </div>
                                      <p className="text-3xs text-slate-500 font-mono leading-relaxed line-clamp-6 whitespace-pre-line">
                                        {prompt || 'Hãy tạo lại campaign để sinh prompt ảnh theo kênh.'}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Video prompt */}
                            {selectedPropertyForAI.ai_posts.video_prompt && (
                              <div className="grid grid-cols-1 gap-4">
                                {selectedPropertyForAI.ai_posts.video_prompt && (
                                  <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-900 space-y-2">
                                    <span className="text-2xs font-extrabold text-indigo-400 uppercase flex items-center gap-1">
                                      <Video className="w-3.5 h-3.5" /> short cinematic clip prompt
                                    </span>
                                    <p className="text-2xs text-slate-400 font-mono leading-relaxed line-clamp-3">{selectedPropertyForAI.ai_posts.video_prompt}</p>
                                    <button 
                                      onClick={() => handleCopyText(selectedPropertyForAI.ai_posts?.video_prompt || '')}
                                      className="text-2xs text-rose-400 hover:underline block"
                                    >
                                      Sao chép Prompt Video
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
                          <Sparkles className="w-12 h-12 text-slate-700" />
                          <p className="text-xs text-slate-500 max-w-sm">Chọn một bất động sản vàng bên trái và bấm nút "Phát kiến bằng AI" để tự sinh hàng loạt nội dung tiếp thị.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 5: POST CMS SCHEDULE */}
              {/* ==================================================== */}
              {MXH_POSTS_ENABLED && activeTab === 'posts' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Hệ thống tự động bài đăng truyền thông CMS
                    </h2>
                    <p className="text-slate-400 text-sm">Chỉnh sửa, lên lịch phân phối nội dung giả lập tới Facebook, Zalo, Tiktok và Website.</p>
                  </div>

                  <div className="bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-900 text-xs uppercase tracking-wider text-slate-500">
                            <th className="py-4 px-5">Tiêu đề truyền thông</th>
                            <th className="py-4 px-5">Kênh phân phối</th>
                            <th className="py-4 px-5">Nội dung (Bản Demo)</th>
                            <th className="py-4 px-5">Bất động sản đính kèm</th>
                            <th className="py-4 px-5">Lên lịch / Trạng thái</th>
                            <th className="py-4 px-5 text-right">Lượt tương tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {publishPosts.map((post) => (
                            <tr key={post.id} className="hover:bg-slate-900/20 transition-all">
                              <td className="py-4 px-5 font-bold text-white">
                                {post.title}
                                {post.created_by_ai && (
                                  <span className="block text-2xs text-rose-400 font-normal font-mono">🌟 Sinh bởi AI Agent</span>
                                )}
                              </td>
                              <td className="py-4 px-5">
                                <span className="uppercase text-xs font-bold text-slate-200 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-900">
                                  {post.platform}
                                </span>
                              </td>
                              <td className="py-4 px-5 max-w-sm">
                                <p className="text-xs text-slate-400 line-clamp-3 whitespace-pre-line leading-relaxed">{post.content}</p>
                                <button
                                  onClick={() => handleCopyText(post.content)}
                                  className="text-2xs text-rose-400 hover:underline mt-2 flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" /> Copy trích lục
                                </button>
                              </td>
                              <td className="py-4 px-5 text-xs text-slate-300">
                                {post.property_title || 'Thảo luận thị trường'}
                              </td>
                              <td className="py-4 px-5 space-y-1">
                                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                                  post.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  post.status === 'scheduled' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                  'bg-slate-800 text-slate-500'
                                }`}>
                                  {post.status}
                                </span>
                                {post.scheduled_at && (
                                  <span className="block text-2xs text-slate-500 font-mono">Ngày: {post.scheduled_at}</span>
                                )}
                              </td>
                              <td className="py-4 px-5 text-right font-mono text-xs">
                                {post.engagement ? (
                                  <div className="space-y-1">
                                    <div className="text-slate-300">👁 {post.engagement.views} views</div>
                                    <div className="text-rose-500">♥ {post.engagement.likes} likes</div>
                                    <div className="text-slate-500 font-sans text-2xs">🗣 {post.engagement.comments} comments</div>
                                  </div>
                                ) : (
                                  <span className="text-slate-500 italic">Nháp chưa đăng</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab.startsWith('seo-') && getAuthToken() && (
                <Suspense fallback={<ModuleFallback label="Đang tải SEO CMS…" />}>
                  <SeoContentAdmin
                    token={getAuthToken()!}
                    section={
                      activeTab === 'seo-categories' ? 'categories'
                      : activeTab === 'seo-tags' ? 'tags'
                      : activeTab === 'seo-audit' ? 'audit'
                      : 'posts'
                    }
                  />
                </Suspense>
              )}

              {/* ==================================================== */}
              {/* TAB 6: INBOX MULTICHANNEL */}
              {/* ==================================================== */}
              {activeTab === 'inbox' && (
                <Suspense fallback={<ModuleFallback label="Đang tải Inbox…" />}>
                  <InboxPage
                    onNotify={showToast}
                    searchQuery={searchQuery}
                    onCountsChanged={() => {
                      void refreshNavigationCounts();
                    }}
                  />
                </Suspense>
              )}

              {activeTab === 'chatbot' && currentUser && (
                <Suspense fallback={<ModuleFallback label="Đang tải Chatbot…" />}>
                  <ChatFeatureHost
                    mode="chatbot"
                    currentUser={currentUser}
                    onNotify={showToast}
                    searchQuery={searchQuery}
                    canManageWebsiteChat={canManageWebsiteChat}
                    settings={settings}
                    initialDraft={userChatInput}
                    onCountsChanged={() => {
                      void refreshNavigationCounts();
                    }}
                    key={`chatbot-${chatDraftSeed}`}
                  />
                </Suspense>
              )}

              {activeTab === 'website-chat' && currentUser && canManageWebsiteChat && (
                <Suspense fallback={<ModuleFallback label="Đang tải Website Chat…" />}>
                  <ChatFeatureHost
                    mode="website-chat"
                    currentUser={currentUser}
                    onNotify={showToast}
                    searchQuery={searchQuery}
                    canManageWebsiteChat={canManageWebsiteChat}
                    settings={settings}
                    onCountsChanged={() => {
                      void refreshNavigationCounts();
                    }}
                  />
                </Suspense>
              )}

              {activeTab === 'chat-history' && currentUser && (
                <Suspense fallback={<ModuleFallback label="Đang tải Chat History…" />}>
                  <ChatFeatureHost
                    mode="chat-history"
                    currentUser={currentUser}
                    onNotify={showToast}
                    searchQuery={searchQuery}
                    canManageWebsiteChat={canManageWebsiteChat}
                    settings={settings}
                    onCountsChanged={() => {
                      void refreshNavigationCounts();
                    }}
                  />
                </Suspense>
              )}

              {activeTab === 'automations' && (
                <Suspense fallback={<ModuleFallback label="Đang tải Automation…" />}>
                  <AutomationsPage onNotify={showToast} />
                </Suspense>
              )}

              {activeTab === 'users' && canManageCmsUsers && (
                <Suspense fallback={<ModuleFallback label="Đang tải Users…" />}>
                  <UsersPage
                    currentUser={currentUser}
                    onNotify={showToast}
                    onCurrentUserUpdated={setCurrentUser}
                  />
                </Suspense>
              )}

              {activeTab === 'profile' && currentUser && (
                <Suspense fallback={<ModuleFallback label="Đang tải hồ sơ…" />}>
                  <ProfilePage
                    currentUser={currentUser}
                    onUserUpdated={setCurrentUser}
                    onManagedUsersPatch={setManagedUsers}
                    onNotify={showToast}
                  />
                </Suspense>
              )}

              {activeTab === 'integrations' && (
                <Suspense fallback={<ModuleFallback label="Đang tải tích hợp…" />}>
                  <IntegrationsPage onNotify={showToast} />
                </Suspense>
              )}

              {activeTab === 'settings' && (
                <Suspense fallback={<ModuleFallback label="Đang tải Settings…" />}>
                  <SystemSettingsPage
                    onNotify={showToast}
                    onSettingsSaved={setSettings}
                  />
                </Suspense>
              )}

            </>
          )}

          </>
          )}


    </AdminLayout>

      {/* ==================================================== */}
      {/* MODAL WORKSPACES */}
      {/* ==================================================== */}



    </>
    </AppProviders>
  );
}
