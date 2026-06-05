import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
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
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Video,
  Image as ImageIcon,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldCheck,
  UserPlus,
  Menu
} from 'lucide-react';
import { AuthUser, Customer, Property, Post, InboxMessage, AutomationTask, ChatMessage, ChatHistoryRecord, PublicChatGuest, AppSettings, MarketingChannel, GeneratedContentRecord, User } from './types';
import { ASSISTANT_WELCOME_MESSAGE, DEFAULT_SETTINGS } from './config/defaults';
import MarkdownContent from './components/MarkdownContent';
import MarkdownEditor from './components/MarkdownEditor';
import {
  analyzeCustomer,
  createCustomer,
  createProperty,
  deleteProperty,
  createUser,
  DashboardData,
  generateInboxReply,
  generatePropertyMarketing,
  getAuthToken,
  getChatHistory,
  getPublicChatGuestHistory,
  getPublicChatGuests,
  getCurrentUser,
  getGeneratedContents,
  getInitialAppData,
  getUsers,
  login,
  logout,
  runDemoAutomations,
  saveSettings,
  sendAssistantMessage,
  sendPublicChatGuestMessage,
  sendInboxReply,
  toggleAutomation,
  updatePublicChatGuestAi,
  updateCustomer,
  updatePost,
  updateProperty,
  updateUser,
  verifyContent
} from './services/api';

const PROPERTY_TYPE_OPTIONS = ['Đất nền', 'Nhà Phố', 'Căn Hộ', 'Shophouse', 'Kho xưởng', 'Nhà hàng', 'Khách sạn', 'Biệt thự', 'Villa', 'Khác'];
const TRANSACTION_TYPE_OPTIONS = ['Bán', 'Cho thuê'];
const DIRECTION_OPTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];
const LEGAL_STATUS_OPTIONS = ['Sổ đỏ', 'Sổ hồng', 'Sổ hồng riêng', 'Sổ hồng hoàn công', 'Sở hữu lâu dài', 'Sở hữu 50 năm', 'Hợp đồng mua bán', 'Đang chờ sổ'];
const PROPERTY_STATUS_OPTIONS = [
  { value: 'available', label: 'Đang bán/cho thuê' },
  { value: 'sold', label: 'Đã bán/đã thuê' },
  { value: 'hidden', label: 'Đã ẩn' }
];

const DASHBOARD_PLATFORM_META: Record<Post['platform'], { name: string; color: string }> = {
  facebook: { name: 'Facebook', color: 'bg-indigo-500' },
  zalo: { name: 'Zalo', color: 'bg-blue-400' },
  tiktok: { name: 'TikTok', color: 'bg-rose-500' },
  website: { name: 'Website', color: 'bg-emerald-400' }
};

const createEmptyPropertyForm = () => ({
  title: '', transaction_type: 'Bán', type: 'Đất nền', location: '', area: '100', floor_area: '', price: '4.5',
  legal_status: 'Sổ hồng', direction: 'Đông Nam', road_width: '7.5',
  floors: '', bedrooms: '', bathrooms: '', garage: false, pool: false,
  description: '', rich_description: '', internal_notes: '', images: '', gallery_images: [] as string[],
  sale_status: 'available', selling_points: ''
});

type MarketingCreativeChannel = 'facebook' | 'zalo' | 'tiktok';

const MARKETING_CREATIVE_META: Record<MarketingCreativeChannel, { label: string }> = {
  facebook: { label: 'Facebook 3:4' },
  zalo: { label: 'Zalo 1:1' },
  tiktok: { label: 'TikTok 9:16' }
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem('real_estate_ai_active_tab') || 'dashboard');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  
  // App variables states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [automations, setAutomations] = useState<AutomationTask[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [generatedContents, setGeneratedContents] = useState<GeneratedContentRecord[]>([]);
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [chatHistoryRecords, setChatHistoryRecords] = useState<ChatHistoryRecord[]>([]);
  const [selectedChatHistorySessionId, setSelectedChatHistorySessionId] = useState('');
  const [publicChatGuests, setPublicChatGuests] = useState<PublicChatGuest[]>([]);
  const [selectedChatGuestId, setSelectedChatGuestId] = useState<string>('');
  const [selectedGuestChatHistory, setSelectedGuestChatHistory] = useState<ChatHistoryRecord[]>([]);
  const [guestReplyInput, setGuestReplyInput] = useState('');
  // Loading & interactive states
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [propertyFilters, setPropertyFilters] = useState({
    price: 'all',
    area: 'all',
    type: 'all',
    transactionType: 'all',
    status: 'visible'
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  // Chatbot states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([ASSISTANT_WELCOME_MESSAGE]);
  const [userChatInput, setUserChatInput] = useState<string>('');

  // Gallery carousel state for properties
  const [propertyGalleryIndex, setPropertyGalleryIndex] = useState<{ [key: string]: number }>({});

  // Modals & form fields state
  const [showAddCustomerModal, setShowAddCustomerModal] = useState<boolean>(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '', phone: '', email: '', source: 'facebook', budget: '5', 
    interested_area: 'Hòa Xuân, Cẩm Lệ', property_type: 'Đất nền', status: 'new', notes: ''
  });

  const [showAddPropertyModal, setShowAddPropertyModal] = useState<boolean>(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [newPropertyForm, setNewPropertyForm] = useState(createEmptyPropertyForm);

  const [selectedPropertyForAI, setSelectedPropertyForAI] = useState<Property | null>(null);
  const [aiGeneratingTone, setAiGeneratingTone] = useState<string>('sang trọng và chuyên nghiệp');

  const [selectedInboxMessage, setSelectedInboxMessage] = useState<InboxMessage | null>(null);
  const [responseReplyText, setResponseReplyText] = useState<string>('');
  const [selectedPermissionMemberId, setSelectedPermissionMemberId] = useState<string>('');
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
    company_id: 'comp-da-nang',
    status: 'active'
  });

  const dashboardData = useMemo<DashboardData>(() => {
    const platforms: Post['platform'][] = ['facebook', 'zalo', 'tiktok', 'website'];

    return {
      stats: {
        totalCustomers: customers.length,
        leads: {
          hot: customers.filter(customer => customer.status === 'hot').length,
          warm: customers.filter(customer => customer.status === 'warm').length,
          cold: customers.filter(customer => customer.status === 'new').length
        },
        totalProperties: properties.filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available')).length,
        totalPosts: posts.length,
        pendingInbox: inbox.filter(message => message.status === 'pending').length,
        todayTasksCount: customers.filter(customer => customer.status === 'hot' && customer.lead_score > 80).length
      },
      metrics: platforms.map(platform => {
        const platformPosts = posts.filter(post => post.platform === platform);
        return {
          platform,
          reach: platformPosts.reduce((sum, post) => sum + (post.engagement?.views || 0), 0),
          engagement: platformPosts.reduce(
            (sum, post) => sum
              + (post.engagement?.likes || 0)
              + (post.engagement?.shares || 0)
              + (post.engagement?.comments || 0),
            0
          ),
          leads: customers.filter(customer => customer.source === platform).length
        };
      })
    };
  }, [customers, properties, posts, inbox]);

  const maxDashboardReach = Math.max(1, ...dashboardData.metrics.map(metric => metric.reach));
  const topDashboardMetric = dashboardData.metrics.reduce(
    (top, metric) => metric.reach > top.reach ? metric : top,
    dashboardData.metrics[0]
  );

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

  // Read data from API server entry
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const data = await getInitialAppData();
      setCustomers(data.customers);
      setProperties(data.properties);
      setPosts(data.posts);
      setInbox(data.inbox);
      setAutomations(data.automations);
      setSettings(data.settings);
      setChannels(data.channels);
      setChatHistoryRecords(await getChatHistory().catch(() => []));
      const guests = await getPublicChatGuests().catch(() => []);
      setPublicChatGuests(guests);
      setSelectedChatGuestId(prev => prev || guests[0]?.session_id || '');
      const chatHistory = await getChatHistory('mine').catch(() => []);
      if (chatHistory.length > 0) {
        setChatMessages(chatHistory.slice().reverse().map(item => ({
          role: item.role,
          content: item.message,
          timestamp: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })));
      }
      setGeneratedContents(await getGeneratedContents().catch(() => []));
      if (currentUser?.role === 'owner' || currentUser?.role === 'company') {
        const users = await getUsers().catch(() => []);
        setManagedUsers(users);
        const firstMember = users.find(user => user.role === 'member');
        setSelectedPermissionMemberId(prev => prev || firstMember?.id || '');
      } else {
        setManagedUsers([]);
        setSelectedPermissionMemberId('');
      }

    } catch (e: any) {
      console.error("Connection to APIs failed, utilizing db.json directly if cached...", e);
      showToast(e.message || "Lỗi kết nối API Server. Hãy kiểm tra logs backend hoặc reload trang.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAllData();
    }
  }, [currentUser]);

  const refreshPublicGuestChats = async (sessionId = selectedChatGuestId) => {
    const guests = await getPublicChatGuests().catch(() => publicChatGuests);
    setPublicChatGuests(guests);
    if (!sessionId && guests[0]?.session_id) {
      setSelectedChatGuestId(guests[0].session_id);
      sessionId = guests[0].session_id;
    }
    if (sessionId) {
      setSelectedGuestChatHistory(await getPublicChatGuestHistory(sessionId).catch(() => []));
    }
  };

  const refreshChatHistoryRecords = async () => {
    setChatHistoryRecords(await getChatHistory().catch(() => chatHistoryRecords));
  };

  useEffect(() => {
    if (!currentUser || !['chatbot', 'chat-history'].includes(activeTab)) return;
    refreshPublicGuestChats(selectedChatGuestId);
    refreshChatHistoryRecords();
    const timer = window.setInterval(() => {
      refreshPublicGuestChats(selectedChatGuestId);
      refreshChatHistoryRecords();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [currentUser, activeTab, selectedChatGuestId]);

  useEffect(() => {
    localStorage.setItem('real_estate_ai_active_tab', activeTab);
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
    localStorage.removeItem('real_estate_ai_active_tab');
    setCurrentUser(null);
    setCustomers([]);
    setProperties([]);
    setPosts([]);
    setInbox([]);
    setAutomations([]);
    setGeneratedContents([]);
    setManagedUsers([]);
    setChatHistoryRecords([]);
    setPublicChatGuests([]);
    setSelectedChatGuestId('');
    setSelectedGuestChatHistory([]);
    setGuestReplyInput('');
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

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading('create-user');
    try {
      const payload = {
        ...newUserForm,
        role: currentUser?.role === 'company' ? 'member' : newUserForm.role,
        company_id: currentUser?.role === 'company' ? currentUser.company_id : newUserForm.company_id
      };
      const created = await createUser(payload);
      setManagedUsers(prev => [created, ...prev]);
      if (!selectedPermissionMemberId && created.role === 'member') setSelectedPermissionMemberId(created.id);
      setNewUserForm({
        name: '',
        email: '',
        password: '',
        role: 'member',
        company_id: currentUser?.company_id || 'comp-da-nang',
        status: 'active'
      });
      showToast('Da tao user moi.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Khong the tao user.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    setActionLoading(`user-status-${user.id}`);
    try {
      const updated = await updateUser(user.id, { status: user.status === 'active' ? 'inactive' : 'active' });
      setManagedUsers(prev => prev.map(item => item.id === updated.id ? updated : item));
      showToast('Da cap nhat trang thai user.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Khong the cap nhat user.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleMemberAssignment = async (
    collection: 'customers' | 'properties' | 'posts',
    resource: Customer | Property | Post,
    memberId: string
  ) => {
    if (!memberId) return;
    const assignedIds = resource.assigned_member_ids || [];
    const nextAssignedIds = assignedIds.includes(memberId)
      ? assignedIds.filter(id => id !== memberId)
      : [...assignedIds, memberId];

    setActionLoading(`assign-${collection}-${resource.id}`);
    try {
      if (collection === 'customers') {
        const updated = await updateCustomer(resource.id, { assigned_member_ids: nextAssignedIds });
        setCustomers(prev => prev.map(item => item.id === updated.id ? updated : item));
      }
      if (collection === 'properties') {
        const updated = await updateProperty(resource.id, { assigned_member_ids: nextAssignedIds });
        setProperties(prev => prev.map(item => item.id === updated.id ? updated : item));
      }
      if (collection === 'posts') {
        const updated = await updatePost(resource.id, { assigned_member_ids: nextAssignedIds });
        setPosts(prev => prev.map(item => item.id === updated.id ? updated : item));
      }
      showToast('Da cap nhat quyen truy cap.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Khong the cap quyen.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const resizeImageFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = 1280;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('Không thể xử lý ảnh trên trình duyệt.'));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.onerror = reject;
      image.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const readImageFiles = async (files: FileList | null): Promise<string[]> => {
    if (!files?.length) return [];

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, 6);
    return Promise.all(imageFiles.map(resizeImageFile));
  };

  const openAddPropertyModal = () => {
    setEditingProperty(null);
    setNewPropertyForm(createEmptyPropertyForm());
    setShowAddPropertyModal(true);
  };

  const openEditPropertyModal = (property: Property) => {
    setEditingProperty(property);
    setNewPropertyForm({
      title: property.title,
      transaction_type: property.transaction_type || 'Bán',
      type: property.type,
      location: property.location,
      area: String(property.area),
      floor_area: property.floor_area ? String(property.floor_area) : '',
      price: String(property.price),
      legal_status: property.legal_status,
      direction: property.direction,
      road_width: String(property.road_width),
      floors: property.floors ? String(property.floors) : '',
      bedrooms: property.bedrooms ? String(property.bedrooms) : '',
      bathrooms: property.bathrooms ? String(property.bathrooms) : '',
      garage: Boolean(property.garage),
      pool: Boolean(property.pool),
      description: property.description,
      rich_description: property.rich_description || '',
      internal_notes: property.internal_notes || '',
      images: property.images || '',
      gallery_images: [...(property.gallery_images || [])],
      sale_status: property.sale_status || 'available',
      selling_points: (property.selling_points || []).join('\n')
    });
    setShowAddPropertyModal(true);
  };

  const closePropertyModal = () => {
    setShowAddPropertyModal(false);
    setEditingProperty(null);
    setNewPropertyForm(createEmptyPropertyForm());
  };

  const handlePropertyImageUpload = async (prop: Property, files: FileList | null) => {
    setActionLoading(`upload-prop-${prop.id}`);
    try {
      const uploadedImages = await readImageFiles(files);
      if (!uploadedImages.length) {
        showToast("Vui lòng chọn file ảnh hợp lệ.", "error");
        return;
      }

      const gallery = [...(prop.gallery_images || []), ...uploadedImages].slice(0, 8);
      const updated = await updateProperty(prop.id, {
        images: prop.images || uploadedImages[0],
        gallery_images: gallery
      });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      if (selectedPropertyForAI?.id === prop.id) setSelectedPropertyForAI(updated);
      showToast("Đã upload và lưu ảnh bất động sản.", "success");
    } catch (e: any) {
      showToast(e.message || "Lỗi upload ảnh.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePropertySold = async (prop: Property) => {
    setActionLoading(`sold-prop-${prop.id}`);
    try {
      const updated = await updateProperty(prop.id, {
        sale_status: prop.sale_status === 'sold' ? 'available' : 'sold'
      });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      if (selectedPropertyForAI?.id === prop.id) setSelectedPropertyForAI(updated);
      showToast(updated.sale_status === 'sold' ? "Đã đánh dấu bất động sản là đã bán." : "Đã chuyển bất động sản về trạng thái đang bán.", "success");
    } catch (e: any) {
      showToast(e.message || "Lỗi cập nhật trạng thái bán.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const buildPropertyCopyText = (prop: Property) => [
    prop.title,
    `Hình thức: ${prop.transaction_type || 'Bán'}`,
    `Loại hình: ${prop.type}`,
    `Vị trí: ${prop.location}`,
    `Giá: ${prop.price} tỷ VND`,
    `Diện tích: ${prop.area} m2`,
    prop.floor_area ? `Diện tích sàn: ${prop.floor_area} m2` : '',
    `Pháp lý: ${prop.legal_status}`,
    `Hướng: ${prop.direction}`,
    `Đường: ${prop.road_width} m`,
    prop.floors ? `Số tầng: ${prop.floors}` : '',
    prop.bedrooms ? `Phòng ngủ: ${prop.bedrooms}` : '',
    prop.bathrooms ? `Phòng tắm: ${prop.bathrooms}` : '',
    prop.garage ? 'Có gara' : '',
    prop.pool ? 'Có hồ bơi' : '',
    `Trạng thái: ${prop.sale_status === 'sold' ? 'Đã bán' : 'Đang bán'}`,
    '',
    prop.rich_description || prop.description,
    '',
    `Điểm nổi bật: ${(prop.selling_points || []).join(', ')}`,
    prop.internal_notes ? `Ghi chú nội bộ: ${prop.internal_notes}` : ''
  ].filter(Boolean).join('\n');

  // AI customer optimization
  const handleAICodeAnalyzeCustomer = async (id: string) => {
    setActionLoading(`analyze-cust-${id}`);
    try {
      const customer = await analyzeCustomer(id);
      showToast(`AI đã phân tích chấm điểm tiềm năng: ${customer.lead_score} điểm.`, 'success');
      setCustomers(prev => prev.map(c => c.id === id ? customer : c));
    } catch (e: any) {
      showToast(e.message || "Lỗi liên kết AI phân tích.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // AI property marketing content generator
  const handleAIGeneratePropertyMarketing = async (propId: string) => {
    setActionLoading(`gen-prop-${propId}`);
    try {
      const property = await generatePropertyMarketing(propId, aiGeneratingTone);
      setProperties(prev => prev.map(p => p.id === propId ? property : p));
      setSelectedPropertyForAI(property);
      showToast("Đã tạo campaign brief và nội dung đa kênh.", "success");
    } catch (e: any) {
      showToast(e.message || "Lỗi liên tuyến AI Marketing.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // AI Inbox reply smart suggestion
  const handleAILiveReplySuggestion = async (msgId: string) => {
    setActionLoading(`reply-sugg-${msgId}`);
    try {
      const message = await generateInboxReply(msgId);
      showToast("AI đã soạn thành công kịch bản trả lời khách!", "success");
      setInbox(prev => prev.map(m => m.id === msgId ? message : m));
      setResponseReplyText(message.ai_reply_suggestion || '');
    } catch (e: any) {
      showToast(e.message || "Lỗi soạn kịch bản từ Ollama/Gemini.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Submit reply message simulated
  const handleSendManualReply = async (msgId: string) => {
    if (!responseReplyText.trim()) {
      showToast("Vui lòng điền nội dung câu trả lời", "error");
      return;
    }
    setActionLoading(`send-reply-${msgId}`);
    try {
      const message = await sendInboxReply(msgId, responseReplyText);
      showToast("Đã gửi phản hồi thành công và cập nhật trạng thái đã xử lý!", "success");
      setInbox(prev => prev.map(m => m.id === msgId ? message : m));
      setSelectedInboxMessage(null);
      setResponseReplyText('');
    } catch (e: any) {
      showToast(e.message || "Lỗi gửi.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Submit add customer
  const handleAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const customer = await createCustomer(newCustomerForm);
      showToast("Đã thêm khách hàng mới thành công!", "success");
      setCustomers(prev => [customer, ...prev]);
      setShowAddCustomerModal(false);
      setNewCustomerForm({
        name: '', phone: '', email: '', source: 'facebook', budget: '5', 
        interested_area: 'Hòa Xuân, Cẩm Lệ', property_type: 'Đất nền', status: 'new', notes: ''
      });
    } catch (e: any) {
      showToast(e.message || "Lỗi thêm khách.", "error");
    }
  };

  // Submit add/edit property
  const handleSaveProperty = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading(editingProperty ? `edit-prop-${editingProperty.id}` : 'add-property');
    try {
      const sellingPoints = newPropertyForm.selling_points.split('\n').map(line => line.trim()).filter(Boolean);
      const fallbackDescription = sellingPoints.join('. ') || newPropertyForm.rich_description || '';
      const payload = {
        ...newPropertyForm,
        area: Number(newPropertyForm.area),
        floor_area: newPropertyForm.floor_area ? Number(newPropertyForm.floor_area) : undefined,
        price: Number(newPropertyForm.price),
        road_width: Number(newPropertyForm.road_width),
        floors: newPropertyForm.floors ? Number(newPropertyForm.floors) : undefined,
        bedrooms: newPropertyForm.bedrooms ? Number(newPropertyForm.bedrooms) : undefined,
        bathrooms: newPropertyForm.bathrooms ? Number(newPropertyForm.bathrooms) : undefined,
        garage: Boolean(newPropertyForm.garage),
        pool: Boolean(newPropertyForm.pool),
        description: fallbackDescription,
        rich_description: newPropertyForm.rich_description || fallbackDescription,
        selling_points: sellingPoints
      };

      if (editingProperty) {
        const property = await updateProperty(editingProperty.id, payload);
        setProperties(prev => prev.map(item => item.id === property.id ? property : item));
        setPropertyGalleryIndex(prev => ({ ...prev, [property.id]: 0 }));
        if (selectedPropertyForAI?.id === property.id) setSelectedPropertyForAI(property);
        showToast("Đã cập nhật bất động sản thành công!", "success");
      } else {
        const property = await createProperty(payload);
        setProperties(prev => [property, ...prev]);
        showToast("Thêm bất động sản mới thành công! Tự động chạy chiến dịch marketing.", "success");
      }

      closePropertyModal();
    } catch (e: any) {
      showToast(e.message || "Không thể lưu bất động sản.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle automation trigger
  const handleToggleAutomation = async (id: string) => {
    try {
      const automation = await toggleAutomation(id);
      showToast(`Đã ${automation.status === 'active' ? 'bật' : 'tắt'} kịch bản tự động hóa!`, 'info');
      setAutomations(prev => prev.map(a => a.id === id ? automation : a));
    } catch (e: any) {
      showToast(e.message || "Lỗi thao tác tự động hóa.", "error");
    }
  };

  // Run manually test automation reports
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
  const handleSendChatbotMessage = async () => {
    if (!userChatInput.trim()) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: userChatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setUserChatInput('');
    setActionLoading('chatbot-chat');
    
    try {
      const assistantReply = await sendAssistantMessage(userMsg.content);
      setChatMessages(prev => [...prev, {
        role: 'model',
        content: assistantReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (e: any) {
      showToast(e.message || "Lỗi kết nối server AI.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleGuestAi = async (guest: PublicChatGuest) => {
    setActionLoading(`guest-ai-${guest.session_id}`);
    try {
      const nextEnabled = !Boolean(guest.ai_enabled);
      const updated = await updatePublicChatGuestAi(guest.session_id, nextEnabled);
      setPublicChatGuests(prev => prev.map(item => item.session_id === updated.session_id ? updated : item));
      showToast(nextEnabled ? 'Đã bật lại AI cho khách này.' : 'Đã tắt AI, admin sẽ tự chat với khách.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Không thể cập nhật trạng thái AI.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendGuestReply = async () => {
    const message = guestReplyInput.trim();
    if (!selectedChatGuestId || !message) return;
    setActionLoading(`guest-reply-${selectedChatGuestId}`);
    try {
      const saved = await sendPublicChatGuestMessage(selectedChatGuestId, message);
      setSelectedGuestChatHistory(prev => [...prev, saved]);
      setGuestReplyInput('');
      await refreshPublicGuestChats(selectedChatGuestId);
    } catch (error: any) {
      showToast(error.message || 'Không thể gửi tin nhắn cho khách.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendHistoryGuestReply = async () => {
    const message = guestReplyInput.trim();
    if (!selectedHistoryGuest || !message) return;
    setActionLoading(`guest-reply-${selectedHistoryGuest.session_id}`);
    try {
      await sendPublicChatGuestMessage(selectedHistoryGuest.session_id, message);
      setGuestReplyInput('');
      await refreshPublicGuestChats(selectedHistoryGuest.session_id);
      await refreshChatHistoryRecords();
    } catch (error: any) {
      showToast(error.message || 'Không thể gửi tin nhắn cho khách.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSoftDeleteProperty = async (prop: Property) => {
    setActionLoading(`hide-prop-${prop.id}`);
    try {
      const updated = await deleteProperty(prop.id);
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      if (selectedPropertyForAI?.id === prop.id) setSelectedPropertyForAI(updated);
      showToast('Đã ẩn sản phẩm khỏi listing công khai. Có thể khôi phục trong CMS.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Không thể ẩn sản phẩm.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreProperty = async (prop: Property) => {
    setActionLoading(`restore-prop-${prop.id}`);
    try {
      const updated = await updateProperty(prop.id, { sale_status: 'available' });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      if (selectedPropertyForAI?.id === prop.id) setSelectedPropertyForAI(updated);
      showToast('Đã khôi phục sản phẩm về listing công khai.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Không thể khôi phục sản phẩm.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Update Settings Configuration
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading('save-settings');
    try {
      const updatedSettings = await saveSettings(settings);
      showToast("Đã lưu thiết lập cấu hình AI thành công!", "success");
      setSettings(updatedSettings);
    } catch (e: any) {
      showToast(e.message || "Lỗi lưu.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Filter lists based on lookup
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery) || 
    c.interested_area.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.property_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProperties = properties.filter(p => {
    const normalizedSearch = searchQuery.toLowerCase();
    const saleStatus = p.sale_status || 'available';
    const searchableText = [
      p.title,
      p.location,
      p.type,
      p.transaction_type || '',
      p.legal_status,
      p.direction,
      p.rich_description || p.description || '',
      p.internal_notes || '',
      saleStatus
    ].join(' ').toLowerCase();

    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
    const matchesType = propertyFilters.type === 'all' || p.type === propertyFilters.type;
    const matchesTransaction = propertyFilters.transactionType === 'all' || (p.transaction_type || 'Bán') === propertyFilters.transactionType;
    const matchesStatus =
      propertyFilters.status === 'all'
        || (propertyFilters.status === 'visible' ? saleStatus !== 'hidden' : saleStatus === propertyFilters.status);
    const matchesPrice =
      propertyFilters.price === 'all'
        || (propertyFilters.price === 'under3' && p.price < 3)
        || (propertyFilters.price === '3to5' && p.price >= 3 && p.price <= 5)
        || (propertyFilters.price === '5to10' && p.price > 5 && p.price <= 10)
        || (propertyFilters.price === 'over10' && p.price > 10);
    const matchesArea =
      propertyFilters.area === 'all'
        || (propertyFilters.area === 'under80' && p.area < 80)
        || (propertyFilters.area === '80to150' && p.area >= 80 && p.area <= 150)
        || (propertyFilters.area === 'over150' && p.area > 150);

    return matchesSearch && matchesType && matchesTransaction && matchesStatus && matchesPrice && matchesArea;
  });

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
  const managedMembers = managedUsers.filter(user => user.role === 'member' && user.status === 'active');
  const selectedPermissionMember = managedUsers.find(user => user.id === selectedPermissionMemberId);
  const filteredChatHistoryRecords = chatHistoryRecords.filter(record => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return record.user_id.toLowerCase().includes(normalizedQuery)
      || record.message.toLowerCase().includes(normalizedQuery)
      || record.role.toLowerCase().includes(normalizedQuery);
  });
  const chatHistorySessions = Array.from(
    filteredChatHistoryRecords.reduce((groups, record) => {
      const sessionId = record.user_id;
      groups.set(sessionId, [...(groups.get(sessionId) || []), record]);
      return groups;
    }, new Map<string, ChatHistoryRecord[]>())
  ).map(([sessionId, records]) => ({
    sessionId,
    records: records.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    lastMessageAt: records.reduce((latest, record) => Math.max(latest, new Date(record.created_at).getTime()), 0)
  })).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const selectedChatHistorySession = chatHistorySessions.find(session => session.sessionId === selectedChatHistorySessionId)
    || chatHistorySessions[0];
  const selectedHistoryGuest = selectedChatHistorySession?.sessionId.startsWith('public-')
    ? publicChatGuests.find(guest => `public-${guest.session_id}` === selectedChatHistorySession.sessionId)
    : undefined;

  if (authLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-sm text-slate-400">Đang kiểm tra phiên đăng nhập...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 lg:gap-8 items-stretch">
          <section className="flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 text-rose-300 text-xs font-bold uppercase tracking-wider mb-5">
              <Sparkles className="w-4 h-4" />
              Real Estate AI Marketing Agent CMS
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">Đăng nhập để quản lý CRM, tài nguyên team và AI Assistant</h1>
            <p className="text-slate-400 text-sm leading-7 max-w-2xl">
              Owner có toàn quyền. Company Admin chỉ quản lý dữ liệu của company/team. Member chỉ truy cập tài nguyên được admin client cấp phát.
            </p>
          </section>

          <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-2xl space-y-5">
            <div>
              <h2 className="text-xl font-bold text-white">Login</h2>
              <p className="text-xs text-slate-500 mt-1">Nhập tài khoản đã được cấp để truy cập CMS.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-rose-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-rose-500"
              />
            </div>

            {loginError && (
              <div className="text-xs text-rose-200 bg-rose-950/50 border border-rose-900 rounded-lg px-3 py-2">{loginError}</div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-lg transition-colors"
            >
              {authLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen min-h-0 overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 left-3 right-3 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-0 sm:bottom-6 sm:left-auto sm:right-6 sm:px-5 sm:py-4 ${
          toast.type === 'success' ? 'bg-emerald-950/95 border border-emerald-500 text-emerald-200' :
          toast.type === 'error' ? 'bg-rose-950/95 border border-rose-500 text-rose-200' :
          'bg-slate-900 border border-indigo-500 text-indigo-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
          <span className="font-medium text-sm leading-relaxed">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner Alert / Workspace Header */}
      <header className="shrink-0 border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30 px-3 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setAdminMenuOpen(true)}
            className="lg:hidden p-2 text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700"
            aria-label="Má»Ÿ menu CMS"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="p-2 bg-gradient-to-tr from-rose-600 to-amber-500 rounded-xl">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm sm:text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Real Estate AI Marketing Agent CMS
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 font-mono">MVP Production Framework v1.0 • Connected • Việt Nam</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="hidden lg:flex flex-col items-end leading-tight">
            <span className="text-xs font-bold text-slate-200">{currentUser.name}</span>
            <span className="text-[11px] text-slate-500 uppercase">
              {currentUser.role}{currentUser.company_name ? ` · ${currentUser.company_name}` : ''}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-300">
              AI Powered: <span className="text-rose-400 uppercase font-bold">{settings.ai_mode} ({settings.ai_mode === 'openai' ? settings.openai_model : settings.ollama_model})</span>
            </span>
          </div>

          <button 
            onClick={fetchAllData}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-2 text-xs font-bold text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-rose-500/60 transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {adminMenuOpen && (
          <button
            type="button"
            aria-label="ÄÃ³ng menu CMS"
            onClick={() => setAdminMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          />
        )}
        
        {/* Navigation Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 min-h-0 bg-slate-950 border-r border-slate-900 p-4 space-y-2 shrink-0 flex flex-col justify-between overflow-y-auto app-scroll transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          adminMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-600 tracking-wider uppercase">Menu chính</div>
            {[
              { id: 'dashboard', label: 'Dashboard tổng quan', icon: LayoutDashboard },
              { id: 'crm', label: 'Khách hàng CRM', icon: Users, badge: customers.length },
              { id: 'properties', label: 'Danh sách Bất động sản', icon: Home, badge: properties.length },
              { id: 'ai-content', label: 'AI Content Generator', icon: Sparkles },
              { id: 'posts', label: 'Danh sách bài đăng CMS', icon: FileText, badge: posts.length },
              { id: 'inbox', label: 'Hòm hòm inbox đa kênh', icon: MessageSquare, badge: inbox.filter(i => i.status === 'pending').length },
              { id: 'chatbot', label: 'Chatbot AI Nội bộ', icon: Bot },
              { id: 'chat-history', label: 'Lịch sử chat', icon: MessageSquare, badge: chatHistoryRecords.length },
              { id: 'automations', label: 'Automation AI Center', icon: Cpu },
              ...(canManageCmsUsers ? [{ id: 'users', label: 'User & Permission', icon: ShieldCheck, badge: managedUsers.length }] : []),
              { id: 'integrations', label: 'Tích hợp tài khoản', icon: Layers },
              { id: 'settings', label: 'Cấu hình hệ thống', icon: SettingsIcon },
            ].map(item => {
              const IconComp = item.icon;
              const isSelected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSearchQuery('');
                    setAdminMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    isSelected 
                      ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComp className={`w-4 h-4 transition-transform group-hover:scale-110 ${isSelected ? 'text-rose-500' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-400'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-900 text-center space-y-3 mt-4">
            <h4 className="text-xs font-semibold text-rose-400">Sandbox Developer</h4>
            <p className="text-2xs text-slate-400 leading-relaxed">
              Tích hợp hệ thống Ollama cục bộ qua endpoint http://localhost:11434 với các model chất lượng Llama3.1 hoặc Qwen2.5.
            </p>
            <button
              onClick={handleRunDemoAutomations}
              disabled={actionLoading === 'run-automations'}
              className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm font-medium transition-all disabled:opacity-50"
            >
              <Cpu className="w-3.5 h-3.5 text-rose-500" />
              <span>Chạy Thử Nghiệm Automation</span>
            </button>
          </div>
        </aside>

        {/* Outer Content Area */}
        <main className="flex-1 min-w-0 min-h-0 bg-slate-950/40 p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden space-y-4 sm:space-y-6 app-scroll">

          {/* Search bar inside view headers */}
          {['crm', 'properties', 'posts', 'chat-history'].includes(activeTab) && (
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

              {activeTab === 'crm' && (
                <button
                  onClick={() => setShowAddCustomerModal(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-rose-600/25 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Khách Hàng CRM</span>
                </button>
              )}

              {activeTab === 'properties' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a
                    href="/"
                    target="_blank"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-600/25 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Xem trang BĐS Public</span>
                  </a>
                  <button
                    onClick={openAddPropertyModal}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-rose-600/25 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Bất Động Sản</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
              <p className="text-slate-400 text-sm font-mono animate-pulse">Đang nạp nhanh dữ liệu thời gian thực...</p>
            </div>
          )}

          {/* Module Views */}
          {!loading && (
            <>
              {/* ==================================================== */}
              {/* TAB 1: DASHBOARD OVERVIEW */}
              {/* ==================================================== */}
              {activeTab === 'dashboard' && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Heading header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        Bảng điều khiển Tổng quan
                      </h2>
                      <p className="text-slate-400 text-sm">Cập nhật và theo dõi hiệu suất tiếp thị trong ngày.</p>
                    </div>
                    <div className="bg-rose-950/40 px-4 py-2 rounded-xl text-xs font-mono border border-rose-500/20 text-rose-300">
                      Cập nhật lúc: {new Date().toLocaleString('vi-VN')}
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Tổng số khách hàng CRM', value: dashboardData.stats.totalCustomers, icon: Users, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
                      { label: 'Lead Hot tiềm năng', value: dashboardData.stats.leads.hot, icon: Sparkles, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
                      { label: 'Bất động sản mở bán', value: dashboardData.stats.totalProperties, icon: Home, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                      { label: 'Bài quảng cáo đã tạo', value: dashboardData.stats.totalPosts, icon: FileText, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                      { label: 'Inbox chưa trả lời', value: dashboardData.stats.pendingInbox, icon: MessageSquare, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse' },
                    ].map((stat, idx) => {
                      const Icon = stat.icon;
                      return (
                        <div key={idx} className={`p-4 rounded-2xl border bg-slate-900/40 flex flex-col justify-between h-32 ${stat.color}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 tracking-wide">{stat.label}</span>
                            <Icon className="w-5 h-5 opacity-80" />
                          </div>
                          <div>
                            <div className="text-3xl font-extrabold tracking-tight text-white">{stat.value}</div>
                            <div className="text-2xs text-slate-500 mt-1 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-emerald-400" /> Dữ liệu hiện tại
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Charts and Lists */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Platform effectiveness stats */}
                    <div className="lg:col-span-7 bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white tracking-wide">Hiệu quả phễu Marketing theo Kênh</h3>
                        <span className="text-2xs text-slate-400 font-mono">Đồng bộ tự động</span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 pt-2 text-center text-xs text-slate-400 font-medium pb-2 border-b border-slate-900">
                        <div className="text-left font-semibold text-slate-300">Nền tảng</div>
                        <div>Reach (Lượt xem)</div>
                        <div>Engagement</div>
                        <div className="text-right">Lead Thu được</div>
                      </div>

                      <div className="space-y-4">
                        {dashboardData.metrics.map((metric) => {
                          const platform = metric.platform as Post['platform'];
                          const meta = DASHBOARD_PLATFORM_META[platform];
                          return (
                            <div key={metric.platform} className="space-y-1">
                              <div className="grid grid-cols-4 items-center text-xs">
                                <div className="font-bold text-slate-200">{meta.name}</div>
                                <div className="text-center font-mono text-slate-400">{metric.reach.toLocaleString('vi-VN')}</div>
                                <div className="text-center font-mono text-slate-400">{metric.engagement.toLocaleString('vi-VN')}</div>
                                <div className="text-right font-bold text-emerald-400">{metric.leads} lead</div>
                              </div>
                              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${meta.color}`}
                                  style={{ width: `${(metric.reach / maxDashboardReach) * 100}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-900 flex items-start gap-3 mt-4 text-xs text-slate-400 leading-relaxed">
                        <Cpu className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-rose-400 block mb-0.5">Tổng hợp dữ liệu marketing:</strong>
                          {topDashboardMetric.reach > 0 ? (
                            <>
                              Kênh <span className="text-rose-400 font-bold border-b border-rose-500/20">{DASHBOARD_PLATFORM_META[topDashboardMetric.platform as Post['platform']].name}</span> đang có reach cao nhất với {topDashboardMetric.reach.toLocaleString('vi-VN')} lượt xem. Số liệu được tổng hợp từ các bài đăng và lead hiện có trong hệ thống.
                            </>
                          ) : (
                            'Chưa có dữ liệu tương tác từ các bài đăng để xác định kênh hiệu quả nhất.'
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Automation triggers visual logs */}
                    <div className="lg:col-span-5 bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white tracking-wide">Nhật ký Tự Động Hóa Thực Tế</h3>
                        <span className="text-2xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">Live</span>
                      </div>

                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {automations.flatMap(a => a.logs.map(log => ({ name: a.name, log }))).slice(0, 5).map((item, idx) => (
                          <div key={idx} className="p-3 bg-slate-950/60 rounded-xl border border-slate-900 text-xs space-y-1">
                            <div className="flex items-center justify-between text-slate-500 font-mono text-2xs">
                              <span className="text-rose-400 font-semibold">{item.name}</span>
                              <span>Chúng tôi vừa chạy</span>
                            </div>
                            <p className="text-slate-300 leading-relaxed">{item.log}</p>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => setActiveTab('automations')}
                        className="w-full bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 text-xs py-2.5 rounded-xl transition-all font-semibold"
                      >
                        Mở Trung Tâm Tự Động Hóa Automation
                      </button>
                    </div>
                  </div>

                  {/* Hot leads to handle immediately table summary */}
                  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">Khách hàng cần liên hệ khẩn cấp (Lead Score &gt; 80)</h3>
                      <button onClick={() => setActiveTab('crm')} className="text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1">
                        Tất cả khách hàng <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-900 text-xs uppercase tracking-wider text-slate-500">
                            <th className="py-3 px-4">Tên khách hàng</th>
                            <th className="py-3 px-4">Nhu cầu & Vị trí</th>
                            <th className="py-3 px-4">Ngân sách</th>
                            <th className="py-3 px-4">Lead Score</th>
                            <th className="py-3 px-4">AI tóm lược tóm tắt</th>
                            <th className="py-3 px-4 text-right">Hành động khuyên dùng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {customers.filter(c => c.status === 'hot' && c.lead_score > 80).slice(0, 3).map((cust) => (
                            <tr key={cust.id} className="hover:bg-slate-900/30 transition-all">
                              <td className="py-3.5 px-4 font-bold text-white">{cust.name}</td>
                              <td className="py-3.5 px-4">
                                <span className="text-rose-400 font-semibold">{cust.property_type}</span> ở {cust.interested_area}
                              </td>
                              <td className="py-3.5 px-4 text-amber-400 font-mono font-semibold">{cust.budget} tỷ VND</td>
                              <td className="py-3.5 px-4">
                                <span className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-extrabold font-mono text-xs">
                                  {cust.lead_score} 🔥
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-xs text-slate-400 max-w-xs truncate">{cust.ai_summary}</td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => {
                                    setActiveTab('chatbot');
                                    setUserChatInput(`Đề xuất kế hoạch marketing và tóm tắt chăm sóc khách hàng ${cust.name}`);
                                  }}
                                  className="text-xs bg-slate-950 border border-slate-800 hover:border-rose-500 hover:text-white px-3 py-1.5 rounded-lg transition-all"
                                >
                                  Hỏi chatbot AI
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-white">Publish queue actions</h3>
                          <p className="text-xs text-slate-500 mt-1">Facebook va Zalo duoc uu tien. Moi thao tac ben duoi deu goi API va luu database.</p>
                        </div>
                        <span className="text-2xs text-slate-500 font-mono">{publishPosts.length} posts</span>
                      </div>

                      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                        {publishPosts.map(post => (
                          <div key={`publish-action-${post.id}`} className="border border-slate-800 rounded-lg p-4 bg-slate-950/40">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white line-clamp-1">{post.title}</div>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="uppercase text-2xs font-bold text-emerald-300">{post.platform}</span>
                                  <span className="text-2xs text-slate-500">{post.status}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(post.content)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-900 text-2xs font-bold"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePostStatusUpdate(post, 'scheduled')}
                                  disabled={actionLoading === `post-scheduled-${post.id}` || post.status === 'published'}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40 text-2xs font-bold"
                                >
                                  <Clock className="w-3 h-3" /> Schedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePostStatusUpdate(post, 'published')}
                                  disabled={actionLoading === `post-published-${post.id}` || post.status === 'published'}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 text-2xs font-bold"
                                >
                                  <Send className="w-3 h-3" /> Publish
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-white">Generated content training</h3>
                          <p className="text-xs text-slate-500 mt-1">Raw content va verified content cho Facebook/Zalo.</p>
                        </div>
                        <span className="text-2xs text-slate-500 font-mono">{priorityGeneratedContents.length} items</span>
                      </div>

                      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                        {priorityGeneratedContents.length === 0 && (
                          <div className="text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg p-4">
                            Chua co content sinh tu AI cho Facebook/Zalo. Hay generate content tu gio hang bat dong san truoc.
                          </div>
                        )}

                        {priorityGeneratedContents.map(record => (
                          <div key={record.id} className="border border-slate-800 rounded-lg p-4 bg-slate-950/40">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="uppercase text-2xs font-bold text-emerald-300">{record.channel}</span>
                                <span className={`text-2xs px-2 py-0.5 rounded-full border ${
                                  record.status === 'verified'
                                    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                                    : 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                                }`}>
                                  {record.status}
                                </span>
                              </div>
                              <span className="text-2xs text-slate-600 font-mono">{record.created_at}</span>
                            </div>
                            <div className="text-xs font-semibold text-slate-300 mb-2">{record.property_title || 'No property linked'}</div>
                            <p className="text-xs text-slate-400 whitespace-pre-line line-clamp-4 leading-relaxed">
                              {record.verified_content || record.raw_content}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => handleCopyText(record.verified_content || record.raw_content)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-900 text-2xs font-bold"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVerifyGeneratedContent(record)}
                                disabled={record.status === 'verified' || actionLoading === `verify-content-${record.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 text-2xs font-bold"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Verify
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 2: CRM CUSTOMERS MANAGEMENT */}
              {/* ==================================================== */}
              {activeTab === 'crm' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Quản lý khách hàng CRM
                      </h2>
                      <p className="text-slate-400 text-sm">Quản lý vòng đời khách hàng bất động sản và kích hoạt AI Agent phân tích hành vi.</p>
                    </div>
                  </div>

                  {/* Customer Records Table/Grid */}
                  <div className="bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-900 text-xs uppercase tracking-wider text-slate-500">
                            <th className="py-4 px-5">Tên khách hàng</th>
                            <th className="py-4 px-5">Liên hệ</th>
                            <th className="py-4 px-5">Nguồn</th>
                            <th className="py-4 px-5">Khu vực quan tâm / Budget</th>
                            <th className="py-4 px-5">Trạng thái</th>
                            <th className="py-4 px-5">Chỉ số tiềm năng & Ghi chú thực tế</th>
                            <th className="py-4 px-5 text-right">Thao tác AI Agent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {filteredCustomers.map((cust) => (
                            <tr key={cust.id} className="hover:bg-slate-900/20 transition-all even:bg-slate-900/10">
                              <td className="py-4 px-5">
                                <div className="font-bold text-white">{cust.name}</div>
                                <span className="text-xs text-slate-500 font-mono">ID: {cust.id}</span>
                              </td>
                              <td className="py-4 px-5 space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                  <Phone className="w-3 h-3 text-slate-500" /> {cust.phone}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                  <Mail className="w-3 h-3 text-slate-500" /> {cust.email || 'N/A'}
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                  cust.source === 'facebook' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' :
                                  cust.source === 'zalo' ? 'bg-sky-600/10 text-sky-400 border border-sky-500/20' :
                                  cust.source === 'tiktok' ? 'bg-pink-600/10 text-pink-400 border border-pink-500/20' :
                                  'bg-slate-900 text-slate-400'
                                }`}>
                                  {cust.source}
                                </span>
                              </td>
                              <td className="py-4 px-5 space-y-1">
                                <div className="font-bold text-slate-200">
                                  <span className="capitalize">{cust.property_type}</span> @ {cust.interested_area}
                                </div>
                                <div className="text-xs text-amber-400 font-bold font-mono">Bán kính: {cust.budget} tỷ VND</div>
                              </td>
                              <td className="py-4 px-5">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                  cust.status === 'hot' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                  cust.status === 'warm' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                  cust.status === 'new' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                  cust.status === 'closed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  'bg-slate-800 text-slate-500'
                                }`}>
                                  {cust.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-4 px-5 max-w-sm space-y-2">
                                <p className="text-xs text-slate-300 italic">“{cust.notes || 'Chưa có ghi chú.'}”</p>
                                
                                {cust.ai_summary && (
                                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-900 space-y-1.5">
                                    <span className="text-rose-400 text-2xs font-bold uppercase tracking-wider flex items-center gap-1">
                                      <Sparkles className="w-3.5 h-3.5" /> AI Tóm lược & Chỉ dẫn bán hàng
                                    </span>
                                    <p className="text-xs text-slate-400 leading-relaxed font-sans">{cust.ai_summary}</p>
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-5 text-right space-y-2">
                                <div className="flex flex-col items-end gap-1.5">
                                  <div className="text-xs font-mono text-slate-400 mb-1">
                                    Tiềm năng: <span className="font-bold text-white">{cust.lead_score} pts</span>
                                  </div>
                                  <button
                                    onClick={() => handleAICodeAnalyzeCustomer(cust.id)}
                                    disabled={actionLoading === `analyze-cust-${cust.id}`}
                                    className="text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-rose-600/20 transition-all"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{actionLoading === `analyze-cust-${cust.id}` ? "Đang chạy..." : "Phân tích AI"}</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveTab('chatbot');
                                      setUserChatInput(`Viết bài bán lô đất hợp gu khách hàng ${cust.name} dựa trên tài chính của họ.`);
                                    }}
                                    className="text-2xs text-slate-400 hover:text-rose-400 underline"
                                  >
                                    Tạo bài gửi khách
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 3: PROPERTIES DIRECTORY */}
              {/* ==================================================== */}
              {activeTab === 'properties' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Danh sách Bất động sản
                    </h2>
                    <p className="text-slate-400 text-sm">Chi tiết thông tin bất động sản, sổ đỏ, và tính năng tiếp thị tự động.</p>
                  </div>

                  <div className="rounded-2xl border border-slate-900 bg-slate-900/35 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="space-y-1">
                        <label className="block text-2xs font-semibold uppercase text-slate-500">Khoảng giá</label>
                        <select
                          value={propertyFilters.price}
                          onChange={(e) => setPropertyFilters({ ...propertyFilters, price: e.target.value })}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                        >
                          <option value="all">Tất cả giá</option>
                          <option value="under3">Dưới 3 tỷ</option>
                          <option value="3to5">3 - 5 tỷ</option>
                          <option value="5to10">5 - 10 tỷ</option>
                          <option value="over10">Trên 10 tỷ</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-2xs font-semibold uppercase text-slate-500">Khu vực / diện tích</label>
                        <select
                          value={propertyFilters.area}
                          onChange={(e) => setPropertyFilters({ ...propertyFilters, area: e.target.value })}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                        >
                          <option value="all">Tất cả diện tích</option>
                          <option value="under80">Dưới 80 m²</option>
                          <option value="80to150">80 - 150 m²</option>
                          <option value="over150">Trên 150 m²</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-2xs font-semibold uppercase text-slate-500">Loại hình</label>
                        <select
                          value={propertyFilters.type}
                          onChange={(e) => setPropertyFilters({ ...propertyFilters, type: e.target.value })}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                        >
                          <option value="all">Tất cả loại hình</option>
                          {PROPERTY_TYPE_OPTIONS.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-2xs font-semibold uppercase text-slate-500">Hình thức</label>
                        <select
                          value={propertyFilters.transactionType}
                          onChange={(e) => setPropertyFilters({ ...propertyFilters, transactionType: e.target.value })}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                        >
                          <option value="all">Bán và cho thuê</option>
                          {TRANSACTION_TYPE_OPTIONS.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-2xs font-semibold uppercase text-slate-500">Trạng thái</label>
                        <select
                          value={propertyFilters.status}
                          onChange={(e) => setPropertyFilters({ ...propertyFilters, status: e.target.value })}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                        >
                          <option value="visible">Mặc định: không hiện BĐS đã ẩn</option>
                          <option value="available">Đang bán/cho thuê</option>
                          <option value="sold">Đã bán/đã thuê</option>
                          <option value="hidden">Chỉ BĐS đã ẩn</option>
                          <option value="all">Tất cả trạng thái</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-2xs text-slate-500">
                      <span>Đang hiển thị {filteredProperties.length}/{properties.length} bất động sản.</span>
                      <button
                        type="button"
                        onClick={() => setPropertyFilters({ price: 'all', area: 'all', type: 'all', transactionType: 'all', status: 'visible' })}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-semibold text-slate-300 hover:border-slate-700"
                      >
                        Xóa bộ lọc
                      </button>
                    </div>
                  </div>

                  {/* Property list grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProperties.map((prop) => (
                      <div key={prop.id} className={`bg-slate-900/40 rounded-2xl border overflow-hidden flex flex-col justify-between hover:border-slate-800 transition-all shadow-sm hover:shadow-xl group ${
                        prop.sale_status === 'hidden'
                          ? 'border-amber-700/50 opacity-70'
                          : prop.sale_status === 'sold'
                            ? 'border-emerald-700/50 opacity-80'
                            : 'border-slate-900'
                      }`}>
                        
                        {/* Hero Image - Square Gallery */}
                        <div className="relative aspect-square bg-slate-950 overflow-hidden shrink-0 group/gallery">
                          {prop.gallery_images?.length ? (
                            <>
                              <img 
                                src={prop.gallery_images[propertyGalleryIndex[prop.id] || 0]} 
                                alt={prop.title} 
                                className="w-full h-full object-cover object-center group-hover:scale-105 transition-all duration-500 opacity-90"
                              />
                              {prop.gallery_images.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentIndex = propertyGalleryIndex[prop.id] || 0;
                                      const newIndex = currentIndex === 0 ? prop.gallery_images!.length - 1 : currentIndex - 1;
                                      setPropertyGalleryIndex({ ...propertyGalleryIndex, [prop.id]: newIndex });
                                    }}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg opacity-0 group-hover/gallery:opacity-100 transition-opacity"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentIndex = propertyGalleryIndex[prop.id] || 0;
                                      const newIndex = (currentIndex + 1) % prop.gallery_images!.length;
                                      setPropertyGalleryIndex({ ...propertyGalleryIndex, [prop.id]: newIndex });
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg opacity-0 group-hover/gallery:opacity-100 transition-opacity"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white px-2 py-1 rounded-lg text-2xs font-bold">
                                    {(propertyGalleryIndex[prop.id] || 0) + 1} / {prop.gallery_images.length}
                                  </div>
                                </>
                              )}
                            </>
                          ) : (
                            <img 
                              src={prop.images} 
                              alt={prop.title} 
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition-all duration-500 opacity-80"
                            />
                          )}
                          <div className="absolute top-4 left-4 bg-slate-950/95 border border-slate-900 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-400 capitalize">
                            {(prop.transaction_type || 'Bán')} • {prop.type}
                          </div>
                          {prop.sale_status === 'sold' && (
                            <div className="absolute top-14 left-4 bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold">
                              ĐÃ BÁN
                            </div>
                          )}
                          {prop.sale_status === 'hidden' && (
                            <div className="absolute top-14 left-4 bg-amber-600 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold">
                              ĐÃ ẨN
                            </div>
                          )}
                          <div className="absolute top-4 right-4 bg-rose-600 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold tracking-tight">
                            {prop.price} Tỷ VNĐ
                          </div>
                          
                          <div className="absolute bottom-4 left-4 bg-slate-950/80 px-2.5 py-1 rounded-lg text-2xs text-slate-300 flex items-center gap-1 border border-slate-900">
                            <MapPin className="w-3.5 h-3.5 text-rose-500" /> {prop.direction}
                          </div>
                        </div>

                        {/* Description */}
                        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div className="space-y-2">
                            <h3 className="line-clamp-2 text-md font-bold text-white leading-relaxed group-hover:text-rose-400 transition-colors">
                              {prop.title}
                            </h3>
                            <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                              📍 {prop.location}
                            </p>
                            <MarkdownContent
                              content={prop.rich_description || prop.description}
                              compact
                              className="line-clamp-3 text-xs leading-relaxed text-slate-400"
                            />
                          </div>

                          {prop.gallery_images?.length ? (
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {prop.gallery_images.map((img, idx) => (
                                <img key={idx} src={img} alt={`${prop.title} ${idx + 1}`} className="w-16 h-16 aspect-square rounded-lg object-cover object-center border border-slate-800 shrink-0" />
                              ))}
                            </div>
                          ) : null}

                          <div className="grid grid-cols-3 gap-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-900/80 text-center text-xs font-semibold">
                            <div>
                              <span className="block text-2xs text-slate-500">Diện tích</span>
                              <span className="text-slate-200">{prop.area} m²</span>
                            </div>
                            <div>
                              <span className="block text-2xs text-slate-500">Pháp lý</span>
                              <span className="text-slate-200 truncate block">{prop.legal_status}</span>
                            </div>
                            <div>
                              <span className="block text-2xs text-slate-500">Lòng đường</span>
                              <span className="text-slate-200">{prop.road_width} m</span>
                            </div>
                          </div>

                          {(prop.floor_area || prop.floors || prop.bedrooms || prop.bathrooms || prop.garage || prop.pool) && (
                            <div className="flex flex-wrap gap-1.5 text-2xs">
                              {prop.floor_area ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">Sàn {prop.floor_area} m²</span> : null}
                              {prop.floors ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">{prop.floors} tầng</span> : null}
                              {prop.bedrooms ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">{prop.bedrooms} PN</span> : null}
                              {prop.bathrooms ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">{prop.bathrooms} WC</span> : null}
                              {prop.garage ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">Gara</span> : null}
                              {prop.pool ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">Hồ bơi</span> : null}
                            </div>
                          )}

                          {/* Key Selling Points Bullet points */}
                          <div className="space-y-1">
                            <span className="block text-2xs font-semibold uppercase text-slate-500">Đặc điểm nổi trội:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {prop.selling_points.map((pt, idx) => (
                                <span key={idx} className="bg-slate-950 text-slate-400 border border-slate-900 text-2xs px-2 py-0.5 rounded-lg">
                                  ✓ {pt}
                                </span>
                              ))}
                            </div>
                          </div>

                          {prop.internal_notes && (
                            <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-3">
                              <span className="block text-2xs font-bold text-amber-400 uppercase mb-1">Ghi chú AI/Search</span>
                              <p className="text-2xs text-slate-400 leading-relaxed line-clamp-3">{prop.internal_notes}</p>
                            </div>
                          )}

                          {/* AI generated configuration buttons */}
                          <div className="pt-4 border-t border-slate-900/80 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => openEditPropertyModal(prop)}
                                className="bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Chỉnh sửa</span>
                              </button>

                              <label className="cursor-pointer bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all">
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>{actionLoading === `upload-prop-${prop.id}` ? 'Đang upload...' : 'Upload ảnh'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => handlePropertyImageUpload(prop, e.target.files)}
                                />
                              </label>

                              <button
                                type="button"
                                onClick={() => handleCopyText(buildPropertyCopyText(prop))}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy mô tả</span>
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-2xs text-slate-500 font-mono">
                              {prop.ai_posts?.facebook ? (
                                <span className="text-emerald-400 flex items-center gap-1 font-bold">✓ Đã tối ưu AI</span>
                              ) : (
                                <span className="text-slate-500 italic block">Chưa tối ưu marketing</span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleTogglePropertySold(prop)}
                              disabled={actionLoading === `sold-prop-${prop.id}`}
                              className={`border font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all ${
                                prop.sale_status === 'sold'
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/60'
                                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500/50 hover:text-emerald-300'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{prop.sale_status === 'sold' ? 'Đã bán' : 'Đánh dấu bán'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => prop.sale_status === 'hidden' ? handleRestoreProperty(prop) : handleSoftDeleteProperty(prop)}
                              disabled={actionLoading === `hide-prop-${prop.id}` || actionLoading === `restore-prop-${prop.id}`}
                              className={`border font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all ${
                                prop.sale_status === 'hidden'
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-700/50 hover:bg-amber-900/60'
                                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-amber-500/50 hover:text-amber-300'
                              }`}
                            >
                              {prop.sale_status === 'hidden' ? <RefreshCw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                              <span>{prop.sale_status === 'hidden' ? 'Khôi phục' : 'Ẩn'}</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedPropertyForAI(prop);
                                setAiGeneratingTone('sang trọng và chuyên nghiệp');
                                setActiveTab('ai-content');
                              }}
                              className="bg-slate-950 hover:bg-rose-950 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-rose-400 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Sinh Content Marketing</span>
                            </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 4: AI CONTENT GENERATOR */}
              {/* ==================================================== */}
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
                            const found = properties.find(p => p.id === e.target.value);
                            if (found) {
                              setSelectedPropertyForAI(found);
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                        >
                          <option value="">-- Click để chọn bất động sản cần truyền thông --</option>
                          {properties.map(p => (
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
              {activeTab === 'posts' && (
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

              {/* ==================================================== */}
              {/* TAB 6: INBOX MULTICHANNEL */}
              {/* ==================================================== */}
              {activeTab === 'inbox' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Hòm thư khách hàng đa kênh (Social Media Inbox)
                    </h2>
                    <p className="text-slate-400 text-sm">Giao diện tiếp quản tin nhắn Messenger, Zalo, bình luận Tiktok và Website Livechat.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Message listing column */}
                    <div className="lg:col-span-5 bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden divide-y divide-slate-900/80 max-h-[600px] overflow-y-auto">
                      <div className="p-4 bg-slate-950 font-bold text-xs uppercase tracking-wider text-slate-500">Hòm thư nhận trong ngày</div>
                      
                      {inbox.map((msg) => {
                        const isSelected = selectedInboxMessage?.id === msg.id;
                        return (
                          <div 
                            key={msg.id}
                            onClick={() => {
                              setSelectedInboxMessage(msg);
                              setResponseReplyText(msg.ai_reply_suggestion || '');
                            }}
                            className={`p-4 cursor-pointer transition-all ${
                              isSelected ? 'bg-rose-500/5 border-l-4 border-rose-500' : 'hover:bg-slate-900/30'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={msg.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=50&q=80"}
                                  className="w-8 h-8 rounded-full object-cover border border-slate-800"
                                />
                                <div>
                                  <div className="text-xs font-bold text-white leading-tight">{msg.sender_name}</div>
                                  <span className="text-2xs text-rose-400 capitalize font-mono font-bold">{msg.platform} channel</span>
                                </div>
                              </div>

                              <span className={`text-2xs px-2 py-0.5 rounded-full font-bold uppercase ${
                                msg.intent === 'hỏi giá' ? 'bg-amber-600/20 text-amber-400' :
                                msg.intent === 'thương lượng' ? 'bg-rose-600/20 text-rose-400 animate-pulse' :
                                msg.intent === 'đặt lịch xem' ? 'bg-emerald-600/20 text-emerald-400' :
                                'bg-slate-950 text-slate-500'
                              }`}>
                                {msg.intent || 'phân tích...'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                              {msg.message}
                            </p>

                            <div className="flex items-center justify-between mt-3 text-2xs font-mono text-slate-500">
                              <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span className={msg.status === 'pending' ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-500'}>
                                {msg.status === 'replied' ? '✓ Đập hộp phản hồi' : '• Cần phản hồi'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Chat dialog workspace */}
                    <div className="lg:col-span-7 bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                      {selectedInboxMessage ? (
                        <div className="space-y-4">
                          <div className="border-b border-slate-900 pb-3 flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-white text-md">Khung chat tiếp nhận: {selectedInboxMessage.sender_name}</h3>
                              <p className="text-xs text-slate-500 font-mono capitalize">Nền tảng đồng bộ: {selectedInboxMessage.platform}</p>
                            </div>
                            <button onClick={() => setSelectedInboxMessage(null)} className="text-slate-500 hover:text-slate-300 text-xs">
                              Đóng khung
                            </button>
                          </div>

                          {/* Conversation flow */}
                          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-900 max-w-md">
                              <span className="block text-2xs text-rose-400 font-semibold mb-1">Khách hàng gửi:</span>
                              <p className="text-xs text-slate-200 leading-relaxed font-medium">{selectedInboxMessage.message}</p>
                            </div>

                            {selectedInboxMessage.ai_reply_suggestion && (
                              <div className="p-3.5 bg-rose-950/20 rounded-xl border border-rose-500/20 max-w-md ml-auto">
                                <span className="block text-2xs text-rose-400 font-bold mb-1 flex items-center gap-1">
                                  <Sparkles className="w-3.5 h-3.5" /> Gợi ý AI soạn thảo tự động:
                                </span>
                                <p className="text-xs text-rose-100 whitespace-pre-line leading-relaxed italic">{selectedInboxMessage.ai_reply_suggestion}</p>
                              </div>
                            )}
                          </div>

                          {/* Quick reply typing text area */}
                          <div className="space-y-3 pt-4 border-t border-slate-900">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-400">Giao diện trả lời của Admin</span>
                              <button
                                onClick={() => handleAILiveReplySuggestion(selectedInboxMessage.id)}
                                disabled={actionLoading === `reply-sugg-${selectedInboxMessage.id}`}
                                className="text-xs bg-slate-950 hover:bg-slate-900 border border-slate-800 text-rose-400 px-3 py-1.5 rounded-lg flex items-center gap-1"
                              >
                                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                                <span>{actionLoading === `reply-sugg-${selectedInboxMessage.id}` ? "Đang gõ..." : "AI soạn hộ câu trả lời"}</span>
                              </button>
                            </div>

                            <textarea
                              rows={4}
                              value={responseReplyText}
                              onChange={(e) => setResponseReplyText(e.target.value)}
                              placeholder="Nhập nội dung phản hồi thủ công hoặc chỉnh sửa nội dung AI vừa hỗ trợ ở trên..."
                              className="w-full bg-slate-950 border border-slate-900 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                            />

                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => handleSendManualReply(selectedInboxMessage.id)}
                                disabled={actionLoading === `send-reply-${selectedInboxMessage.id}`}
                                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1 shadow-md"
                              >
                                <Check className="w-3.5 h-3.5" /> Gửi Phản Hồi Demo
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                          <MessageSquare className="w-12 h-12 text-slate-700" />
                          <p className="text-xs text-slate-500 max-w-sm">Chọn một tin nhắn bất kỳ từ danh sách bên trái để phản hồi, phân loại ý định hành vi, và sử dụng AI soạn kịch bản trả lời nhanh.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 7: CHATBOT AI INTERNAL */}
              {/* ==================================================== */}
              {activeTab === 'chatbot' && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Bot className="w-5 h-5 text-rose-500" />
                        Chatbot khách website
                      </h2>
                      <p className="text-slate-400 text-sm">
                        Chọn từng khách đã nhập họ tên/số điện thoại để theo dõi hội thoại. Bỏ tick AI để admin tự chat trực tiếp với khách.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshPublicGuestChats(selectedChatGuestId)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-rose-500/60"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Tải lại
                    </button>
                  </div>

                  <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40 lg:grid-cols-[330px_1fr]">
                    <aside className="border-b border-slate-900 bg-slate-950/70 lg:border-b-0 lg:border-r">
                      <div className="border-b border-slate-900 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Khách đã chat</div>
                        <div className="mt-1 text-sm text-slate-300">{publicChatGuests.length} khách guest</div>
                      </div>
                      <div className="max-h-[560px] overflow-y-auto p-3 app-scroll">
                        {publicChatGuests.map(guest => {
                          const selected = selectedChatGuestId === guest.session_id;
                          return (
                            <button
                              key={guest.session_id}
                              type="button"
                              onClick={() => {
                                setSelectedChatGuestId(guest.session_id);
                                setGuestReplyInput('');
                              }}
                              className={`mb-2 w-full rounded-xl border p-3 text-left transition-all ${
                                selected
                                  ? 'border-rose-500/50 bg-rose-500/10'
                                  : 'border-slate-900 bg-slate-900/50 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-bold text-white">{guest.name}</div>
                                  <div className="text-xs text-slate-500">{guest.phone}</div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold ${
                                  Boolean(guest.ai_enabled) ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
                                }`}>
                                  {Boolean(guest.ai_enabled) ? 'AI' : 'Admin'}
                                </span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{guest.last_message || 'Chưa có tin nhắn'}</p>
                              <div className="mt-2 flex justify-between text-2xs text-slate-600">
                                <span>{guest.message_count || 0} tin</span>
                                <span>{guest.last_message_at ? new Date(guest.last_message_at).toLocaleString('vi-VN') : ''}</span>
                              </div>
                            </button>
                          );
                        })}
                        {publicChatGuests.length === 0 && (
                          <div className="p-6 text-center text-xs text-slate-500">
                            Chưa có khách nào bắt đầu chat.
                          </div>
                        )}
                      </div>
                    </aside>

                    <section className="flex min-w-0 flex-col">
                      {selectedChatGuestId ? (
                        <>
                          {(() => {
                            const selectedGuest = publicChatGuests.find(guest => guest.session_id === selectedChatGuestId);
                            return (
                              <div className="flex flex-col gap-3 border-b border-slate-900 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white">{selectedGuest?.name || 'Khách guest'}</div>
                                  <div className="text-xs text-slate-500">{selectedGuest?.phone} · {selectedChatGuestId}</div>
                                </div>
                                {selectedGuest && (
                                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedGuest.ai_enabled)}
                                      onChange={() => handleToggleGuestAi(selectedGuest)}
                                      className="h-4 w-4 accent-emerald-500"
                                    />
                                    AI tự trả lời
                                  </label>
                                )}
                              </div>
                            );
                          })()}

                          <div className="flex-1 space-y-3 overflow-y-auto p-4 app-scroll">
                            {selectedGuestChatHistory.map(record => (
                              <div key={record.id} className={`flex ${record.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-6 ${
                                  record.role === 'user'
                                    ? 'rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200'
                                    : 'rounded-tr-none bg-rose-600 text-white'
                                }`}>
                                  <MarkdownContent content={record.message} compact className="break-words" />
                                  <div className={`mt-2 text-2xs ${record.role === 'user' ? 'text-slate-500' : 'text-rose-100'}`}>
                                    {record.role === 'user' ? 'Khách' : 'AI/Admin'} · {new Date(record.created_at).toLocaleString('vi-VN')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-3 border-t border-slate-900 bg-slate-950 p-4">
                            <input
                              value={guestReplyInput}
                              onChange={event => setGuestReplyInput(event.target.value)}
                              onKeyDown={event => event.key === 'Enter' && handleSendGuestReply()}
                              placeholder="Nhập tin nhắn admin gửi cho khách..."
                              className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-rose-500"
                            />
                            <button
                              type="button"
                              onClick={handleSendGuestReply}
                              disabled={!guestReplyInput.trim() || actionLoading === `guest-reply-${selectedChatGuestId}`}
                              className="rounded-xl bg-rose-600 p-3 text-white hover:bg-rose-500 disabled:opacity-50"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-slate-500">
                          Chọn một khách ở danh sách bên trái để mở hội thoại.
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              )}

              {false && activeTab === 'chatbot' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Trợ lý ảo AI Chatbot (Nội bộ doanh nghiệp)
                    </h2>
                    <p className="text-slate-400 text-sm">Hỏi đáp trực tiếp hệ thống AI nắm giữ toàn bộ cơ sở dữ liệu khách hàng CRM, rổ bất động sản và tự phát bài truyền thông.</p>
                  </div>

                  <div className="bg-slate-900/40 rounded-2xl border border-slate-900 flex flex-col h-[550px] overflow-hidden justify-between">
                    <div className="p-4 bg-slate-950 border-b border-slate-900 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Bot className="w-5 h-5 text-rose-500" />
                        <div>
                          <div className="text-xs font-bold text-white">AI Real Estate Agent Consultant</div>
                          <span className="text-2xs text-emerald-400">
                            AI mode: {settings.ai_mode} • {settings.ai_mode === 'openai' ? settings.openai_model : settings.ai_mode === 'gemini' ? 'gemini-2.5-flash' : settings.ollama_model}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {['Khách nào đang nóng nhất?', 'Mỹ Khê có căn nào bán?', 'Tóm tắt khách hàng Đỗ Ngọc Mạnh'].map((hint, idx) => (
                          <button
                            key={idx}
                            onClick={() => setUserChatInput(hint)}
                            className="bg-slate-900 text-slate-400 border border-slate-800 text-2xs px-2.5 py-1 rounded-lg hover:border-rose-500 hover:text-white transition-all"
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dialog Container */}
                    <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[400px]">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`p-3.5 rounded-2xl max-w-xl text-xs space-y-1 ${
                            msg.role === 'user' 
                              ? 'bg-rose-600 text-white ml-12 rounded-tr-none' 
                              : 'bg-slate-950/80 border border-slate-900 text-slate-200 mr-12 rounded-tl-none whitespace-pre-wrap leading-relaxed'
                          }`}>
                            <p>{msg.content}</p>
                            <span className="block text-3xs text-slate-400 font-mono text-right pt-1">{msg.timestamp}</span>
                          </div>
                        </div>
                      ))}

                      {actionLoading === 'chatbot-chat' && (
                        <div className="flex justify-start">
                          <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 text-slate-400 text-xs flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping delay-100"></span>
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping delay-200"></span>
                            <span>AI Agent đang phân tích database dữ liệu thực tế...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sender Console */}
                    <div className="p-4 bg-slate-950 border-t border-slate-900/80 flex items-center gap-3">
                      <input
                        type="text"
                        value={userChatInput}
                        onChange={(e) => setUserChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendChatbotMessage()}
                        placeholder="Hỏi về khách hàng nóng nhất, gợi ý viết bài bán đất, tóm lược chiến dịch..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      />
                      <button
                        onClick={handleSendChatbotMessage}
                        disabled={!userChatInput.trim() || actionLoading === 'chatbot-chat'}
                        className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl p-3 shadow-md border border-rose-500 transition-all shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                </div>
              )}

              {activeTab === 'chat-history' && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-rose-500" />
                        Lịch sử trò chuyện
                      </h2>
                      <p className="text-slate-400 text-sm">
                        Theo dõi toàn bộ hội thoại đã lưu từ chatbot public và chatbot nội bộ CMS.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fetchAllData}
                      disabled={loading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-rose-500/60 disabled:opacity-50 sm:w-auto"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      Tải lại lịch sử
                    </button>
                  </div>

                  <div className="grid overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40 lg:min-h-[620px] lg:grid-cols-[330px_1fr]">
                    <aside className="border-b border-slate-900 bg-slate-950/70 lg:border-b-0 lg:border-r">
                      <div className="border-b border-slate-900 p-3 sm:p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">User/session đã chat</div>
                        <div className="mt-1 text-sm text-slate-300">{chatHistorySessions.length} hội thoại</div>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-2 app-scroll sm:max-h-80 sm:p-3 lg:max-h-[560px]">
                        {chatHistorySessions.map(session => {
                          const isPublicSession = session.sessionId.startsWith('public-');
                          const lastMessage = session.records[session.records.length - 1];
                          const selected = selectedChatHistorySession?.sessionId === session.sessionId;
                          return (
                            <button
                              key={session.sessionId}
                              type="button"
                              onClick={() => {
                                setSelectedChatHistorySessionId(session.sessionId);
                                setGuestReplyInput('');
                              }}
                              className={`mb-2 w-full rounded-xl border p-2.5 text-left transition-all sm:p-3 ${
                                selected ? 'border-rose-500/50 bg-rose-500/10' : 'border-slate-900 bg-slate-900/50 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${
                                  isPublicSession ? 'bg-emerald-500/10 text-emerald-300' : 'bg-indigo-500/10 text-indigo-300'
                                }`}>
                                  {isPublicSession ? 'Public' : 'CMS'}
                                </span>
                                <span className="text-2xs text-slate-600">{session.records.length} tin</span>
                              </div>
                              <div className="mt-2 truncate text-[11px] font-mono text-slate-300 sm:text-xs">{session.sessionId}</div>
                              <div className="mt-2 text-2xs text-slate-600">
                                {lastMessage ? new Date(lastMessage.created_at).toLocaleString('vi-VN') : ''}
                              </div>
                            </button>
                          );
                        })}
                        {chatHistorySessions.length === 0 && (
                          <div className="p-6 text-center text-xs text-slate-500">Chưa có lịch sử chat phù hợp.</div>
                        )}
                      </div>
                    </aside>

                    <section className="flex min-h-[430px] min-w-0 flex-col border-t border-slate-900 lg:min-h-0 lg:border-t-0">
                      {selectedChatHistorySession ? (
                        <>
                          <div className="flex flex-col gap-2 border-b border-slate-900 bg-slate-950 px-3 py-3 sm:px-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white">
                                {selectedChatHistorySession.sessionId.startsWith('public-') ? 'Public website' : 'CMS nội bộ'}
                              </div>
                              <div className="truncate text-xs font-mono text-slate-500">{selectedChatHistorySession.sessionId}</div>
                            </div>
                            <div className="text-xs text-slate-500">
                              {selectedChatHistorySession.records.length} tin nhắn
                            </div>
                          </div>

                          {selectedHistoryGuest && (
                            <div className="border-b border-slate-900 bg-slate-950/70 px-3 py-2 sm:px-4">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedHistoryGuest.ai_enabled)}
                                  onChange={() => handleToggleGuestAi(selectedHistoryGuest)}
                                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
                                />
                                AI tự trả lời
                              </label>
                            </div>
                          )}

                          <div className="h-[420px] space-y-3 overflow-y-auto p-3 app-scroll sm:h-[520px] sm:p-4 lg:h-[560px]">
                            {selectedChatHistorySession.records.map(record => (
                              <div key={record.id} className={`flex ${record.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6 sm:max-w-3xl sm:px-4 sm:py-3 ${
                                  record.role === 'user'
                                    ? 'rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200'
                                    : 'rounded-tr-none bg-rose-600 text-white'
                                }`}>
                                  <MarkdownContent content={record.message} compact className="break-words" />
                                  <div className={`mt-2 text-2xs ${record.role === 'user' ? 'text-slate-500' : 'text-rose-100'}`}>
                                    {record.role === 'user' ? 'Khách/User' : 'AI/Admin'} · {new Date(record.created_at).toLocaleString('vi-VN')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {selectedHistoryGuest && (
                            <div className="border-t border-slate-900 bg-slate-950 p-3 sm:p-4">
                              <div className="mb-2 text-2xs text-slate-500">
                                Gửi tin tại đây sẽ tự chuyển phiên này sang chế độ admin trả lời.
                              </div>
                              <div className="flex gap-2 sm:gap-3">
                                <input
                                  value={guestReplyInput}
                                  onChange={event => setGuestReplyInput(event.target.value)}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      handleSendHistoryGuestReply();
                                    }
                                  }}
                                  placeholder="Nhập tin nhắn admin gửi cho khách..."
                                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-rose-500 sm:px-4 sm:py-3"
                                />
                                <button
                                  type="button"
                                  onClick={handleSendHistoryGuestReply}
                                  disabled={!guestReplyInput.trim() || actionLoading === `guest-reply-${selectedHistoryGuest.session_id}`}
                                  className="rounded-xl bg-rose-600 px-3 py-2.5 text-white hover:bg-rose-500 disabled:opacity-50 sm:px-4 sm:py-3"
                                >
                                  <Send className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-slate-500">
                          Chọn một user/session bên trái để xem lịch sử chat.
                        </div>
                      )}
                    </section>
                  </div>

                  <div className="hidden">
                    {chatHistorySessions.map(session => {
                      const isPublicSession = session.sessionId.startsWith('public-');
                      const lastMessage = session.records[session.records.length - 1];
                      return (
                        <section key={session.sessionId} className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40">
                          <div className="flex flex-col gap-2 border-b border-slate-900 bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-2xs font-bold uppercase ${
                                  isPublicSession ? 'bg-emerald-500/10 text-emerald-300' : 'bg-indigo-500/10 text-indigo-300'
                                }`}>
                                  {isPublicSession ? 'Public website' : 'CMS nội bộ'}
                                </span>
                                <span className="text-xs font-mono text-slate-500">{session.sessionId}</span>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-400">
                                {lastMessage?.message || 'Chưa có nội dung'}
                              </p>
                            </div>
                            <div className="text-xs text-slate-500">
                              {session.records.length} tin nhắn · {lastMessage ? new Date(lastMessage.created_at).toLocaleString('vi-VN') : ''}
                            </div>
                          </div>

                          <div className="max-h-[520px] space-y-3 overflow-y-auto p-4 app-scroll">
                            {session.records.map(record => (
                              <div key={record.id} className={`flex ${record.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-6 ${
                                  record.role === 'user'
                                    ? 'rounded-tr-none bg-rose-600 text-white'
                                    : 'rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200'
                                }`}>
                                  <MarkdownContent content={record.message} compact className="break-words" />
                                  <div className={`mt-2 text-2xs ${record.role === 'user' ? 'text-rose-100' : 'text-slate-500'}`}>
                                    {record.role === 'user' ? 'Khách/User' : 'AI'} · {new Date(record.created_at).toLocaleString('vi-VN')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}

                    {chatHistorySessions.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
                        Chưa có lịch sử chat phù hợp với bộ lọc hiện tại.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 8: AUTOMATION AI CENTER */}
              {/* ==================================================== */}
              {activeTab === 'automations' && (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Trung tâm Tự Động Hóa AI Automation Center
                      </h2>
                      <p className="text-slate-400 text-sm">Thiết lập các workflow sự kiện tự động kích hoạt AI xử lý thông tin.</p>
                    </div>

                    <button
                      onClick={handleRunDemoAutomations}
                      disabled={actionLoading === 'run-automations'}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md"
                    >
                      <Play className="w-3.5 h-3.5" /> Chạy thử toàn diện (Simulate)
                    </button>
                  </div>

                  {/* Automation Tasks Grid visual */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {automations.map((auto) => (
                      <div key={auto.id} className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between hover:border-slate-800 transition-all space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold text-white text-sm">{auto.name}</h3>
                              <span className="text-2xs text-rose-400 font-mono">Trigger: {auto.trigger_event}</span>
                            </div>

                            <button
                              onClick={() => handleToggleAutomation(auto.id)}
                              className={`px-3 py-1.5 rounded-lg text-2xs font-extrabold transition-all border ${
                                auto.status === 'active' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-slate-950 text-slate-500 border-slate-900'
                              }`}
                            >
                              {auto.status === 'active' ? '● RUNNING' : '○ PAUSED'}
                            </button>
                          </div>

                          <p className="text-xs text-slate-400 leading-relaxed font-sans">{auto.action_description}</p>
                        </div>

                        {/* Executed count */}
                        <div className="flex justify-between text-2xs text-slate-500 border-t border-slate-900/85 pt-3">
                          <span>Chạy được: <strong>{auto.run_count} lần</strong></span>
                          <span>Đồng bộ: {auto.last_run ? new Date(auto.last_run).toLocaleTimeString() : 'Chưa chạy'}</span>
                        </div>

                        {/* Recent log snippet view */}
                        {auto.logs && auto.logs.length > 0 && (
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-900/80 font-mono text-3xs text-slate-400 space-y-1 overflow-y-auto max-h-24">
                            <span className="text-slate-500 block">NHẬT KÝ LIVE TRUY VẤN:</span>
                            {auto.logs.map((log, lidx) => (
                              <p key={lidx}>{log}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 9: USER & PERMISSION MANAGEMENT */}
              {/* ==================================================== */}
              {activeTab === 'users' && canManageCmsUsers && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-rose-500" />
                      User & Permission
                    </h2>
                    <p className="text-slate-400 text-sm">
                      Owner quản lý toàn bộ user. Company admin chỉ tạo member và cấp quyền trong company/team của mình.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
                    <form onSubmit={handleCreateUser} className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                      <div className="flex items-center gap-2 text-white font-bold text-sm">
                        <UserPlus className="w-4 h-4 text-rose-400" />
                        Tạo user mới
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400">Tên</label>
                        <input
                          value={newUserForm.name}
                          onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                          placeholder="Sale Member"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400">Email</label>
                        <input
                          type="email"
                          value={newUserForm.email}
                          onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                          placeholder="member@example.com"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400">Password</label>
                        <input
                          type="password"
                          value={newUserForm.password}
                          onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                          placeholder="Mật khẩu đăng nhập"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-400">Role</label>
                          <select
                            value={currentUser.role === 'company' ? 'member' : newUserForm.role}
                            disabled={currentUser.role === 'company'}
                            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500 disabled:opacity-50"
                          >
                            {currentUser.role === 'owner' && <option value="owner">Owner</option>}
                            {currentUser.role === 'owner' && <option value="company">Company Admin</option>}
                            <option value="member">Member</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-400">Company</label>
                          <input
                            value={currentUser.role === 'company' ? (currentUser.company_id || '') : newUserForm.company_id}
                            disabled={currentUser.role === 'company'}
                            onChange={(e) => setNewUserForm({ ...newUserForm, company_id: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={actionLoading === 'create-user'}
                        className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-3 rounded-xl transition-all"
                      >
                        {actionLoading === 'create-user' ? 'Đang tạo...' : 'Tạo user'}
                      </button>
                    </form>

                    <div className="bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden">
                      <div className="p-4 border-b border-slate-900 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white">Danh sách user</h3>
                          <p className="text-xs text-slate-500">{managedUsers.length} user trong phạm vi quản lý</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs uppercase text-slate-500 border-b border-slate-900">
                            <tr>
                              <th className="px-5 py-3">User</th>
                              <th className="px-5 py-3">Role</th>
                              <th className="px-5 py-3">Company</th>
                              <th className="px-5 py-3">Status</th>
                              <th className="px-5 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900">
                            {managedUsers.map(user => (
                              <tr key={user.id} className="hover:bg-slate-900/30">
                                <td className="px-5 py-4">
                                  <div className="font-bold text-white">{user.name}</div>
                                  <div className="text-2xs text-slate-500 font-mono">{user.email}</div>
                                </td>
                                <td className="px-5 py-4">
                                  <span className="text-xs font-bold uppercase text-slate-300">{user.role}</span>
                                </td>
                                <td className="px-5 py-4 text-xs text-slate-400">{user.company_id || 'system'}</td>
                                <td className="px-5 py-4">
                                  <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase border ${
                                    user.status === 'active'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-slate-800 text-slate-500 border-slate-700'
                                  }`}>
                                    {user.status}
                                  </span>
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(user)}
                                    disabled={user.id === currentUser.id || actionLoading === `user-status-${user.id}`}
                                    className="text-xs font-bold text-rose-400 hover:text-rose-300 disabled:opacity-40"
                                  >
                                    {user.status === 'active' ? 'Disable' : 'Enable'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-white">Cấp quyền tài nguyên cho Member</h3>
                        <p className="text-xs text-slate-500">Member chỉ access được tài nguyên có tick trong danh sách này.</p>
                      </div>
                      <select
                        value={selectedPermissionMemberId}
                        onChange={(e) => setSelectedPermissionMemberId(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                      >
                        <option value="">Chọn member</option>
                        {managedMembers.map(member => (
                          <option key={member.id} value={member.id}>{member.name} - {member.email}</option>
                        ))}
                      </select>
                    </div>

                    {selectedPermissionMember ? (
                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        {[
                          { key: 'properties' as const, title: 'Danh sách BĐS', items: properties },
                          { key: 'customers' as const, title: 'Khách hàng', items: customers },
                          { key: 'posts' as const, title: 'Bài đăng', items: posts }
                        ].map(section => (
                          <div key={section.key} className="bg-slate-950/60 border border-slate-900 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-900">
                              <div className="text-xs font-bold text-white">{section.title}</div>
                              <div className="text-2xs text-slate-500">
                                {section.items.filter(item => (item.assigned_member_ids || []).includes(selectedPermissionMember.id)).length}/{section.items.length} đã cấp
                              </div>
                            </div>
                            <div className="max-h-80 overflow-y-auto app-scroll divide-y divide-slate-900">
                              {section.items.map(item => {
                                const checked = (item.assigned_member_ids || []).includes(selectedPermissionMember.id);
                                const label = 'title' in item ? item.title : item.name;
                                return (
                                  <label key={item.id} className="flex items-start gap-3 px-4 py-3 text-xs cursor-pointer hover:bg-slate-900/50">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleMemberAssignment(section.key, item, selectedPermissionMember.id)}
                                      disabled={actionLoading === `assign-${section.key}-${item.id}`}
                                      className="mt-0.5 accent-rose-600"
                                    />
                                    <span>
                                      <span className="block font-semibold text-slate-200">{label}</span>
                                      <span className="block text-2xs text-slate-500">{item.company_id || 'no-company'}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
                        Chọn một member active để bắt đầu cấp quyền.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 9: INTEGRATIONS ACCOUNT */}
              {/* ==================================================== */}
              {activeTab === 'integrations' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Tích hợp kênh mạng xã hội & Tài khoản CMS
                    </h2>
                    <p className="text-slate-400 text-sm">Kiểm soát trạng thái kết nối cổng API của các fanpage và tài khoản liên kết.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {channels.map((chan, idx) => (
                      <div key={idx} className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between hover:border-slate-800 transition-all space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              chan.platform === 'facebook' ? 'bg-blue-600 text-white' :
                              chan.platform === 'zalo' ? 'bg-sky-500 text-white' :
                              chan.platform === 'tiktok' ? 'bg-white text-black' :
                              'bg-rose-600 text-white'
                            }`}>
                              {chan.platform[0].toUpperCase()}
                            </span>
                            <div>
                              <h3 className="font-bold text-white text-xs leading-none">{chan.name}</h3>
                              <span className="text-3xs text-slate-500 capitalize">{chan.platform} API Client</span>
                            </div>
                          </div>

                          <span className={`px-2.5 py-1 rounded-full text-3xs font-black tracking-tight ${
                            chan.connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-950 text-slate-500 border-transparent'
                          }`}>
                            {chan.connected ? "CONNECTED" : "DISCONNECTED"}
                          </span>
                        </div>

                        {/* Stats if connected */}
                        {chan.connected && (
                          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-900 text-center text-xs">
                            <div>
                              <span className="block text-3xs text-slate-505">Tin nhắn nhận</span>
                              <span className="font-bold text-white">{chan.messages_count} messages</span>
                            </div>
                            <div>
                              <span className="block text-3xs text-slate-505">Bình luận</span>
                              <span className="font-bold text-white">{chan.comments_count} comments</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-3xs text-slate-500">
                          <span>Quét lần cuối: {chan.last_sync}</span>
                          <button type="button" className="text-rose-400 hover:underline">Đã lưu cổng</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* API integration instructions warning */}
                  <div className="bg-slate-900/20 p-5 rounded-2xl border border-slate-900 space-y-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500" /> Hướng dẫn tích hợp cổng API thật (Prod Sync)
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                      Hệ thống đang cấu hình mock API dạng demo sandbox chất lượng. Để đấu nối sản phẩm thật với Facebook Graph API, Zalo OA Webhook hay TikTok Marketing, bạn chỉ cần phát sinh cổng redirect OAuth, cấu hình Access Token gối đầu của doanh nghiệp trong trang Cài đặt, và hướng sự kiện webhook về địa chỉ của API Server.
                    </p>
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 10: CONFIG SETTINGS */}
              {/* ==================================================== */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Cổng cấu hình hệ thống AI Agent
                    </h2>
                    <p className="text-slate-400 text-sm">Chuyển đổi phương thức xử lý AI thông minh qua Gemini API hoặc Ollama local chạy cục bộ.</p>
                  </div>

                  <form onSubmit={handleSaveSettings} className="bg-slate-900/40 p-6 rounded-2xl border border-slate-900 space-y-6 max-w-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">Chế độ vận hành AI chính</label>
                        <select
                          value={settings.ai_mode}
                          onChange={(e) => setSettings({ ...settings, ai_mode: e.target.value as AppSettings['ai_mode'] })}
                          className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        >
                          <option value="auto">Auto: Ollama local, fallback ChatGPT</option>
                          <option value="ollama">Ollama Local API Client</option>
                          <option value="openai">OpenAI / ChatGPT API</option>
                          <option value="gemini">Google Gemini API</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">Giọng văn Agent định chuẩn Việt Nam</label>
                        <input
                          type="text"
                          value={settings.agent_tone}
                          onChange={(e) => setSettings({ ...settings, agent_tone: e.target.value })}
                          placeholder="Mặc định: sang trọng và chuyên nghiệp"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">Ollama API Endpoint (Nếu chọn Ollama)</label>
                        <input
                          type="text"
                          value={settings.ollama_endpoint}
                          onChange={(e) => setSettings({ ...settings, ollama_endpoint: e.target.value })}
                          placeholder="Mặc định: http://localhost:11434"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">Default Model Target (Ollama)</label>
                        <input
                          type="text"
                          value={settings.ollama_model}
                          onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                          placeholder="Mặc định: qwen3:8b"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">OpenAI / ChatGPT Model Fallback</label>
                        <input
                          type="text"
                          value={settings.openai_model}
                          onChange={(e) => setSettings({ ...settings, openai_model: e.target.value })}
                          placeholder="Mặc định: gpt-5-mini"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                    </div>

                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-900/80 text-xs text-slate-400 leading-relaxed space-y-1.5">
                      <strong className="text-rose-400 block font-bold">LỜI KHUYÊN DÀNH CHO DEVELOPERS:</strong>
                      <p>Hệ thống tự động đồng bộ hóa cấu hình về file <span className="text-white font-mono font-bold">db.json</span> vĩnh viễn khóa gối đầu ở server side.</p>
                      <p>Sử dụng phím Settings Secrets ở ngoài thanh bên AI Studio để ghi đè <span className="text-white font-mono font-bold">GEMINI_API_KEY</span> chính xác khi chạy production.</p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-900">
                      <button
                        type="submit"
                        disabled={actionLoading === 'save-settings'}
                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md transition-all"
                      >
                        {actionLoading === 'save-settings' ? 'Đang lưu thiết lập...' : 'Cập nhật thiết lập'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

            </>
          )}

        </main>
      </div>

      {/* ==================================================== */}
      {/* MODAL WORKSPACES */}
      {/* ==================================================== */}

      {/* Modal Add Customer */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 max-w-2xl w-full rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                <Users className="w-5 h-5 text-rose-500" /> Thêm khách hàng CRM mới
              </h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Họ và tên tên khách</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số điện thoại</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    placeholder="e.g. 0905xxxxx"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Địa chỉ Email</label>
                  <input
                    type="email"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    placeholder="optional@gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Kênh tìm đến (Source)</label>
                  <select
                    value={newCustomerForm.source}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    <option value="facebook">Facebook Ads/Page</option>
                    <option value="zalo">Zalo OA/Inbox</option>
                    <option value="tiktok">TikTok Video Comments</option>
                    <option value="website">Website Form/Chat</option>
                    <option value="referral">Môi giới / Giới thiệu</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Ngân sách tài chính tối đa (Tỷ VND)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newCustomerForm.budget}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, budget: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Khu vực địa lý chăm sóc</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.interested_area}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, interested_area: e.target.value })}
                    placeholder="e.g. Hòa Xuân, Cẩm Lệ"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Loại hình sản phẩm quan tâm</label>
                  <select
                    value={newCustomerForm.property_type}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, property_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  >
                    {PROPERTY_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Mức độ phân khúc</label>
                  <select
                    value={newCustomerForm.status}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    <option value="new">NEW (Khách mới tinh hỏi thăm)</option>
                    <option value="warm">WARM (Có nhu cầu, đang phân vân)</option>
                    <option value="hot">HOT (Thiện chí cọc, tiền sẵn sàng)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-2xs font-semibold text-slate-400">Ghi chú sâu về nhu cầu cụ thể</label>
                <textarea
                  rows={3}
                  value={newCustomerForm.notes}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, notes: e.target.value })}
                  placeholder="Khách cần hướng Đông Nam, lòng đường trên 7m5..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="bg-slate-950 hover:bg-slate-850 text-slate-400 text-xs px-4 py-2 rounded-xl border border-slate-800"
                >
                  Bỏ qua
                </button>
                <button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-rose-600/10"
                >
                  Tạo khách hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Property */}
      {showAddPropertyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 max-w-2xl w-full rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                {editingProperty ? <Edit className="w-5 h-5 text-rose-500" /> : <Home className="w-5 h-5 text-rose-500" />}
                {editingProperty ? 'Chỉnh sửa bất động sản' : 'Thêm bất động sản mới lên kệ'}
              </h3>
              <button onClick={closePropertyModal} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProperty} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Tiêu đề bất động sản</label>
                  <input
                    type="text"
                    required
                    value={newPropertyForm.title}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, title: e.target.value })}
                    placeholder="Bán Lô Đất Góc Hòa Xuân"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Phân khúc / Chủng loại</label>
                  <select
                    value={newPropertyForm.type}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {PROPERTY_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Hình thức</label>
                  <select
                    value={newPropertyForm.transaction_type}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, transaction_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {TRANSACTION_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Vị trí địa chỉ chính xác</label>
                  <input
                    type="text"
                    required
                    value={newPropertyForm.location}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, location: e.target.value })}
                    placeholder="Võ Chí Công, Hải Châu, Đà Nẵng"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Giá trị / giá thuê (Tỷ đồng)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newPropertyForm.price}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, price: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Diện tích đất / căn hộ (m2)</label>
                  <input
                    type="number"
                    required
                    value={newPropertyForm.area}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, area: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Diện tích sàn (m2)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={newPropertyForm.floor_area}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, floor_area: e.target.value })}
                    placeholder="Bỏ trống nếu không áp dụng"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Pháp lý hiện hành</label>
                  <select
                    required
                    value={newPropertyForm.legal_status}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, legal_status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {LEGAL_STATUS_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Hướng</label>
                  <select
                    value={newPropertyForm.direction}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, direction: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {DIRECTION_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Lòng đường rộng bao nhiêu (mét)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={newPropertyForm.road_width}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, road_width: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số tầng</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newPropertyForm.floors}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, floors: e.target.value })}
                    placeholder="Bỏ trống nếu là đất"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số phòng ngủ</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newPropertyForm.bedrooms}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, bedrooms: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số phòng tắm</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newPropertyForm.bathrooms}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, bathrooms: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="block text-2xs font-semibold text-slate-400">Công năng phụ</label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={newPropertyForm.garage}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, garage: e.target.checked })}
                        className="h-4 w-4 accent-rose-600"
                      />
                      Gara
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={newPropertyForm.pool}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, pool: e.target.checked })}
                        className="h-4 w-4 accent-rose-600"
                      />
                      Hồ bơi
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-slate-400">Mô tả Markdown để copy nhanh</label>
                    <p className="mt-1 text-2xs text-slate-500">Dùng toolbar để định dạng và chèn icon. Nội dung copy giữ nguyên icon và Markdown.</p>
                  </div>
                </div>
                <MarkdownEditor
                  value={newPropertyForm.rich_description}
                  onChange={(richDescription) => setNewPropertyForm({ ...newPropertyForm, rich_description: richDescription })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Upload ảnh lưu trữ</label>
                  <p className="text-2xs text-slate-500">Ảnh sẽ được tự động resize tối đa 1280px và nén trước khi lưu.</p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (e) => {
                      const uploaded = await readImageFiles(e.target.files);
                      setNewPropertyForm({
                        ...newPropertyForm,
                        images: uploaded[0] || newPropertyForm.images,
                        gallery_images: [...newPropertyForm.gallery_images, ...uploaded].slice(0, 8)
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-200"
                  />
                  {newPropertyForm.gallery_images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pt-2">
                      {newPropertyForm.gallery_images.map((img, idx) => (
                        <div key={idx} className="relative shrink-0">
                          <img src={img} alt={`Upload ${idx + 1}`} className="w-14 h-14 rounded-lg object-cover border border-slate-800" />
                          <button
                            type="button"
                            onClick={() => {
                              const galleryImages = newPropertyForm.gallery_images.filter((_, imageIndex) => imageIndex !== idx);
                              setNewPropertyForm({
                                ...newPropertyForm,
                                gallery_images: galleryImages,
                                images: galleryImages[0] || ''
                              });
                            }}
                            className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-1 text-white shadow"
                            aria-label="Xóa ảnh"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Trạng thái bán hàng</label>
                  <select
                    value={newPropertyForm.sale_status}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, sale_status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {PROPERTY_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-2xs font-semibold text-slate-400">Điểm nhấn bán hàng (Mỗi dòng một điểm)</label>
                <textarea
                  rows={2}
                  value={newPropertyForm.selling_points}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, selling_points: e.target.value })}
                  placeholder="View trực diện bờ sông\nHạ tầng điện ngầm đồng bộ\nĐầu tư sinh lời cao..."
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl p-3"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-2xs font-semibold text-slate-400">Ghi chú bổ sung cho AI/Search</label>
                <textarea
                  rows={3}
                  value={newPropertyForm.internal_notes}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, internal_notes: e.target.value })}
                  placeholder="VD: chủ cần bán nhanh, thương lượng sâu, phù hợp khách đầu tư giữ tiền, ưu tiên khách có sẵn tiền..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closePropertyModal}
                  className="bg-slate-950 hover:bg-slate-850 text-slate-400 text-xs px-4 py-2 rounded-xl border border-slate-800"
                >
                  Bỏ qua
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'add-property' || actionLoading === `edit-prop-${editingProperty?.id}`}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-rose-600/10"
                >
                  {actionLoading === 'add-property' || actionLoading === `edit-prop-${editingProperty?.id}`
                    ? 'Đang lưu...'
                    : editingProperty ? 'Lưu thay đổi' : 'Thêm mới BĐS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
