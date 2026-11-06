import type { FormEvent } from 'react';
import { Edit, X } from 'lucide-react';
import type { AuthUser, User } from '../../../types';

export type EditUserFormState = {
  name: string;
  email: string;
  password: string;
  role: string;
  company_id: string;
  status: 'active' | 'inactive';
};

type Props = {
  currentUser: AuthUser;
  editingUser: User;
  form: EditUserFormState;
  actionLoading: string | null;
  onFormChange: (form: EditUserFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export default function EditUserModal({
  currentUser,
  editingUser,
  form,
  actionLoading,
  onFormChange,
  onClose,
  onSubmit,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 max-w-lg w-full rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
            <Edit className="w-5 h-5 text-rose-500" />
            Cập nhật user
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
              value={form.name}
              onChange={e => onFormChange({ ...form, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => onFormChange({ ...form, email: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Password mới</label>
            <input
              type="password"
              value={form.password}
              onChange={e => onFormChange({ ...form, password: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500"
              placeholder="Để trống nếu không đổi"
            />
          </div>

          {currentUser.role === 'owner' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Role</label>
                <select
                  value={form.role}
                  disabled={editingUser.id === currentUser.id}
                  onChange={e =>
                    onFormChange({
                      ...form,
                      role: e.target.value,
                      company_id:
                        e.target.value === 'owner'
                          ? ''
                          : form.company_id || currentUser.company_id || 'comp-da-nang',
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-rose-500 disabled:opacity-50"
                >
                  <option value="owner">Owner</option>
                  <option value="company">Company Admin</option>
                  <option value="member">Member</option>
                </select>
              </div>

              {form.role !== 'owner' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Company</label>
                  <input
                    value={form.company_id}
                    onChange={e => onFormChange({ ...form, company_id: e.target.value })}
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

          {editingUser.id !== currentUser.id &&
            (currentUser.role === 'owner' ||
              (currentUser.role === 'company' && editingUser.role === 'member')) && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Trạng thái</label>
                <select
                  value={form.status}
                  onChange={e =>
                    onFormChange({
                      ...form,
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
              onClick={onClose}
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
  );
}
