import React, { FormEvent, useEffect, useState } from 'react';
import { ExternalLink, Globe, Image as ImageIcon, Mail, Phone, Save, Shield, UserCircle } from 'lucide-react';
import { AuthUser } from '../../types';
import { updateProfile, uploadProfileAvatar } from '../../services/api';
import { resizeImageFile } from '../../utils/resizeImageFile';
import AgentTierBadge from '../agent/AgentTierBadge';
import { resolveAgentTier, AGENT_TIER_META } from '../../utils/agentTier';

interface AdminProfilePanelProps {
  currentUser: AuthUser;
  saving: boolean;
  onSavingChange: (loading: boolean) => void;
  onUpdated: (user: AuthUser) => void;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function AdminProfilePanel({
  currentUser,
  saving,
  onSavingChange,
  onUpdated,
  onNotify,
}: AdminProfilePanelProps) {
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [form, setForm] = useState({
    name: currentUser.name,
    email: currentUser.email,
    phone: currentUser.phone || '',
    bio: currentUser.bio || '',
    publicSlug: currentUser.public_slug || '',
    showPublicProfile: currentUser.show_public_profile !== false,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    setAvatarPreview(currentUser.avatar_url || '');
    setForm({
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone || '',
      bio: currentUser.bio || '',
      publicSlug: currentUser.public_slug || '',
      showPublicProfile: currentUser.show_public_profile !== false,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  }, [currentUser]);

  const tier = resolveAgentTier(currentUser);
  const publicProfileUrl = currentUser.public_slug ? `/moi-gioi/${currentUser.public_slug}` : '';

  const handleAvatarUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await resizeImageFile(file);
      const result = await uploadProfileAvatar(dataUrl);
      setAvatarPreview(result.url);
      onUpdated(result.user);
      onNotify('Đã cập nhật avatar.', 'success');
    } catch (error: any) {
      onNotify(error.message || 'Không thể upload avatar.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      onNotify('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }

    if (form.newPassword && !form.currentPassword) {
      onNotify('Nhập mật khẩu hiện tại để đổi mật khẩu mới.', 'error');
      return;
    }

    onSavingChange(true);
    try {
      const updated = await updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
        avatar_url: avatarPreview || undefined,
        public_slug: form.publicSlug.trim() || undefined,
        show_public_profile: form.showPublicProfile,
        current_password: form.currentPassword || undefined,
        new_password: form.newPassword || undefined,
      });
      onUpdated(updated);
      setForm(prev => ({
        ...prev,
        publicSlug: updated.public_slug || prev.publicSlug,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      onNotify('Đã cập nhật hồ sơ cá nhân.', 'success');
    } catch (error: any) {
      onNotify(error.message || 'Không thể cập nhật hồ sơ.', 'error');
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <UserCircle className="h-6 w-6 text-rose-400" />
          Hồ sơ môi giới
        </h2>
        <p className="text-sm text-slate-400">
          Thiết lập avatar, giới thiệu và hồ sơ công khai hiển thị trên website Estoria.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 space-y-4">
          <div className="relative mx-auto h-28 w-28">
            {avatarPreview ? (
              <img src={avatarPreview} alt={currentUser.name} className="h-28 w-28 rounded-full object-cover ring-2 ring-rose-500/30" />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-3xl font-bold text-rose-300">
                {currentUser.name.trim().charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <label className="absolute bottom-0 right-0 cursor-pointer rounded-full border border-slate-700 bg-slate-950 p-2 text-slate-300 hover:text-white">
              <ImageIcon className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatarUpload(e.target.files)} />
            </label>
          </div>
          <p className="text-center text-2xs text-slate-500">
            {uploadingAvatar ? 'Đang upload avatar...' : 'Bấm biểu tượng ảnh để đổi avatar'}
          </p>

          <div className="text-center space-y-2">
            <p className="font-bold text-white">{currentUser.name}</p>
            <AgentTierBadge tier={tier} size="md" className="mx-auto" />
            <p className="text-xs text-slate-500">{currentUser.email}</p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Vai trò</span>
              <span className="font-bold uppercase text-slate-200">{currentUser.role}</span>
            </div>
            {currentUser.company_name && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Công ty</span>
                <span className="font-semibold text-slate-200">{currentUser.company_name}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Bậc agent</span>
              <span className="font-semibold text-slate-200">{AGENT_TIER_META[tier].label}</span>
            </div>
          </div>

          {form.showPublicProfile && publicProfileUrl && (
            <a
              href={publicProfileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-slate-900"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Xem hồ sơ công khai
            </a>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Họ tên</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Email đăng nhập</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Số điện thoại</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-slate-200 outline-none focus:border-rose-500"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">Đường dẫn hồ sơ công khai</label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  value={form.publicSlug}
                  onChange={(e) => setForm({ ...form, publicSlug: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-slate-200 outline-none focus:border-rose-500"
                  placeholder="ten-moi-gioi"
                />
              </div>
              <p className="text-2xs text-slate-500">URL: /moi-gioi/{form.publicSlug || '...'}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-slate-400">Mô tả ngắn về bản thân</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={4}
                maxLength={600}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-200 outline-none focus:border-rose-500"
                placeholder="Kinh nghiệm, khu vực chuyên môn, phong cách tư vấn..."
              />
              <p className="text-2xs text-slate-500">{form.bio.length}/600 ký tự — hiển thị trên hồ sơ công khai</p>
            </div>
            <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={form.showPublicProfile}
                onChange={(e) => setForm({ ...form, showPublicProfile: e.target.checked })}
                className="accent-rose-600"
              />
              Hiển thị hồ sơ công khai trên website (trang môi giới + tin BĐS)
            </label>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Shield className="h-4 w-4 text-rose-400" />
              Đổi mật khẩu
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500"
                placeholder="Mật khẩu hiện tại"
              />
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500"
                placeholder="Mật khẩu mới"
              />
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500"
                placeholder="Xác nhận mật khẩu"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || uploadingAvatar}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
