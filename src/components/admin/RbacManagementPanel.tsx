import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck,
  Users,
  Crown,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Search,
  Filter,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  Check,
  Calendar,
  Lock,
  UserCheck,
  UserX,
  CheckSquare,
  Square,
  Sliders,
  Building2,
  Bot,
} from 'lucide-react';
import { AuthUser } from '../../types';
import {
  getTeamMembers,
  updateTeamMemberStatus,
  getRbacMatrix,
  updateRbacMatrix,
  getEntitlements,
  createEntitlement,
  deleteEntitlement,
  type TeamMemberItem,
  type RbacMatrixRule,
  type EntitlementItem,
} from '../../services/api';

export interface MatrixRoleDef {
  key: string;
  label: string;
  subLabel: string;
  badgeClass: string;
  defaultActiveScope: 'all' | 'team' | 'own';
}

export const MATRIX_ROLES: MatrixRoleDef[] = [
  {
    key: 'super_admin',
    label: 'Super Admin',
    subLabel: 'Quản trị tối cao',
    badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/60',
    defaultActiveScope: 'all',
  },
  {
    key: 'team_lead',
    label: 'Trưởng nhóm',
    subLabel: 'Team Leader',
    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
    defaultActiveScope: 'team',
  },
  {
    key: 'member',
    label: 'Thành viên Team',
    subLabel: 'Sales / Môi giới',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
    defaultActiveScope: 'own',
  },
  {
    key: 'independent',
    label: 'Môi giới Độc lập',
    subLabel: 'Chuyên viên ngoài',
    badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800/60',
    defaultActiveScope: 'own',
  },
  {
    key: 'pending_member',
    label: 'Chờ duyệt',
    subLabel: 'Chưa kích hoạt',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
    defaultActiveScope: 'own',
  },
];

export interface MatrixPermissionItem {
  key: string;
  label: string;
  description: string;
  category: string;
  premiumOnly?: boolean;
}

export const MATRIX_CATEGORIES = [
  { id: 'all', label: 'Tất cả module' },
  { id: 'core', label: 'Tổng quan & Điều hành' },
  { id: 'property', label: 'Bất động sản & Dự án' },
  { id: 'crm', label: 'Khách hàng & Bán hàng (CRM)' },
  { id: 'ai', label: 'AI Marketing & Nội dung' },
  { id: 'agent', label: 'AI Employee & Desktop Agent' },
  { id: 'team', label: 'Đội ngũ & Nhân sự' },
  { id: 'system', label: 'Cấu hình & Quản trị Hệ thống' },
];

export const MATRIX_PERMISSIONS: MatrixPermissionItem[] = [
  // core
  { key: 'dashboard', label: 'Xem Dashboard & Chỉ số KPI', description: 'Xem tổng quan báo cáo doanh thu, tiến độ và chỉ số điều hành', category: 'core' },
  { key: 'lead.intel', label: 'Lead Intelligence & Phân tích', description: 'Xem bản đồ nhiệt khách hàng, xu hướng tìm kiếm và dự báo', category: 'core', premiumOnly: true },

  // property
  { key: 'property.read', label: 'Xem kho Bất động sản', description: 'Tra cứu danh sách sản phẩm, căn hộ, nhà phố, dự án đang bán', category: 'property' },
  { key: 'property.write', label: 'Thêm & Chỉnh sửa BĐS', description: 'Đăng tin sản phẩm mới, cập nhật giá bán, hình ảnh và pháp lý', category: 'property' },
  { key: 'property.distribute', label: 'Phân phối & Tiếp thị BĐS', description: 'Cấp quyền phân phối rổ hàng độc quyền cho sales và CTV', category: 'property' },
  { key: 'projects.admin', label: 'Quản trị Dự án', description: 'Quản lý danh mục dự án, chủ đầu tư và chính sách bán hàng', category: 'property' },

  // crm
  { key: 'crm', label: 'Quản lý Khách hàng (CRM)', description: 'Xem và chăm sóc danh sách khách hàng, nhật ký tương tác, pipeline', category: 'crm' },
  { key: 'investor_leads', label: 'Tiếp cận Investor Leads', description: 'Nhận data khách đầu tư VIP tự động từ hệ thống AI', category: 'crm', premiumOnly: true },
  { key: 'fb_inbox', label: 'Hộp thư Đa kênh (FB/Zalo)', description: 'Chat và phản hồi tin nhắn khách hàng đa nền tảng tập trung', category: 'crm' },
  { key: 'website_chat', label: 'Chat khách Website Trực tuyến', description: 'Tiếp nhận cuộc trò chuyện trực tiếp từ khách đang duyệt website', category: 'crm' },
  { key: 'appointments.manage', label: 'Lịch hẹn & Dẫn khách xem nhà', description: 'Lên lịch hẹn xem nhà, nhắc hẹn tự động qua SMS/Zalo', category: 'crm' },

  // ai
  { key: 'ai_content.admin', label: 'AI Content Generator', description: 'Tự động tạo bài viết SEO, kịch bản video và bài đăng mạng xã hội', category: 'ai', premiumOnly: true },
  { key: 'automation.admin', label: 'Automation AI Center', description: 'Thiết lập các kịch bản tự động hóa nuôi dưỡng và chăm sóc lead', category: 'ai', premiumOnly: true },
  { key: 'seo_blog.admin', label: 'Quản trị Tin tức & Blog SEO', description: 'Đăng bài và tối ưu hóa SEO bài viết trên website công ty', category: 'ai' },
  { key: 'chatbot.use', label: 'Chatbot AI Nội bộ', description: 'Trợ lý AI hỏi đáp pháp lý, phong thủy, thông số kỹ thuật dự án', category: 'ai' },
  { key: 'shortlink.manage', label: 'Quản lý Link rút gọn', description: 'Tạo link rút gọn theo dõi chuyển đổi cho các chiến dịch marketing', category: 'ai' },

  // agent
  { key: 'agent.sources', label: 'Quét nguồn tin Agent', description: 'Cấu hình từ khóa và nguồn quét tin đăng tự động', category: 'agent', premiumOnly: true },
  { key: 'agent.runtime', label: 'Vận hành AI Employee (Runtime)', description: 'Chạy bot tự động tương tác và cào dữ liệu nguồn', category: 'agent', premiumOnly: true },
  { key: 'agent.reports', label: 'Báo cáo hiệu suất Agent', description: 'Xem thống kê số lượng tin đã cào và khách hàng đã lọc', category: 'agent' },
  { key: 'agent.notifications', label: 'Thông báo Telegram Agent', description: 'Nhận cảnh báo lead nóng tức thời về nhóm Telegram', category: 'agent' },
  { key: 'tool.download', label: 'Tải bộ cài Tool Client (.exe)', description: 'Tải ứng dụng HouseAndLife Desktop Agent và kích hoạt', category: 'agent' },

  // team
  { key: 'team.members.manage', label: 'Quản lý & Duyệt Thành viên Team', description: 'Duyệt thành viên nhập mã giới thiệu, phân bổ đội ngũ', category: 'team' },
  { key: 'team.permissions.edit', label: 'Cấu hình quyền nội bộ Team', description: 'Giới hạn quyền xem data khách hàng trong đội ngũ', category: 'team' },
  { key: 'user.manage', label: 'Quản lý User & Nhân sự CMS', description: 'Tạo tài khoản, đổi mật khẩu và phân quyền người dùng', category: 'team' },
  { key: 'profile.edit', label: 'Chỉnh sửa Hồ sơ cá nhân', description: 'Cập nhật avatar, số điện thoại và thông tin cá nhân', category: 'team' },

  // system
  { key: 'settings.system', label: 'Cấu hình Hệ thống', description: 'Cài đặt AI provider, bảo mật, thông số toàn hệ thống', category: 'system' },
  { key: 'integrations.system', label: 'Tích hợp Tài khoản / API', description: 'Kết nối Facebook, Telegram, OpenRouter, Gemini API', category: 'system' },
  { key: 'rbac.matrix', label: 'Quản trị Ma trận Phân quyền', description: 'Chỉnh sửa ma trận RBAC và phân quyền vai trò', category: 'system' },
  { key: 'entitlement', label: 'Quản lý Cấp Gói & Bản quyền', description: 'Cấp và thu hồi gói dịch vụ Pro/Enterprise', category: 'system' },
  { key: 'license.manage', label: 'Quản trị License Key & PEM', description: 'Kích hoạt, gia hạn và thu hồi license PEM', category: 'system' },
];

interface RbacManagementPanelProps {
  currentUser: AuthUser;
  initialTab?: MainTab;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type MainTab = 'members' | 'entitlements' | 'matrix';

export default function RbacManagementPanel({ currentUser, initialTab = 'members', onNotify }: RbacManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const isSuper = currentUser.role === 'owner' || (currentUser.role as string) === 'super_admin';

  // --- TAB 1: Team Members State ---
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberFilter, setMemberFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [memberSearch, setMemberSearch] = useState('');
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  // --- TAB 2: Entitlements State ---
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [granting, setGranting] = useState(false);
  const [deletingEntitlementId, setDeletingEntitlementId] = useState<string | null>(null);

  const [grantForm, setGrantForm] = useState({
    subjectType: 'user' as 'user' | 'team',
    subjectId: '',
    plan: 'pro' as 'trial' | 'pro' | 'enterprise',
    durationDays: 30,
    features: ['crm', 'investor_leads', 'fb_inbox', 'ai_content', 'agent.sources'],
  });

  // --- TAB 3: Matrix State ---
  const [matrix, setMatrix] = useState<RbacMatrixRule[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [savingMatrixKey, setSavingMatrixKey] = useState<string | null>(null);
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixCategory, setMatrixCategory] = useState('all');
  const [batchProcessingRole, setBatchProcessingRole] = useState<string | null>(null);

  // Load Team Members
  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const data = await getTeamMembers({ all: true });
      setMembers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onNotify(err.message || 'Không thể tải danh sách thành viên team.', 'error');
    } finally {
      setMembersLoading(false);
    }
  };

  // Load Entitlements
  const loadEntitlements = async () => {
    setEntitlementsLoading(true);
    try {
      const data = await getEntitlements();
      setEntitlements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onNotify(err.message || 'Không thể tải danh sách gói dịch vụ.', 'error');
    } finally {
      setEntitlementsLoading(false);
    }
  };

  // Load RBAC Matrix
  const loadMatrix = async () => {
    setMatrixLoading(true);
    try {
      const data = await getRbacMatrix();
      setMatrix(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onNotify(err.message || 'Không thể tải ma trận phân quyền.', 'error');
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'members') void loadMembers();
    if (activeTab === 'entitlements') void loadEntitlements();
    if (activeTab === 'matrix') void loadMatrix();
  }, [activeTab]);

  // Handle Approve / Suspend
  const handleUpdateStatus = async (userId: string, newStatus: 'approved' | 'suspended' | 'pending') => {
    setUpdatingMemberId(userId);
    try {
      const res = await updateTeamMemberStatus(userId, newStatus);
      onNotify(res.message || 'Đã cập nhật trạng thái thành viên!', 'success');
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, status: newStatus } : m));
    } catch (err: any) {
      onNotify(err.message || 'Cập nhật trạng thái thất bại.', 'error');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  // Handle Grant Entitlement
  const handleGrantEntitlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantForm.subjectId.trim()) {
      onNotify('Vui lòng nhập ID người dùng hoặc ID team.', 'error');
      return;
    }

    setGranting(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(grantForm.durationDays));

      await createEntitlement({
        subjectType: grantForm.subjectType,
        subjectId: grantForm.subjectId.trim(),
        plan: grantForm.plan,
        features: grantForm.features,
        startsAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      onNotify(`Cấp gói ${grantForm.plan.toUpperCase()} thành công cho ${grantForm.subjectId}!`, 'success');
      setShowGrantModal(false);
      setGrantForm({
        subjectType: 'user',
        subjectId: '',
        plan: 'pro',
        durationDays: 30,
        features: ['crm', 'investor_leads', 'fb_inbox', 'ai_content', 'agent.sources'],
      });
      void loadEntitlements();
    } catch (err: any) {
      onNotify(err.message || 'Cấp gói dịch vụ thất bại.', 'error');
    } finally {
      setGranting(false);
    }
  };

  // Handle Revoke Entitlement
  const handleDeleteEntitlement = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn thu hồi gói này không?')) return;
    setDeletingEntitlementId(id);
    try {
      await deleteEntitlement(id);
      onNotify('Đã thu hồi gói thành công.', 'success');
      setEntitlements(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      onNotify(err.message || 'Thu hồi gói thất bại.', 'error');
    } finally {
      setDeletingEntitlementId(null);
    }
  };

  // Matrix Lookup Map
  const matrixMap = useMemo(() => {
    const map = new Map<string, RbacMatrixRule>();
    for (const rule of matrix) {
      map.set(`${rule.roleKey}:${rule.permissionKey}`, rule);
    }
    return map;
  }, [matrix]);

  // Filtered Permissions for Matrix
  const filteredPermissions = useMemo(() => {
    return MATRIX_PERMISSIONS.filter(p => {
      if (matrixCategory !== 'all' && p.category !== matrixCategory) return false;
      if (matrixSearch.trim()) {
        const q = matrixSearch.toLowerCase();
        const matchLabel = p.label.toLowerCase().includes(q);
        const matchKey = p.key.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        if (!matchLabel && !matchKey && !matchDesc) return false;
      }
      return true;
    });
  }, [matrixCategory, matrixSearch]);

  // Handle Toggle Single Matrix Cell
  const handleToggleCell = async (
    roleKey: string,
    permissionKey: string,
    newScope: 'all' | 'company' | 'team' | 'own' | 'none',
    premiumOnly?: boolean
  ) => {
    const cellKey = `${roleKey}:${permissionKey}`;
    setSavingMatrixKey(cellKey);

    const updatedRule: RbacMatrixRule = {
      roleKey,
      permissionKey,
      scope: newScope,
      premiumOnly: Boolean(premiumOnly),
    };

    // Optimistic UI update
    setMatrix(prev => {
      const exists = prev.some(r => r.roleKey === roleKey && r.permissionKey === permissionKey);
      if (exists) {
        return prev.map(r => (r.roleKey === roleKey && r.permissionKey === permissionKey ? updatedRule : r));
      }
      return [...prev, updatedRule];
    });

    try {
      await updateRbacMatrix(updatedRule);
      onNotify(`Đã lưu quyền ${permissionKey} cho ${roleKey} (${newScope})`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Cập nhật phân quyền thất bại.', 'error');
      void loadMatrix();
    } finally {
      setSavingMatrixKey(null);
    }
  };

  // Handle Batch Toggle for a whole Role
  const handleBatchToggleRole = async (roleKey: string, enable: boolean) => {
    const roleObj = MATRIX_ROLES.find(r => r.key === roleKey);
    const targetScope = enable ? (roleObj?.defaultActiveScope || 'own') : 'none';

    setBatchProcessingRole(roleKey);
    try {
      const updates: RbacMatrixRule[] = [];
      for (const p of filteredPermissions) {
        const existing = matrixMap.get(`${roleKey}:${p.key}`);
        const currentScope = existing?.scope || 'none';
        const isCurrentlyEnabled = currentScope !== 'none';

        if (enable !== isCurrentlyEnabled) {
          updates.push({
            roleKey,
            permissionKey: p.key,
            scope: targetScope,
            premiumOnly: Boolean(p.premiumOnly),
          });
        }
      }

      if (updates.length === 0) {
        onNotify(`Tất cả quyền hiển thị của ${roleObj?.label} đã ở trạng thái này rồi.`, 'info');
        setBatchProcessingRole(null);
        return;
      }

      // Optimistically update
      setMatrix(prev => {
        const map = new Map(prev.map(r => [`${r.roleKey}:${r.permissionKey}`, r]));
        for (const u of updates) {
          map.set(`${u.roleKey}:${u.permissionKey}`, u);
        }
        return Array.from(map.values());
      });

      await Promise.all(updates.map(u => updateRbacMatrix(u)));
      onNotify(`Đã ${enable ? 'bật' : 'tắt'} ${updates.length} quyền cho ${roleObj?.label}!`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Cập nhật hàng loạt thất bại.', 'error');
      void loadMatrix();
    } finally {
      setBatchProcessingRole(null);
    }
  };

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      if (memberFilter !== 'all' && m.status !== memberFilter) return false;
      if (memberSearch.trim()) {
        const q = memberSearch.toLowerCase();
        const matchName = m.name?.toLowerCase().includes(q);
        const matchEmail = m.email?.toLowerCase().includes(q);
        const matchTeam = m.teamReferralCode?.toLowerCase().includes(q) || m.leadName?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchTeam) return false;
      }
      return true;
    });
  }, [members, memberFilter, memberSearch]);

  const pendingCount = members.filter(m => m.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-bold text-white">
            <ShieldCheck className="h-6 w-6 text-rose-500" />
            Quản trị Phân Quyền & Gói Dịch Vụ
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Duyệt thành viên gia nhập qua mã giới thiệu, quản lý cấp gói Premium và cấu hình ma trận RBAC.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all relative ${
              activeTab === 'members'
                ? 'bg-rose-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Duyệt Thành Viên Team
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-2xs font-extrabold animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
          {isSuper && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('entitlements')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'entitlements'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                Quản lý Gói & License
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'matrix'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                Ma Trận RBAC
              </button>
            </>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: DUYỆT & QUẢN LÝ THÀNH VIÊN TEAM */}
      {/* ==================================================== */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Top Controls & Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <span className="text-2xs text-slate-500 uppercase font-bold">Tổng thành viên</span>
              <p className="text-xl font-extrabold text-white mt-0.5">{members.length}</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
              <span className="text-2xs text-amber-400 uppercase font-bold flex items-center gap-1">
                <Clock className="w-3 h-3" /> Chờ duyệt (Pending)
              </span>
              <p className="text-xl font-extrabold text-amber-300 mt-0.5">{pendingCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
              <span className="text-2xs text-emerald-400 uppercase font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Đã duyệt (Approved)
              </span>
              <p className="text-xl font-extrabold text-emerald-300 mt-0.5">
                {members.filter(m => m.status === 'approved').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <span className="text-2xs text-slate-500 uppercase font-bold">Tạm dừng (Suspended)</span>
              <p className="text-xl font-extrabold text-slate-400 mt-0.5">
                {members.filter(m => m.status === 'suspended').length}
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-3">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Tìm theo tên, email hoặc mã team..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-4 text-xs text-slate-200 outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(['all', 'pending', 'approved', 'suspended'] as const).map(tabKey => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setMemberFilter(tabKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    memberFilter === tabKey
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950'
                  }`}
                >
                  {tabKey === 'all' && 'Tất cả'}
                  {tabKey === 'pending' && `Chờ duyệt (${pendingCount})`}
                  {tabKey === 'approved' && 'Đã duyệt'}
                  {tabKey === 'suspended' && 'Tạm dừng'}
                </button>
              ))}

              <button
                type="button"
                onClick={loadMembers}
                disabled={membersLoading}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Làm mới"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${membersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Member List Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            {membersLoading ? (
              <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-rose-500" /> Đang tải danh sách thành viên...
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                Không tìm thấy thành viên nào phù hợp với bộ lọc.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-2xs font-semibold">
                    <tr>
                      <th className="px-4 py-3">Thành viên</th>
                      <th className="px-4 py-3">Đội ngũ / Trực thuộc</th>
                      <th className="px-4 py-3">Ngày tham gia</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác duyệt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredMembers.map(m => {
                      const isPending = m.status === 'pending';
                      const isApproved = m.status === 'approved';
                      const isSuspended = m.status === 'suspended';
                      const isUpdating = updatingMemberId === m.userId;

                      return (
                        <tr key={m.userId} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              {m.avatarUrl ? (
                                <img src={m.avatarUrl} alt={m.name} className="h-8 w-8 rounded-full object-cover" />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold flex items-center justify-center text-xs">
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-white">{m.name}</p>
                                <p className="text-2xs text-slate-400">{m.email} {m.phone && `• ${m.phone}`}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div>
                              <p className="font-semibold text-slate-200">{m.leadName || 'Platform Team'}</p>
                              {m.teamReferralCode && (
                                <span className="font-mono text-2xs text-amber-400 font-bold">
                                  Mã: {m.teamReferralCode}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-400">
                            {new Date(m.joinedAt).toLocaleDateString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3.5">
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-800/60 text-amber-300 font-bold text-2xs">
                                <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                                Chờ duyệt
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 font-bold text-2xs">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Đã duyệt
                              </span>
                            )}
                            {isSuspended && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950/70 border border-red-800/60 text-red-300 font-bold text-2xs">
                                <XCircle className="w-3 h-3 text-red-400" />
                                Tạm dừng
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isPending && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => handleUpdateStatus(m.userId, 'approved')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xs shadow active:scale-95 disabled:opacity-50 transition-all"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    Duyệt ngay
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => handleUpdateStatus(m.userId, 'suspended')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-200 text-2xs font-semibold active:scale-95 disabled:opacity-50 transition-all"
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    Từ chối
                                  </button>
                                </>
                              )}

                              {isApproved && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(m.userId, 'suspended')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-900/60 text-slate-400 hover:text-amber-200 text-2xs font-semibold active:scale-95 disabled:opacity-50 transition-all"
                                  title="Tạm dừng quyền hoạt động trong team"
                                >
                                  Tạm dừng
                                </button>
                              )}

                              {isSuspended && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(m.userId, 'approved')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold text-2xs active:scale-95 disabled:opacity-50 transition-all"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Kích hoạt lại
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: QUẢN LÝ GÓI & ENTITLEMENTS */}
      {/* ==================================================== */}
      {activeTab === 'entitlements' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Danh Sách Gói Dịch Vụ Đã Cấp (Active Entitlements)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Quản lý các gói Pro, Enterprise và tính năng mở rộng được cấp cho User hoặc Team.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadEntitlements}
                disabled={entitlementsLoading}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
                title="Làm mới"
              >
                <RefreshCw className={`w-4 h-4 ${entitlementsLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowGrantModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs shadow active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                Cấp Gói Mới
              </button>
            </div>
          </div>

          {/* Modal / Form Cấp Gói */}
          {showGrantModal && (
            <div className="rounded-2xl border border-amber-500/30 bg-slate-950 p-6 space-y-4 shadow-2xl animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Cấp Gói Tính Năng Cho Người Dùng / Đội Ngũ
                </h4>
                <button
                  type="button"
                  onClick={() => setShowGrantModal(false)}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                >
                  ✕ Đóng
                </button>
              </div>

              <form onSubmit={handleGrantEntitlement} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-2xs uppercase font-bold text-slate-400">Đối tượng</label>
                    <select
                      value={grantForm.subjectType}
                      onChange={e => setGrantForm({ ...grantForm, subjectType: e.target.value as any })}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    >
                      <option value="user">Người dùng (User)</option>
                      <option value="team">Đội ngũ (Team)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-2xs uppercase font-bold text-slate-400">ID Đối tượng (User ID / Team ID)</label>
                    <input
                      type="text"
                      required
                      value={grantForm.subjectId}
                      onChange={e => setGrantForm({ ...grantForm, subjectId: e.target.value })}
                      placeholder="VD: u-owner hoặc usr-..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-2xs uppercase font-bold text-slate-400">Gói dịch vụ</label>
                    <select
                      value={grantForm.plan}
                      onChange={e => setGrantForm({ ...grantForm, plan: e.target.value as any })}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs font-bold uppercase text-amber-300 outline-none focus:border-amber-500"
                    >
                      <option value="trial">TRIAL (Dùng thử)</option>
                      <option value="pro">PRO (Chuyên nghiệp)</option>
                      <option value="enterprise">ENTERPRISE (Doanh nghiệp)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs uppercase font-bold text-slate-400">Thời hạn sử dụng</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { label: '7 ngày', days: 7 },
                      { label: '30 ngày (1 tháng)', days: 30 },
                      { label: '90 ngày (3 tháng)', days: 90 },
                      { label: '365 ngày (1 năm)', days: 365 },
                      { label: '3 năm (VIP)', days: 1095 },
                    ].map(item => (
                      <button
                        key={item.days}
                        type="button"
                        onClick={() => setGrantForm({ ...grantForm, durationDays: item.days })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          grantForm.durationDays === item.days
                            ? 'bg-amber-600 text-white font-bold shadow'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-2xs uppercase font-bold text-slate-400">Tính năng kích hoạt</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      { id: 'crm', label: 'Quản lý CRM' },
                      { id: 'investor_leads', label: 'Investor Leads' },
                      { id: 'fb_inbox', label: 'Hộp thư Đa kênh' },
                      { id: 'ai_content', label: 'Sáng tạo nội dung AI' },
                      { id: 'agent.sources', label: 'Quét tin tự động Agent' },
                      { id: 'agent.custom_schedule', label: 'Lên lịch Agent' },
                      { id: 'agent.unlimited_devices', label: 'Không giới hạn thiết bị' },
                      { id: 'website_chat', label: 'Chatbot Website' },
                    ].map(f => {
                      const checked = grantForm.features.includes(f.id);
                      return (
                        <label
                          key={f.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                            checked
                              ? 'bg-amber-950/40 border-amber-600/50 text-amber-200'
                              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setGrantForm(prev => ({
                                ...prev,
                                features: checked
                                  ? prev.features.filter(x => x !== f.id)
                                  : [...prev.features, f.id],
                              }));
                            }}
                            className="accent-amber-500 rounded"
                          />
                          <span className="text-2xs font-semibold">{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowGrantModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-400 hover:text-white"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={granting}
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow active:scale-95 disabled:opacity-50"
                  >
                    {granting ? 'Đang cấp gói...' : 'Xác nhận Cấp Gói'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Entitlements Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            {entitlementsLoading ? (
              <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" /> Đang tải danh sách gói...
              </div>
            ) : entitlements.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                Chưa có gói dịch vụ nào được cấp thủ công.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-2xs font-semibold">
                    <tr>
                      <th className="px-4 py-3">Gói</th>
                      <th className="px-4 py-3">Đối tượng</th>
                      <th className="px-4 py-3">Tính năng kích hoạt</th>
                      <th className="px-4 py-3">Thời hạn hết hạn</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {entitlements.map(item => {
                      const isExpired = new Date(item.expiresAt).getTime() < Date.now();
                      const isDeleting = deletingEntitlementId === item.id;

                      return (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 font-bold text-amber-400 uppercase text-2xs px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-800/50">
                              <Crown className="w-3 h-3" />
                              {item.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-mono text-slate-200">
                              <span className="text-2xs text-slate-500 uppercase font-semibold mr-1">
                                [{item.subjectType}]
                              </span>
                              {item.subjectId}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1 max-w-sm">
                              {item.features?.map(f => (
                                <span
                                  key={f}
                                  className="text-2xs px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 font-mono"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="space-y-0.5">
                              <p className={`font-semibold ${isExpired ? 'text-red-400 line-through' : 'text-slate-200'}`}>
                                {new Date(item.expiresAt).toLocaleDateString('vi-VN')}
                              </p>
                              <p className="text-2xs text-slate-500">
                                {isExpired ? 'Đã hết hạn' : `Còn hiệu lực`}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteEntitlement(item.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-2xs font-bold active:scale-95 disabled:opacity-50 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Thu hồi
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: MA TRẬN RBAC DẠNG BẢNG (2D GRID VỚI CHECKBOX) */}
      {/* ==================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-sky-400" />
                Bảng Ma Trận Phân Quyền Vai Trò (Master RBAC Matrix)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Bật/tắt quyền hạn bằng Checkbox và tùy chỉnh phạm vi dữ liệu (Scope: Toàn quyền / Team / Cá nhân).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadMatrix}
                disabled={matrixLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors disabled:opacity-50"
                title="Làm mới ma trận"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${matrixLoading ? 'animate-spin text-sky-400' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Search & Category Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
              {MATRIX_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setMatrixCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    matrixCategory === cat.id
                      ? 'bg-sky-600 text-white shadow font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm quyền hạn (tên, mã key)..."
                value={matrixSearch}
                onChange={e => setMatrixSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
              />
              {matrixSearch && (
                <button
                  type="button"
                  onClick={() => setMatrixSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick guide banner */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-sky-950/30 border border-sky-800/40 text-xs text-sky-300">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Hướng dẫn:</strong> Tick <span className="text-emerald-400 font-bold">☑ Checkbox</span> để cấp quyền (mặc định áp dụng scope phù hợp). Khi quyền được bật, bạn có thể chỉnh nhanh phạm vi dữ liệu: <strong>Toàn quyền (all)</strong>, <strong>Theo Team (team)</strong> hoặc <strong>Cá nhân (own)</strong>.
              </span>
            </div>
            <span className="text-2xs text-slate-400 shrink-0 font-mono hidden lg:inline">
              Hiển thị {filteredPermissions.length}/{MATRIX_PERMISSIONS.length} quyền
            </span>
          </div>

          {/* 2D Grid Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-xl">
            {matrixLoading ? (
              <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                <span>Đang tải ma trận phân quyền hệ thống...</span>
              </div>
            ) : filteredPermissions.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                <Search className="w-6 h-6 text-slate-600 mx-auto" />
                <p>Không tìm thấy quyền hạn nào phù hợp với bộ lọc.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="border-b border-slate-800 bg-slate-950/90 text-slate-400 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3.5 font-bold uppercase text-2xs tracking-wider text-slate-300 min-w-[280px]">
                        Tính năng & Quyền hạn ({filteredPermissions.length})
                      </th>
                      <th className="px-3 py-3.5 font-bold uppercase text-2xs tracking-wider text-center text-slate-400 min-w-[100px]">
                        Gói dịch vụ
                      </th>
                      {MATRIX_ROLES.map(role => {
                        const isRoleBusy = batchProcessingRole === role.key;
                        return (
                          <th key={role.key} className="px-3 py-3 text-center min-w-[155px] border-l border-slate-800/60 bg-slate-950/60">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`px-2 py-0.5 rounded-full text-3xs font-bold uppercase border ${role.badgeClass}`}>
                                {role.label}
                              </span>
                              <span className="text-3xs text-slate-500 font-normal">
                                {role.subLabel}
                              </span>

                              {/* Batch buttons */}
                              <div className="flex items-center gap-1.5 mt-1">
                                <button
                                  type="button"
                                  disabled={isRoleBusy}
                                  onClick={() => handleBatchToggleRole(role.key, true)}
                                  className="px-2 py-0.5 rounded text-3xs font-bold bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 transition-colors disabled:opacity-50"
                                  title={`Bật tất cả quyền đang lọc cho ${role.label}`}
                                >
                                  ✓ Bật hết
                                </button>
                                <button
                                  type="button"
                                  disabled={isRoleBusy}
                                  onClick={() => handleBatchToggleRole(role.key, false)}
                                  className="px-2 py-0.5 rounded text-3xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                                  title={`Tắt tất cả quyền đang lọc cho ${role.label}`}
                                >
                                  ✕ Tắt hết
                                </button>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPermissions.map(perm => {
                      return (
                        <tr key={perm.key} className="hover:bg-slate-800/20 transition-colors group">
                          {/* Col 1: Permission Info */}
                          <td className="px-4 py-3 align-middle">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100 text-xs group-hover:text-sky-300 transition-colors">
                                  {perm.label}
                                </span>
                              </div>
                              <p className="font-mono text-3xs text-sky-400/90">
                                {perm.key}
                              </p>
                              <p className="text-3xs text-slate-400 leading-relaxed line-clamp-1">
                                {perm.description}
                              </p>
                            </div>
                          </td>

                          {/* Col 2: Package requirement */}
                          <td className="px-3 py-3 text-center align-middle">
                            {perm.premiumOnly ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/50 text-amber-300 text-3xs font-bold">
                                <Crown className="w-2.5 h-2.5" /> Premium
                              </span>
                            ) : (
                              <span className="text-3xs text-slate-500 font-medium">Tiêu chuẩn</span>
                            )}
                          </td>

                          {/* Col 3-7: Interactive Checkbox & Scope Cells */}
                          {MATRIX_ROLES.map(role => {
                            const cellKey = `${role.key}:${perm.key}`;
                            const rule = matrixMap.get(cellKey);
                            const currentScope = rule ? rule.scope : 'none';
                            const isChecked = currentScope !== 'none';
                            const isSaving = savingMatrixKey === cellKey;

                            return (
                              <td key={role.key} className="px-3 py-2.5 text-center border-l border-slate-800/40 align-middle">
                                <div className="flex flex-col items-center justify-center gap-1.5 min-h-[52px]">
                                  {/* Checkbox item */}
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none group/item">
                                    {isSaving ? (
                                      <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                                    ) : (
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isSaving}
                                        onChange={(e) => {
                                          const nextChecked = e.target.checked;
                                          const nextScope = nextChecked
                                            ? role.defaultActiveScope
                                            : 'none';
                                          void handleToggleCell(role.key, perm.key, nextScope, perm.premiumOnly);
                                        }}
                                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-slate-950 cursor-pointer transition-all"
                                      />
                                    )}
                                    <span
                                      className={`text-3xs font-bold transition-colors ${
                                        isChecked
                                          ? 'text-emerald-400'
                                          : 'text-slate-500 group-hover/item:text-slate-400'
                                      }`}
                                    >
                                      {isChecked ? 'Được phép' : 'Tắt'}
                                    </span>
                                  </label>

                                  {/* Scope Dropdown Selector */}
                                  {isChecked ? (
                                    <select
                                      disabled={isSaving}
                                      value={currentScope}
                                      onChange={(e) =>
                                        handleToggleCell(
                                          role.key,
                                          perm.key,
                                          e.target.value as any,
                                          perm.premiumOnly,
                                        )
                                      }
                                      className="text-3xs font-semibold py-0.5 px-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 focus:border-sky-500 outline-none cursor-pointer max-w-[115px] transition-colors"
                                      title="Tùy chỉnh phạm vi dữ liệu"
                                    >
                                      <option value="all">Toàn quyền (all)</option>
                                      <option value="team">Theo Team (team)</option>
                                      <option value="own">Cá nhân (own)</option>
                                    </select>
                                  ) : (
                                    <span className="text-3xs text-slate-600 font-mono">-</span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
