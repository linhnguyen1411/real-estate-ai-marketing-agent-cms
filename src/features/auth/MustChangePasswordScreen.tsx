import React, { useState, FormEvent } from 'react';
import { KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { updateProfile, logout } from '../../services/api';

export interface MustChangePasswordScreenProps {
  onSuccess: () => void;
  userEmail?: string;
}

export default function MustChangePasswordScreen({ onSuccess, userEmail }: MustChangePasswordScreenProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }

    if (newPassword.length < 10) {
      setError('Mật khẩu mới phải có tối thiểu 10 ký tự để đảm bảo an toàn.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      return;
    }

    setLoading(true);
    try {
      await updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setSuccess(true);
      // Server increments token_version upon password change, invalidating current token.
      logout();
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Yêu cầu đổi mật khẩu bắt buộc</h1>
            <p className="text-xs text-slate-400">
              {userEmail ? `Tài khoản: ${userEmail}` : 'Bảo mật tài khoản yêu cầu cập nhật mật khẩu'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            Tài khoản của bạn được đánh dấu cần đổi mật khẩu trước khi tiếp tục thao tác. Mật khẩu mới cần có ít nhất 10 ký tự.
          </div>
        </div>

        {success ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-emerald-200">Đổi mật khẩu thành công!</p>
            <p className="text-xs text-slate-400">Đang chuyển về màn hình đăng nhập...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Mật khẩu hiện tại</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 text-white placeholder-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Mật khẩu mới (≥ 10 ký tự)</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                required
                minLength={10}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 text-white placeholder-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                required
                minLength={10}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-rose-500 text-white placeholder-slate-600"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 py-2.5 text-sm font-bold text-white transition-colors"
            >
              {loading ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
