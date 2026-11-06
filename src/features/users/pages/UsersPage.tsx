import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Coins, Crown, Edit, Eye, Search, ShieldCheck, UserCheck, UserPlus, Users, UserX, X } from 'lucide-react';
import type { AuthUser, Customer, Property, User } from '../../../types';
import EditUserModal, { type EditUserFormState } from '../components/EditUserModal';
import UserDetailDrawer from '../components/UserDetailDrawer';
import { getPlanMeta } from '../planMeta';
import { getRoleBadgeClass, getRoleLabel } from '../userDisplay';
import {
  adminDepositTokens,
  approveTokenTopUpRequest,
  bulkMemberPermissions,
  createUser,
  getAdminTopUpRequests,
  getAdminWallets,
  getCurrentUser,
  getEntitlements,
  getUsers,
  grantUserPlan,
  listCustomers,
  listProperties,
  rejectTokenTopUpRequest,
  updateCustomer,
  updateProperty,
  updateUser,
  type EntitlementItem,
  type TokenTopUpRequestItem,
  type UserWalletData,
} from '../../../services/api';

const ASSIGNMENT_LIMIT = 100;

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = {
  currentUser: AuthUser;
  onNotify: Notify;
  /** When the signed-in user edits their own account from this page. */
  onCurrentUserUpdated?: (user: AuthUser) => void;
};

const EMPTY_NEW_USER = {
  name: '',
  email: '',
  password: '',
  role: 'member',
  company_id: 'comp-da-nang',
  status: 'active' as const,
};

const EMPTY_EDIT_USER: EditUserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'member',
  company_id: '',
  status: 'active',
};

function getInitials(name: string, email?: string): string {
  const source = (name || email || '?').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function defaultPlanEndDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function minPlanEndDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function UsersPage({ currentUser, onNotify, onCurrentUserUpdated }: Props) {
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedPermissionMemberId, setSelectedPermissionMemberId] = useState('');
  const [newUserForm, setNewUserForm] = useState({
    ...EMPTY_NEW_USER,
    company_id: currentUser.company_id || 'comp-da-nang',
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState(EMPTY_EDIT_USER);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const isOwner = currentUser.role === 'owner' || (currentUser as any).roleKey === 'super_admin';
  const [wallets, setWallets] = useState<Record<string, UserWalletData>>({});
  const [userPlans, setUserPlans] = useState<Record<string, EntitlementItem>>({});
  const [planTarget, setPlanTarget] = useState<User | null>(null);
  const [planForm, setPlanForm] = useState<{ plan: 'pro' | 'enterprise'; expiresAt: string }>({
    plan: 'pro',
    expiresAt: defaultPlanEndDate(),
  });
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [topUpRequests, setTopUpRequests] = useState<TokenTopUpRequestItem[]>([]);
  const [topUpRequestsLoading, setTopUpRequestsLoading] = useState(false);
  const [tokenTarget, setTokenTarget] = useState<User | null>(null);
  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenNote, setTokenNote] = useState('');
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [reviewingTopUpId, setReviewingTopUpId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TokenTopUpRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [users, customersResult, propertiesResult] = await Promise.all([
        getUsers(),
        listCustomers({ page: 1, limit: ASSIGNMENT_LIMIT, sort: 'created_at_desc' }).catch(() => ({
          items: [] as Customer[],
        })),
        listProperties({ page: 1, limit: ASSIGNMENT_LIMIT, sort: 'created_at_desc' }).catch(() => ({
          items: [] as Property[],
        })),
      ]);
      setManagedUsers(users);
      setCustomers(customersResult.items);
      setProperties(propertiesResult.items);
      const firstMember = users.find(user => user.role === 'member' && user.status === 'active');
      setSelectedPermissionMemberId(prev => prev || firstMember?.id || '');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không tải được Users.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadWalletOverview = useCallback(async () => {
    if (!isOwner) return;
    setTopUpRequestsLoading(true);
    try {
      const [walletList, pending, entitlements] = await Promise.all([
        getAdminWallets(),
        getAdminTopUpRequests('pending'),
        getEntitlements().catch(() => [] as EntitlementItem[]),
      ]);
      setWallets(Object.fromEntries(walletList.map(wallet => [wallet.userId, wallet])));
      setTopUpRequests(pending);

      const now = Date.now();
      const activePlans: Record<string, EntitlementItem> = {};
      for (const entitlement of entitlements) {
        if (entitlement.subjectType !== 'user') continue;
        const startsAt = new Date(entitlement.startsAt).getTime();
        const expiresAt = new Date(entitlement.expiresAt).getTime();
        if (startsAt > now || expiresAt < now) continue;
        const current = activePlans[entitlement.subjectId];
        if (!current || new Date(current.expiresAt).getTime() < expiresAt) {
          activePlans[entitlement.subjectId] = entitlement;
        }
      }
      setUserPlans(activePlans);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không tải được dữ liệu ví token.', 'error');
    } finally {
      setTopUpRequestsLoading(false);
    }
  }, [isOwner, onNotify]);

  useEffect(() => {
    void loadWalletOverview();
  }, [loadWalletOverview]);

  const managedMembers = useMemo(
    () => managedUsers.filter(user => user.role === 'member' && user.status === 'active'),
    [managedUsers],
  );
  const selectedPermissionMember = managedUsers.find(user => user.id === selectedPermissionMemberId);

  const userCounts = useMemo(
    () => ({
      total: managedUsers.length,
      active: managedUsers.filter(user => user.status === 'active').length,
      members: managedUsers.filter(user => user.role === 'member').length,
      inactive: managedUsers.filter(user => user.status !== 'active').length,
    }),
    [managedUsers],
  );

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return managedUsers.filter(user => {
      if (statusFilter !== 'all' && user.status !== statusFilter) return false;
      if (!query) return true;
      return [user.name, user.email, user.role, user.company_id]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query));
    });
  }, [managedUsers, statusFilter, userSearch]);

  const canEditTargetUser = (target: User) => {
    if (currentUser.role === 'owner') return true;
    if (currentUser.role === 'company') {
      if (target.id === currentUser.id) return true;
      return target.company_id === currentUser.company_id && target.role === 'member';
    }
    return false;
  };

  const canToggleUserStatus = (target: User) => {
    if (target.id === currentUser.id) return false;
    if (currentUser.role === 'owner') return true;
    if (currentUser.role === 'company') {
      return target.company_id === currentUser.company_id && target.role === 'member';
    }
    return false;
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      company_id: user.company_id || '',
      status: user.status,
    });
  };

  const closeEditUserModal = () => {
    setEditingUser(null);
    setEditUserForm(EMPTY_EDIT_USER);
  };

  const openCreateUserModal = () => {
    setNewUserForm({
      ...EMPTY_NEW_USER,
      company_id: currentUser.company_id || 'comp-da-nang',
    });
    setCreateUserOpen(true);
  };

  const closeCreateUserModal = () => {
    if (actionLoading === 'create-user') return;
    setCreateUserOpen(false);
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading('create-user');
    try {
      const payload = {
        ...newUserForm,
        role: currentUser.role === 'company' ? 'member' : newUserForm.role,
        company_id: currentUser.role === 'company' ? currentUser.company_id : newUserForm.company_id,
      };
      const created = await createUser(payload);
      setManagedUsers(prev => [created, ...prev]);
      if (!selectedPermissionMemberId && created.role === 'member') {
        setSelectedPermissionMemberId(created.id);
      }
      setNewUserForm({
        ...EMPTY_NEW_USER,
        company_id: currentUser.company_id || 'comp-da-nang',
      });
      setCreateUserOpen(false);
      onNotify('Đã tạo thành viên mới.', 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không thể tạo thành viên.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    setActionLoading(`user-status-${user.id}`);
    try {
      const updated = await updateUser(user.id, { status: user.status === 'active' ? 'inactive' : 'active' });
      setManagedUsers(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      onNotify('Da cap nhat trang thai user.', 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Khong the cap nhat user.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setActionLoading(`edit-user-${editingUser.id}`);
    try {
      const payload: Record<string, unknown> = {
        name: editUserForm.name.trim(),
        email: editUserForm.email.trim(),
      };

      if (editUserForm.password.trim()) {
        payload.password = editUserForm.password;
      }

      if (currentUser.role === 'owner') {
        payload.role = editUserForm.role;
        payload.company_id = editUserForm.role === 'owner' ? undefined : editUserForm.company_id;
        if (editingUser.id !== currentUser.id) {
          payload.status = editUserForm.status;
        }
      } else if (currentUser.role === 'company' && editingUser.id !== currentUser.id) {
        payload.status = editUserForm.status;
      }

      const updated = await updateUser(editingUser.id, payload);
      setManagedUsers(prev => prev.map(item => (item.id === updated.id ? updated : item)));

      if (updated.id === currentUser.id) {
        const refreshed = await getCurrentUser();
        onCurrentUserUpdated?.(refreshed);
      }

      closeEditUserModal();
      onNotify('Da cap nhat user.', 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Khong the cap nhat user.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openPlanModal = (user: User) => {
    setPlanTarget(user);
    setPlanForm({ plan: 'pro', expiresAt: defaultPlanEndDate() });
  };

  const closePlanModal = () => {
    if (planSubmitting) return;
    setPlanTarget(null);
  };

  const handleGrantPlan = async (e: FormEvent) => {
    e.preventDefault();
    if (!planTarget) return;

    const endsAt = new Date(`${planForm.expiresAt}T23:59:59`);
    if (!planForm.expiresAt || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
      onNotify('Ngày kết thúc gói phải ở tương lai.', 'error');
      return;
    }

    setPlanSubmitting(true);
    try {
      const result = await grantUserPlan({
        subjectId: planTarget.id,
        plan: planForm.plan,
        expiresAt: endsAt.toISOString(),
      });
      setUserPlans(prev => ({ ...prev, [planTarget.id]: result.entitlement }));
      onNotify(
        `Đã cấp gói ${getPlanMeta(result.entitlement.plan).label} cho ${
          planTarget.name || planTarget.email
        }${result.licenseKeyCreated ? ' và tạo License Key' : ''}.`,
        'success',
      );
      setPlanTarget(null);
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không cấp được gói dịch vụ.', 'error');
    } finally {
      setPlanSubmitting(false);
    }
  };

  const openTokenModal = (user: User) => {
    setTokenTarget(user);
    setTokenAmount('');
    setTokenNote('');
  };

  const closeTokenModal = () => {
    setTokenTarget(null);
    setTokenAmount('');
    setTokenNote('');
  };

  const handleAdjustTokens = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenTarget) return;

    const amount = Number(tokenAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      onNotify('Số token phải là số nguyên khác 0.', 'error');
      return;
    }
    if (!tokenNote.trim()) {
      onNotify('Cần nhập lý do/ghi chú giao dịch.', 'error');
      return;
    }

    setTokenSubmitting(true);
    try {
      const result = await adminDepositTokens({ userId: tokenTarget.id, amount, note: tokenNote.trim() });
      setWallets(prev => ({ ...prev, [result.wallet.userId]: result.wallet }));
      onNotify(
        `${amount > 0 ? 'Cộng' : 'Trừ'} ${Math.abs(amount)} token cho ${tokenTarget.name || tokenTarget.email}.`,
        'success',
      );
      closeTokenModal();
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Giao dịch token thất bại.', 'error');
    } finally {
      setTokenSubmitting(false);
    }
  };

  const handleApproveTopUp = async (request: TokenTopUpRequestItem) => {
    setReviewingTopUpId(request.id);
    try {
      const result = await approveTokenTopUpRequest(request.id);
      setWallets(prev => ({ ...prev, [result.wallet.userId]: result.wallet }));
      setTopUpRequests(prev => prev.filter(item => item.id !== request.id));
      onNotify(`Đã cộng ${request.tokens} token theo mã ${request.code}.`, 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không duyệt được phiếu nạp token.', 'error');
    } finally {
      setReviewingTopUpId(null);
    }
  };

  const handleRejectTopUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      onNotify('Cần nhập lý do từ chối.', 'error');
      return;
    }

    setReviewingTopUpId(rejectTarget.id);
    try {
      await rejectTokenTopUpRequest(rejectTarget.id, rejectReason.trim());
      setTopUpRequests(prev => prev.filter(item => item.id !== rejectTarget.id));
      onNotify(`Đã từ chối phiếu ${rejectTarget.code}.`, 'success');
      setRejectTarget(null);
      setRejectReason('');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không từ chối được phiếu nạp token.', 'error');
    } finally {
      setReviewingTopUpId(null);
    }
  };

  const handleToggleMemberAssignment = async (
    collection: 'customers' | 'properties',
    resource: Customer | Property,
    memberId: string,
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
        setCustomers(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      } else {
        const updated = await updateProperty(resource.id, { assigned_member_ids: nextAssignedIds });
        setProperties(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      }
      onNotify('Đã cập nhật quyền truy cập.', 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không thể cấp quyền.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkMemberAssignment = async (
    collection: 'customers' | 'properties',
    memberId: string,
    assign: boolean,
  ) => {
    if (!memberId) return;
    setActionLoading(`assign-all-${collection}`);
    try {
      const result = await bulkMemberPermissions({ member_id: memberId, collection, assign });
      if (result.updated === 0) {
        onNotify(assign ? 'Tất cả đã được cấp quyền.' : 'Không có mục nào đang được cấp.', 'info');
        return;
      }
      const updatedMap = new Map(result.items.map(item => [item.id, item]));
      if (collection === 'customers') {
        setCustomers(prev => prev.map(item => (updatedMap.get(item.id) as Customer | undefined) || item));
      } else {
        setProperties(prev => prev.map(item => (updatedMap.get(item.id) as Property | undefined) || item));
      }
      onNotify(assign ? `Đã cấp quyền ${result.updated} mục.` : `Đã bỏ quyền ${result.updated} mục.`, 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không thể cập nhật hàng loạt.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectAllMemberPermissions = async (memberId: string, assign: boolean) => {
    if (!memberId) return;
    setActionLoading('assign-all-global');
    try {
      const results = await Promise.all([
        bulkMemberPermissions({ member_id: memberId, collection: 'properties', assign }),
        bulkMemberPermissions({ member_id: memberId, collection: 'customers', assign }),
      ]);
      const [propsResult, customersResult] = results;
      const propsMap = new Map(propsResult.items.map(item => [item.id, item]));
      const customersMap = new Map(customersResult.items.map(item => [item.id, item]));
      setProperties(prev => prev.map(item => (propsMap.get(item.id) as Property | undefined) || item));
      setCustomers(prev => prev.map(item => (customersMap.get(item.id) as Customer | undefined) || item));
      const totalUpdated = results.reduce((sum, result) => sum + result.updated, 0);
      onNotify(
        totalUpdated === 0
          ? assign
            ? 'Tất cả đã được cấp quyền.'
            : 'Không có mục nào đang được cấp.'
          : assign
            ? `Đã cấp quyền ${totalUpdated} mục.`
            : `Đã bỏ quyền ${totalUpdated} mục.`,
        totalUpdated === 0 ? 'info' : 'success',
      );
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Không thể cập nhật hàng loạt.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
        Đang tải Users & Permission…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-500" />
            User & Permission
          </h2>
          <p className="text-slate-400 text-sm">
            Owner quản lý toàn bộ user. Company admin chỉ tạo/sửa member và cấp quyền trong company/team của mình.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateUserModal}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-rose-500"
        >
          <UserPlus className="w-4 h-4" />
          Thêm thành viên
        </button>
      </div>

      {isOwner && (
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-emerald-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                Yêu cầu nạp token chờ duyệt
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Đối chiếu sao kê ngân hàng với mã nội dung trước khi cộng token. Hệ thống chỉ cộng một lần.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWalletOverview()}
              disabled={topUpRequestsLoading}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-50"
            >
              {topUpRequestsLoading ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>

          {topUpRequests.length === 0 ? (
            <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
              Không có phiếu nạp token nào đang chờ duyệt.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5">Mã</th>
                    <th className="px-3 py-2.5">Người gửi</th>
                    <th className="px-3 py-2.5">Token</th>
                    <th className="px-3 py-2.5">Số tiền</th>
                    <th className="px-3 py-2.5">Thời gian</th>
                    <th className="px-3 py-2.5 text-right">Xử lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {topUpRequests.map(request => (
                    <tr key={request.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{request.code}</td>
                      <td className="py-2.5 px-3">
                        <div className="text-xs font-semibold text-slate-200">{request.name || 'Thành viên'}</div>
                        <div className="text-2xs text-slate-500 font-mono">{request.email || request.userId}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-300">+{request.tokens}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {request.amountVnd.toLocaleString('vi-VN')}đ
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(request.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApproveTopUp(request)}
                            disabled={reviewingTopUpId === request.id}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-2xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Đã nhận tiền
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTarget(request);
                              setRejectReason('');
                            }}
                            disabled={reviewingTopUpId === request.id}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-2xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Tổng thành viên',
            value: userCounts.total,
            icon: Users,
            tone: 'text-rose-400',
            ring: 'border-rose-500/20 bg-rose-500/10',
          },
          {
            label: 'Đang hoạt động',
            value: userCounts.active,
            icon: UserCheck,
            tone: 'text-emerald-400',
            ring: 'border-emerald-500/20 bg-emerald-500/10',
          },
          {
            label: 'Member',
            value: userCounts.members,
            icon: ShieldCheck,
            tone: 'text-sky-400',
            ring: 'border-sky-500/20 bg-sky-500/10',
          },
          {
            label: 'Tạm khóa',
            value: userCounts.inactive,
            icon: UserX,
            tone: 'text-slate-400',
            ring: 'border-slate-700 bg-slate-800/60',
          },
        ].map(card => (
          <div
            key={card.label}
            className="flex items-center gap-2.5 rounded-2xl border border-slate-900 bg-slate-900/40 p-3 sm:gap-3 sm:p-4"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:h-10 sm:w-10 ${card.ring} ${card.tone}`}
            >
              <card.icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-base font-bold leading-tight text-white sm:text-lg">
                {card.value}
              </div>
              <div className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 sm:text-2xs">
                {card.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40">
        <div className="flex flex-col gap-3 border-b border-slate-900 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Danh sách thành viên</h3>
            <p className="text-xs text-slate-500">
              {filteredUsers.length === managedUsers.length
                ? `${managedUsers.length} thành viên trong phạm vi quản lý`
                : `Hiển thị ${filteredUsers.length}/${managedUsers.length} thành viên`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Tìm theo tên, email, công ty…"
                className="h-10 w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-9 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-rose-500 sm:w-72"
              />
              {userSearch && (
                <button
                  type="button"
                  onClick={() => setUserSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-200"
                  aria-label="Xóa tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="h-10 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 outline-none focus:border-rose-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Tạm khóa</option>
            </select>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-500">
              <Users className="w-6 h-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                {managedUsers.length === 0 ? 'Chưa có thành viên nào' : 'Không tìm thấy thành viên phù hợp'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {managedUsers.length === 0
                  ? 'Bấm “Thêm thành viên” để tạo tài khoản đầu tiên.'
                  : 'Thử từ khóa khác hoặc bỏ bộ lọc trạng thái.'}
              </p>
            </div>
            {managedUsers.length === 0 ? (
              <button
                type="button"
                onClick={openCreateUserModal}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-500"
              >
                <UserPlus className="w-4 h-4" />
                Thêm thành viên
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUserSearch('');
                  setStatusFilter('all');
                }}
                className="mt-1 inline-flex min-h-10 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-bold text-slate-300 hover:bg-slate-800"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="px-4 pt-3 text-[11px] text-slate-500 md:hidden">Vuốt ngang bảng để xem thêm cột.</p>
            <div className="overflow-x-auto">
              <table data-testid="users-table" className="w-full min-w-[1080px] text-sm text-left">
                <thead className="border-b border-slate-900 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Thành viên</th>
                    <th className="px-4 py-3">Vai trò</th>
                    <th className="px-4 py-3">Công ty</th>
                    {isOwner && <th className="px-4 py-3">Gói dịch vụ</th>}
                    {isOwner && <th className="px-4 py-3">Ví token</th>}
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {filteredUsers.map(user => {
                    const wallet = wallets[user.id];
                    const balance = wallet ? wallet.balance : 0;
                    const plan = userPlans[user.id];
                    const planMeta = getPlanMeta(plan?.plan);
                    return (
                      <tr key={user.id} className="align-middle transition-colors hover:bg-slate-900/30">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-2xs font-bold text-slate-300">
                              {getInitials(user.name, user.email)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-bold text-white">{user.name}</div>
                              <div className="truncate font-mono text-2xs text-slate-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-2xs font-bold uppercase ${getRoleBadgeClass(user.role)}`}
                          >
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block max-w-[180px] truncate font-mono text-xs text-slate-400">
                            {user.company_id || 'system'}
                          </span>
                        </td>
                        {isOwner && (
                          <td className="px-4 py-3.5">
                            <div className="space-y-1">
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-2xs font-bold uppercase ${planMeta.badgeClass}`}
                              >
                                {planMeta.label}
                              </span>
                              <div className="whitespace-nowrap text-2xs text-slate-500">
                                {plan
                                  ? `HSD ${new Date(plan.expiresAt).toLocaleDateString('vi-VN')}`
                                  : 'Chưa kích hoạt'}
                              </div>
                              <button
                                type="button"
                                onClick={() => openPlanModal(user)}
                                className="inline-flex min-h-7 items-center gap-1 text-2xs font-bold text-amber-300 hover:text-amber-200"
                              >
                                <Crown className="w-3 h-3" />
                                Cấp gói
                              </button>
                            </div>
                          </td>
                        )}
                        {isOwner && (
                          <td className="px-4 py-3.5">
                            <div className="space-y-0.5">
                              <div className="whitespace-nowrap font-mono text-xs font-bold text-white">
                                {balance.toLocaleString('vi-VN')} token
                              </div>
                              <div className="whitespace-nowrap text-2xs text-slate-500">
                                {wallet?.status === 'frozen'
                                  ? 'Ví bị khóa'
                                  : `Khả dụng ${wallet ? wallet.availableBalance.toLocaleString('vi-VN') : 0}`}
                              </div>
                              <button
                                type="button"
                                onClick={() => openTokenModal(user)}
                                className="inline-flex min-h-7 items-center gap-1 text-2xs font-bold text-emerald-400 hover:text-emerald-300"
                              >
                                <Coins className="w-3 h-3" />
                                Nạp/Trừ
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-bold uppercase ${
                              user.status === 'active'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                : 'border-slate-700 bg-slate-800 text-slate-500'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                user.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'
                              }`}
                            />
                            {user.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => setDetailUserId(user.id)}
                                data-testid={`user-detail-${user.email}`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 text-2xs font-bold text-slate-200 hover:bg-slate-700"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Xem
                              </button>
                            )}
                            {canEditTargetUser(user) && (
                              <button
                                type="button"
                                onClick={() => openEditUserModal(user)}
                                disabled={actionLoading === `edit-user-${user.id}`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-2xs font-bold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Sửa
                              </button>
                            )}
                            {canToggleUserStatus(user) && (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(user)}
                                disabled={actionLoading === `user-status-${user.id}`}
                                className="inline-flex min-h-9 items-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 text-2xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                              >
                                {user.status === 'active' ? 'Tạm khóa' : 'Kích hoạt'}
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
          </>
        )}
      </div>

      <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Cấp quyền tài nguyên cho Member</h3>
            <p className="text-xs text-slate-500">Member chỉ truy cập được tài nguyên có tick trong danh sách bên dưới.</p>
          </div>
          <select
            value={selectedPermissionMemberId}
            onChange={e => setSelectedPermissionMemberId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
          >
            <option value="">Chọn member</option>
            {managedMembers.map(member => (
              <option key={member.id} value={member.id}>
                {member.name} - {member.email}
              </option>
            ))}
          </select>
        </div>

        {selectedPermissionMember ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSelectAllMemberPermissions(selectedPermissionMember.id, true)}
                disabled={actionLoading === 'assign-all-global'}
                className="inline-flex min-h-11 items-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={() => handleSelectAllMemberPermissions(selectedPermissionMember.id, false)}
                disabled={actionLoading === 'assign-all-global'}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Bỏ chọn tất cả
              </button>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(
                [
                  { key: 'properties' as const, title: 'Tin BĐS (website)', subtitle: 'Hiển thị trên trang công khai', items: properties },
                  { key: 'customers' as const, title: 'Khách hàng', subtitle: 'Lead & CRM', items: customers },
                ] as const
              ).map(section => (
                <div key={section.key} className="bg-slate-950/60 border border-slate-900 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-900">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white">{section.title}</div>
                        <div className="text-2xs text-slate-500">{section.subtitle}</div>
                        <div className="text-2xs text-slate-500 mt-0.5">
                          {
                            section.items.filter(item =>
                              (item.assigned_member_ids || []).includes(selectedPermissionMember.id),
                            ).length
                          }
                          /{section.items.length} đã cấp
                          {section.items.length >= ASSIGNMENT_LIMIT ? ` (tối đa ${ASSIGNMENT_LIMIT})` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleBulkMemberAssignment(section.key, selectedPermissionMember.id, true)
                          }
                          disabled={actionLoading === `assign-all-${section.key}` || actionLoading === 'assign-all-global'}
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-800 px-2 py-1 text-2xs font-bold text-rose-300 hover:bg-slate-900 disabled:opacity-50"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleBulkMemberAssignment(section.key, selectedPermissionMember.id, false)
                          }
                          disabled={actionLoading === `assign-all-${section.key}` || actionLoading === 'assign-all-global'}
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-800 px-2 py-1 text-2xs font-bold text-slate-400 hover:bg-slate-900 disabled:opacity-50"
                        >
                          None
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto app-scroll divide-y divide-slate-900">
                    {section.items.map(item => {
                      const checked = (item.assigned_member_ids || []).includes(selectedPermissionMember.id);
                      const label = 'title' in item ? item.title : item.name;
                      return (
                        <label
                          key={item.id}
                          className="flex items-start gap-3 px-4 py-3 text-xs cursor-pointer hover:bg-slate-900/50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              handleToggleMemberAssignment(section.key, item, selectedPermissionMember.id)
                            }
                            disabled={actionLoading === `assign-${section.key}-${item.id}`}
                            className="mt-0.5 h-5 w-5 accent-rose-600"
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
          </>
        ) : (
          <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
            Chọn một member active để bắt đầu cấp quyền.
          </div>
        )}
      </div>

      {createUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateUser}
            className="app-scroll max-h-[90vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-lg font-bold text-white">
                  <UserPlus className="h-5 w-5 text-rose-500" />
                  Thêm thành viên
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {currentUser.role === 'company'
                    ? 'Tài khoản mới sẽ thuộc company của bạn với vai trò Member.'
                    : 'Tạo tài khoản mới và gán vai trò, công ty ngay khi khởi tạo.'}
                </p>
              </div>
              <button type="button" onClick={closeCreateUserModal} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-400">Tên</label>
                <input
                  value={newUserForm.name}
                  onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                  placeholder="Sale Member"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Email</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                  placeholder="member@example.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Password</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                  placeholder="Mật khẩu đăng nhập"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Vai trò</label>
                <select
                  value={currentUser.role === 'company' ? 'member' : newUserForm.role}
                  disabled={currentUser.role === 'company'}
                  onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs outline-none focus:border-rose-500 disabled:opacity-50"
                >
                  {currentUser.role === 'owner' && <option value="owner">Owner</option>}
                  {currentUser.role === 'owner' && <option value="company">Company Admin</option>}
                  <option value="member">Member</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Công ty</label>
                <input
                  value={currentUser.role === 'company' ? currentUser.company_id || '' : newUserForm.company_id}
                  disabled={currentUser.role === 'company'}
                  onChange={e => setNewUserForm({ ...newUserForm, company_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs outline-none focus:border-rose-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={closeCreateUserModal}
                disabled={actionLoading === 'create-user'}
                className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'create-user'}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-rose-500 disabled:opacity-50"
              >
                {actionLoading === 'create-user' ? 'Đang tạo...' : 'Tạo thành viên'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <EditUserModal
          currentUser={currentUser}
          editingUser={editingUser}
          form={editUserForm}
          actionLoading={actionLoading}
          onFormChange={setEditUserForm}
          onClose={closeEditUserModal}
          onSubmit={handleUpdateUser}
        />
      )}

      {tokenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAdjustTokens}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                Cộng / Trừ Token
              </h4>
              <button type="button" onClick={closeTokenModal} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Người nhận:</span>
                <span className="font-bold text-white block">{tokenTarget.name || 'Thành viên'}</span>
                <span className="text-slate-400 font-mono text-2xs">{tokenTarget.email}</span>
                <span className="text-slate-400 block">
                  Số dư hiện tại:{' '}
                  <strong className="text-emerald-300 font-mono">
                    {(wallets[tokenTarget.id]?.balance ?? 0).toLocaleString('vi-VN')} token
                  </strong>
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Số token (+ nạp, - trừ):</label>
                <input
                  type="number"
                  value={tokenAmount}
                  onChange={e => setTokenAmount(e.target.value)}
                  placeholder="Ví dụ: 20 hoặc -5"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Lý do / Ghi chú (bắt buộc):</label>
                <textarea
                  rows={3}
                  value={tokenNote}
                  onChange={e => setTokenNote(e.target.value)}
                  placeholder="Ví dụ: Đã nhận chuyển khoản mã NAP-XXXXXX"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white focus:border-emerald-500 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={closeTokenModal}
                disabled={tokenSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={tokenSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                {tokenSubmitting ? 'Đang giao dịch...' : 'Xác nhận'}
              </button>
            </div>
          </form>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRejectTopUp}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-white">Từ chối phiếu {rejectTarget.code}</h4>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-400">
                {rejectTarget.name || rejectTarget.email} · {rejectTarget.tokens} token ·{' '}
                {rejectTarget.amountVnd.toLocaleString('vi-VN')}đ
              </p>
              <label className="text-slate-300 font-semibold block">Lý do từ chối (bắt buộc):</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Ví dụ: Chưa nhận được chuyển khoản hoặc sai nội dung"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white focus:border-rose-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={reviewingTopUpId === rejectTarget.id}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={reviewingTopUpId === rejectTarget.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                {reviewingTopUpId === rejectTarget.id ? 'Đang xử lý...' : 'Từ chối phiếu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {planTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleGrantPlan}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                <Crown className="w-4 h-4 text-amber-300" />
                Cấp gói dịch vụ
              </h4>
              <button type="button" onClick={closePlanModal} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
              <span className="block text-slate-500">Người nhận:</span>
              <span className="block font-bold text-white">{planTarget.name || 'Thành viên'}</span>
              <span className="block font-mono text-2xs text-slate-400">{planTarget.email}</span>
              <span className="block text-slate-400">
                Gói hiện tại:{' '}
                <strong className="text-amber-300">{getPlanMeta(userPlans[planTarget.id]?.plan).label}</strong>
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block font-semibold text-slate-300">Gói dịch vụ:</label>
                <select
                  value={planForm.plan}
                  onChange={e => setPlanForm(prev => ({ ...prev, plan: e.target.value as 'pro' | 'enterprise' }))}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="pro">Pro Agent — 20 token</option>
                  <option value="enterprise">Enterprise — 100 token</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-slate-300">Ngày kết thúc gói:</label>
                <input
                  type="date"
                  required
                  min={minPlanEndDate()}
                  value={planForm.expiresAt}
                  onChange={e => setPlanForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <ul className="space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-2xs text-amber-200/80">
                <li>• Gói đang hiệu lực sẽ bị thay thế bằng gói mới.</li>
                <li>• Không trừ token trong ví của thành viên.</li>
                <li>• License Key sẽ được tạo tự động nếu thành viên chưa có.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-2">
              <button
                type="button"
                onClick={closePlanModal}
                disabled={planSubmitting}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={planSubmitting}
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-amber-400 disabled:opacity-50"
              >
                {planSubmitting ? 'Đang cấp gói...' : 'Cấp gói'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detailUserId && (
        <UserDetailDrawer userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </div>
  );
}
