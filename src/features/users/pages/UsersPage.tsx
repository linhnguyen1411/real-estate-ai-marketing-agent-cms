import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, ShieldCheck, UserPlus, X } from 'lucide-react';
import type { AuthUser, Customer, Property, User } from '../../../types';
import { AGENT_TIER_META, AGENT_TIER_ORDER } from '../../../utils/agentTier';
import {
  bulkMemberPermissions,
  createUser,
  getCurrentUser,
  getUsers,
  listCustomers,
  listProperties,
  updateCustomer,
  updateProperty,
  updateUser,
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

const EMPTY_EDIT_USER = {
  name: '',
  email: '',
  password: '',
  role: 'member',
  company_id: '',
  status: 'active' as 'active' | 'inactive',
  agent_tier: 'normal' as User['agent_tier'],
};

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

  const managedMembers = useMemo(
    () => managedUsers.filter(user => user.role === 'member' && user.status === 'active'),
    [managedUsers],
  );
  const selectedPermissionMember = managedUsers.find(user => user.id === selectedPermissionMemberId);

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
      agent_tier: user.agent_tier || (user.role === 'owner' ? 'legendary' : 'normal'),
    });
  };

  const closeEditUserModal = () => {
    setEditingUser(null);
    setEditUserForm(EMPTY_EDIT_USER);
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
      onNotify('Da tao user moi.', 'success');
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : 'Khong the tao user.', 'error');
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
        payload.agent_tier = editUserForm.role === 'owner' ? 'legendary' : editUserForm.agent_tier;
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
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-rose-500" />
          User & Permission
        </h2>
        <p className="text-slate-400 text-sm">
          Owner quản lý toàn bộ user. Company admin chỉ tạo/sửa member và cấp quyền trong company/team của mình.
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
              onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
              placeholder="Sale Member"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Email</label>
            <input
              type="email"
              value={newUserForm.email}
              onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
              placeholder="member@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Password</label>
            <input
              type="password"
              value={newUserForm.password}
              onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
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
                onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
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
                value={currentUser.role === 'company' ? currentUser.company_id || '' : newUserForm.company_id}
                disabled={currentUser.role === 'company'}
                onChange={e => setNewUserForm({ ...newUserForm, company_id: e.target.value })}
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
                      <span
                        className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase border ${
                          user.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canEditTargetUser(user) && (
                          <button
                            type="button"
                            onClick={() => openEditUserModal(user)}
                            disabled={actionLoading === `edit-user-${user.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300 disabled:opacity-40"
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
                            className="text-xs font-bold text-rose-400 hover:text-rose-300 disabled:opacity-40"
                          >
                            {user.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
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
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={() => handleSelectAllMemberPermissions(selectedPermissionMember.id, false)}
                disabled={actionLoading === 'assign-all-global'}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
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
                          className="rounded-md border border-slate-800 px-2 py-1 text-2xs font-bold text-rose-300 hover:bg-slate-900 disabled:opacity-50"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleBulkMemberAssignment(section.key, selectedPermissionMember.id, false)
                          }
                          disabled={actionLoading === `assign-all-${section.key}` || actionLoading === 'assign-all-global'}
                          className="rounded-md border border-slate-800 px-2 py-1 text-2xs font-bold text-slate-400 hover:bg-slate-900 disabled:opacity-50"
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
          </>
        ) : (
          <div className="border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
            Chọn một member active để bắt đầu cấp quyền.
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 max-w-lg w-full rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                <Edit className="w-5 h-5 text-rose-500" />
                Cập nhật user
              </h3>
              <button type="button" onClick={closeEditUserModal} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
                {editingUser.id === currentUser.id
                  ? 'Bạn đang chỉnh sửa tài khoản của mình.'
                  : currentUser.role === 'company'
                    ? 'Company admin chỉ được sửa thông tin member trong company.'
                    : 'Owner có thể thay đổi role, company và trạng thái user.'}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Tên</label>
                <input
                  required
                  value={editUserForm.name}
                  onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Email</label>
                <input
                  type="email"
                  required
                  value={editUserForm.email}
                  onChange={e => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Password mới</label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={e => setEditUserForm({ ...editUserForm, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                  placeholder="Để trống nếu không đổi"
                />
              </div>

              {currentUser.role === 'owner' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Role</label>
                    <select
                      value={editUserForm.role}
                      disabled={editingUser.id === currentUser.id}
                      onChange={e =>
                        setEditUserForm({
                          ...editUserForm,
                          role: e.target.value,
                          company_id:
                            e.target.value === 'owner'
                              ? ''
                              : editUserForm.company_id || currentUser.company_id || 'comp-da-nang',
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500 disabled:opacity-50"
                    >
                      <option value="owner">Owner</option>
                      <option value="company">Company Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </div>

                  {editUserForm.role !== 'owner' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400">Company</label>
                      <input
                        value={editUserForm.company_id}
                        onChange={e => setEditUserForm({ ...editUserForm, company_id: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {currentUser.role === 'company' && editingUser.id !== currentUser.id && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Role</label>
                    <input
                      value="member"
                      disabled
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Company</label>
                    <input
                      value={editingUser.company_id || ''}
                      disabled
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none opacity-50"
                    />
                  </div>
                </div>
              )}

              {currentUser.role === 'owner' && editingUser.role !== 'owner' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Bậc agent</label>
                  <select
                    value={editUserForm.agent_tier || 'normal'}
                    onChange={e =>
                      setEditUserForm({ ...editUserForm, agent_tier: e.target.value as User['agent_tier'] })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                  >
                    {AGENT_TIER_ORDER.filter(tier => tier !== 'legendary').map(tier => (
                      <option key={tier} value={tier}>
                        {AGENT_TIER_META[tier].label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {editingUser.id !== currentUser.id &&
                (currentUser.role === 'owner' ||
                  (currentUser.role === 'company' && editingUser.role === 'member')) && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400">Trạng thái</label>
                    <select
                      value={editUserForm.status}
                      onChange={e =>
                        setEditUserForm({
                          ...editUserForm,
                          status: e.target.value as 'active' | 'inactive',
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditUserModal}
                  className="text-xs font-bold text-slate-400 hover:text-slate-200 px-4 py-2.5"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === `edit-user-${editingUser.id}`}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
                >
                  {actionLoading === `edit-user-${editingUser.id}` ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
