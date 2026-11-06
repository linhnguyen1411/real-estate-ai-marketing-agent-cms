import React, { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Mail,
  Phone,
  Save,
  Shield,
  UserCircle,
  Copy,
  Check,
  Key,
  Download,
  Sparkles,
  Zap,
  Crown,
  Share2,
  CheckCircle2,
  ArrowRight,
  Clock,
  AlertCircle,
  Users,
  UserCheck,
  UserPlus,
  UserX,
  RefreshCw,
  Coins,
  Wallet,
  Plus,
  History,
  CreditCard,
  Lock,
  X,
  QrCode,
  Banknote,
} from 'lucide-react';
import { AuthUser } from '../../types';
import {
  updateProfile,
  uploadProfileAvatar,
  getMyLicense,
  requestFreeLicenseKey,
  upgradeSubscriptionPlan,
  type UserLicenseInfo,
  getMyTeam,
  joinTeam,
  type UserTeamInfo,
  getTeamMembers,
  updateTeamMemberStatus,
  type TeamMemberItem,
  getMyWallet,
  upgradeLicenseWithTokens,
  getAdminWallets,
  adminDepositTokens,
  getMyTopUpRequests,
  createTokenTopUpRequest,
  cancelTokenTopUpRequest,
  getAdminTopUpRequests,
  approveTokenTopUpRequest,
  rejectTokenTopUpRequest,
  type UserWalletData,
  type WalletTransactionItem,
  type TokenTopUpRequestItem,
  type TokenTopUpPayment,
  type TopUpConfig,
} from '../../services/api';
import { resizeImageFile } from '../../utils/resizeImageFile';

interface AdminProfilePanelProps {
  currentUser: AuthUser;
  saving: boolean;
  onSavingChange: (loading: boolean) => void;
  onUpdated: (user: AuthUser) => void;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
}

type ProfileTab = 'profile' | 'wallet' | 'license' | 'referral' | 'plans';

const PROFILE_TABS: ProfileTab[] = ['profile', 'wallet', 'license', 'referral', 'plans'];

function readProfileTab(value: string | null): ProfileTab {
  return PROFILE_TABS.includes(value as ProfileTab) ? (value as ProfileTab) : 'profile';
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'Premium Trial',
  premium_trial: 'Premium Trial',
  pro: 'Pro Agent',
  enterprise: 'Enterprise',
  // Internal root-team access, not a purchasable package.
  platform_root: 'Root Team (nội bộ)',
};

function planLabel(plan?: string | null): string {
  if (!plan) return 'Chưa kích hoạt';
  return PLAN_LABELS[plan.toLowerCase()] || plan;
}

const PLAN_BADGE_META: Record<string, { icon: typeof Crown; badgeClass: string }> = {
  trial: { icon: Zap, badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  premium_trial: { icon: Zap, badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  pro: { icon: Sparkles, badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
  enterprise: { icon: Crown, badgeClass: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200' },
  platform_root: { icon: Shield, badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
};

function resolvePlanMeta(plan?: string | null) {
  return PLAN_BADGE_META[(plan || '').toLowerCase()] || {
    icon: Clock,
    badgeClass: 'border-slate-700 bg-slate-800/80 text-slate-300',
  };
}

export default function AdminProfilePanel({
  currentUser,
  saving,
  onSavingChange,
  onUpdated,
  onNotify,
}: AdminProfilePanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState<ProfileTab>(() => readProfileTab(searchParams.get('tab')));

  // Keep the selected tab in the URL so a refresh (or a shared link) reopens
  // the same tab instead of jumping back to "Hồ sơ".
  const setActiveTab = (tab: ProfileTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'profile') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const tabFromUrl = readProfileTab(searchParams.get('tab'));
  useEffect(() => {
    setActiveTabState((prev) => (prev === tabFromUrl ? prev : tabFromUrl));
  }, [tabFromUrl]);
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Wallet & Token states
  const [walletData, setWalletData] = useState<UserWalletData | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionItem[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [adminWallets, setAdminWallets] = useState<Array<UserWalletData & { email?: string; name?: string }>>([]);
  const [adminWalletsLoading, setAdminWalletsLoading] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositTargetUser, setDepositTargetUser] = useState<{ id: string; email?: string; name?: string } | null>(null);
  const [depositAmount, setDepositAmount] = useState<string>('100');
  const [depositNote, setDepositNote] = useState<string>('');
  const [depositing, setDepositing] = useState(false);
  const [upgradingWithToken, setUpgradingWithToken] = useState<string | null>(null);

  // Token top-up states
  const [topUpConfig, setTopUpConfig] = useState<TopUpConfig | null>(null);
  const [planCosts, setPlanCosts] = useState<Record<string, number>>({ pro: 20, enterprise: 100 });
  const [myTopUps, setMyTopUps] = useState<TokenTopUpRequestItem[]>([]);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpTokens, setTopUpTokens] = useState('');
  const [creatingTopUp, setCreatingTopUp] = useState(false);
  const [topUpPayment, setTopUpPayment] = useState<TokenTopUpPayment | null>(null);
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const [copiedPayField, setCopiedPayField] = useState<string | null>(null);
  const [cancellingTopUpId, setCancellingTopUpId] = useState<string | null>(null);
  const [adminTopUps, setAdminTopUps] = useState<TokenTopUpRequestItem[]>([]);
  const [adminTopUpsLoading, setAdminTopUpsLoading] = useState(false);
  const [reviewingTopUpId, setReviewingTopUpId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TokenTopUpRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // License & device states
  const [licenseInfo, setLicenseInfo] = useState<UserLicenseInfo | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [requestingLicenseKey, setRequestingLicenseKey] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  // Team affiliation states
  const [teamInfo, setTeamInfo] = useState<UserTeamInfo | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningTeam, setJoiningTeam] = useState(false);

  // Team members approval states
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

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
    referralCodeToJoin: '',
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
      referralCodeToJoin: '',
    });
  }, [currentUser]);

  // Load license & team info on mount
  useEffect(() => {
    let cancelled = false;
    const fetchLicense = async () => {
      setLicenseLoading(true);
      try {
        const res = await getMyLicense();
        if (!cancelled && res) {
          setLicenseInfo(res);
        }
      } catch {
        /* ignore fallback */
      } finally {
        if (!cancelled) setLicenseLoading(false);
      }
    };

    const fetchTeam = async () => {
      setTeamLoading(true);
      try {
        const res = await getMyTeam();
        if (!cancelled && res) {
          setTeamInfo(res);
          if (res.referredBy) {
            setJoinCodeInput(res.referredBy);
          }
        }
      } catch {
        /* ignore fallback */
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    };

    fetchLicense();
    fetchTeam();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleJoinTeam = async (codeToUse?: string) => {
    const code = (codeToUse || joinCodeInput).trim().toUpperCase();
    if (!code) {
      onNotify('Vui lòng nhập mã giới thiệu để gia nhập team.', 'error');
      return;
    }
    setJoiningTeam(true);
    try {
      const res = await joinTeam(code);
      onNotify(res.message || 'Cập nhật mã giới thiệu và tham gia team thành công!', 'success');
      if (res.user) {
        onUpdated(res.user);
      }
      const refreshedTeam = await getMyTeam();
      setTeamInfo(refreshedTeam);
      setJoinCodeInput('');
      setForm(prev => ({ ...prev, referralCodeToJoin: '' }));
    } catch (err: any) {
      onNotify(err.message || 'Gia nhập team thất bại. Vui lòng kiểm tra lại mã giới thiệu.', 'error');
    } finally {
      setJoiningTeam(false);
    }
  };

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await getTeamMembers();
      if (Array.isArray(res)) {
        setTeamMembers(res);
      }
    } catch {
      setTeamMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchWallet = async () => {
    setWalletLoading(true);
    try {
      const res = await getMyWallet();
      setWalletData(res.wallet);
      setWalletTransactions(res.transactions || []);
      if (res.planCosts) setPlanCosts(res.planCosts);
      if (res.topUpConfig) setTopUpConfig(res.topUpConfig);
    } catch {
      /* ignore */
    } finally {
      setWalletLoading(false);
    }
  };

  const fetchMyTopUps = async () => {
    try {
      const res = await getMyTopUpRequests();
      setMyTopUps(Array.isArray(res) ? res : []);
    } catch {
      setMyTopUps([]);
    }
  };

  const fetchAdminTopUpRequests = async () => {
    if (currentUser.role !== 'owner' && (currentUser as any).roleKey !== 'super_admin') return;
    setAdminTopUpsLoading(true);
    try {
      const res = await getAdminTopUpRequests('pending');
      setAdminTopUps(Array.isArray(res) ? res : []);
    } catch {
      setAdminTopUps([]);
    } finally {
      setAdminTopUpsLoading(false);
    }
  };

  const fetchAdminWallets = async () => {
    if (currentUser.role !== 'owner' && (currentUser as any).roleKey !== 'super_admin') return;
    setAdminWalletsLoading(true);
    try {
      const res = await getAdminWallets();
      setAdminWallets(res || []);
    } catch {
      setAdminWallets([]);
    } finally {
      setAdminWalletsLoading(false);
    }
  };

  useEffect(() => {
    void fetchWallet();
  }, []);

  useEffect(() => {
    if (activeTab === 'referral') {
      void fetchMembers();
    }
    if (activeTab === 'wallet') {
      void fetchWallet();
      void fetchMyTopUps();
      void fetchAdminWallets();
      void fetchAdminTopUpRequests();
    }
  }, [activeTab]);

  const handleAdminDeposit = async () => {
    if (!depositTargetUser) return;
    const num = Number(depositAmount);
    if (isNaN(num) || num === 0) {
      onNotify('Số lượng token phải là số khác 0.', 'error');
      return;
    }
    if (!depositNote.trim()) {
      onNotify('Vui lòng nhập lý do/ghi chú phát sinh giao dịch.', 'error');
      return;
    }

    setDepositing(true);
    try {
      await adminDepositTokens({
        userId: depositTargetUser.id,
        amount: num,
        note: depositNote.trim(),
      });
      onNotify(
        `Giao dịch thành công: ${num > 0 ? 'Cộng' : 'Trừ'} ${Math.abs(num)} token cho ${depositTargetUser.email || depositTargetUser.id}!`,
        'success'
      );
      setDepositModalOpen(false);
      setDepositNote('');
      void fetchWallet();
      void fetchAdminWallets();
    } catch (err: any) {
      onNotify(err.message || 'Giao dịch token thất bại.', 'error');
    } finally {
      setDepositing(false);
    }
  };

  const handleUpgradeWithToken = async (plan: 'pro' | 'enterprise') => {
    setUpgradingWithToken(plan);
    try {
      const res = await upgradeLicenseWithTokens(plan, 30);
      setLicenseInfo((prev: any) => ({
        ...prev,
        hasKey: true,
        plan: res.plan,
        licenseKey: res.licenseKey,
        expiresAt: res.expiresAt,
        features: res.features,
      }));
      onNotify(`Chúc mừng! Bạn đã nâng cấp thành công lên gói ${plan.toUpperCase()} bằng ${res.cost} Token!`, 'success');
      void fetchWallet();
    } catch (err: any) {
      onNotify(err.message || 'Nâng cấp bằng token thất bại. Vui lòng kiểm tra số dư ví.', 'error');
    } finally {
      setUpgradingWithToken(null);
    }
  };

  const tokenRateVnd = topUpConfig?.tokenRateVnd ?? 10000;
  const minTopUpTokens = topUpConfig?.minTokens ?? 10;
  const topUpTokensNumber = Number(topUpTokens);
  const topUpAmountVnd = Number.isFinite(topUpTokensNumber) && topUpTokensNumber > 0
    ? topUpTokensNumber * tokenRateVnd
    : 0;

  const missingTokensForPlan = (plan: 'pro' | 'enterprise') =>
    Math.max(0, (planCosts[plan] ?? 0) - (walletData?.availableBalance ?? 0));

  const openTopUpModal = (presetTokens?: number) => {
    setTopUpPayment(null);
    setQrImageFailed(false);
    setCopiedPayField(null);
    setTopUpTokens(presetTokens && presetTokens > 0 ? String(presetTokens) : '');
    setTopUpModalOpen(true);
  };

  const copyPayField = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPayField(field);
      setTimeout(() => setCopiedPayField((prev) => (prev === field ? null : prev)), 2000);
    } catch {
      onNotify('Không copy được, vui lòng chọn và sao chép thủ công.', 'error');
    }
  };

  const handleCreateTopUp = async () => {
    if (!Number.isInteger(topUpTokensNumber) || topUpTokensNumber <= 0) {
      onNotify('Số token cần nạp phải là số nguyên dương.', 'error');
      return;
    }
    if (topUpTokensNumber < minTopUpTokens) {
      onNotify(`Số token nạp tối thiểu là ${minTopUpTokens} token.`, 'error');
      return;
    }
    if (topUpConfig && topUpTokensNumber > topUpConfig.maxTokens) {
      onNotify(`Số token nạp tối đa mỗi yêu cầu là ${topUpConfig.maxTokens} token.`, 'error');
      return;
    }

    setCreatingTopUp(true);
    try {
      const res = await createTokenTopUpRequest(topUpTokensNumber);
      setTopUpPayment(res.payment);
      setQrImageFailed(false);
      onNotify(
        `Đã tạo yêu cầu nạp ${res.request.tokens} token (${res.request.amountVnd.toLocaleString('vi-VN')}đ). Nội dung chuyển khoản: ${res.request.code}.`,
        'success'
      );
      void fetchMyTopUps();
      void fetchAdminTopUpRequests();
    } catch (err: any) {
      onNotify(err.message || 'Không tạo được yêu cầu nạp token.', 'error');
    } finally {
      setCreatingTopUp(false);
    }
  };

  const handleCancelTopUp = async (requestId: string) => {
    setCancellingTopUpId(requestId);
    try {
      await cancelTokenTopUpRequest(requestId);
      onNotify('Đã hủy yêu cầu nạp token.', 'success');
      void fetchMyTopUps();
      void fetchAdminTopUpRequests();
    } catch (err: any) {
      onNotify(err.message || 'Không hủy được yêu cầu nạp token.', 'error');
    } finally {
      setCancellingTopUpId(null);
    }
  };

  const handleApproveTopUp = async (request: TokenTopUpRequestItem) => {
    setReviewingTopUpId(request.id);
    try {
      await approveTokenTopUpRequest(request.id);
      onNotify(`Đã cộng ${request.tokens} token cho ${request.email || request.name || 'người dùng'} (mã ${request.code}).`, 'success');
      void fetchAdminTopUpRequests();
      void fetchAdminWallets();
      void fetchMyTopUps();
      void fetchWallet();
    } catch (err: any) {
      onNotify(err.message || 'Không duyệt được yêu cầu nạp token.', 'error');
    } finally {
      setReviewingTopUpId(null);
    }
  };

  const handleRejectTopUp = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      onNotify('Vui lòng nhập lý do từ chối.', 'error');
      return;
    }

    setReviewingTopUpId(rejectTarget.id);
    try {
      await rejectTokenTopUpRequest(rejectTarget.id, rejectReason.trim());
      onNotify(`Đã từ chối yêu cầu nạp ${rejectTarget.code}.`, 'success');
      setRejectTarget(null);
      setRejectReason('');
      void fetchAdminTopUpRequests();
      void fetchMyTopUps();
    } catch (err: any) {
      onNotify(err.message || 'Không từ chối được yêu cầu nạp token.', 'error');
    } finally {
      setReviewingTopUpId(null);
    }
  };

  const handleUpdateMemberStatus = async (    userId: string,
    newStatus: 'approved' | 'suspended' | 'pending'
  ) => {
    setUpdatingMemberId(userId);
    try {
      await updateTeamMemberStatus(userId, newStatus);
      const actionLabel =
        newStatus === 'approved'
          ? 'Duyệt thành viên vào team thành công!'
          : newStatus === 'pending'
          ? 'Đã chuyển về trạng thái chờ duyệt!'
          : 'Đã tạm đình chỉ thành viên!';
      onNotify(actionLabel, 'success');
      setTeamMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, status: newStatus } : m))
      );
    } catch (err: any) {
      onNotify(err.message || 'Cập nhật trạng thái thành viên thất bại.', 'error');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const pendingTeamMembersCount = teamMembers.filter((m) => m.status === 'pending').length;

  const isSuperAdmin = currentUser.role === 'owner' || currentUser.roleKey === 'super_admin';
  const publicProfileUrl = currentUser.public_slug ? `/moi-gioi/${currentUser.public_slug}` : '';
  const referralCode =
    currentUser.referral_code ||
    `REF-${(currentUser.id || 'AGENT').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const referralLink = `${origin}/dang-ky?ref=${referralCode}`;

  const handleCopy = (text: string, keyName: string, successMsg: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      onNotify(successMsg, 'success');
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  const handleRequestFreeKey = async () => {
    setRequestingLicenseKey(true);
    try {
      const res = await requestFreeLicenseKey();
      setLicenseInfo(res);
      if (res.expired) {
        onNotify('Premium Trial đã hết hạn. Đây là key duy nhất của tài khoản — vui lòng nâng cấp gói để tiếp tục.', 'info');
      } else if (res.hasExistingKey) {
        onNotify('Đã mở lại key duy nhất của tài khoản bạn.', 'success');
      } else {
        onNotify('Đã tạo Khóa Bản Quyền Premium Trial (3 ngày)!', 'success');
      }
    } catch (err: any) {
      onNotify(err.message || 'Không thể cấp khóa bản quyền. Vui lòng thử lại.', 'error');
    } finally {
      setRequestingLicenseKey(false);
    }
  };

  const handleUpgradePlan = async (plan: 'pro' | 'enterprise') => {
    if (!isSuperAdmin) {
      onNotify(
        'Gói trả phí được kích hoạt thủ công sau khi Admin xác nhận chuyển khoản. Vui lòng liên hệ Super Admin để được cấp gói.',
        'info',
      );
      return;
    }
    setUpgradingPlan(plan);
    try {
      const res = await upgradeSubscriptionPlan(plan, 30);
      setLicenseInfo(prev => ({
        ...prev,
        hasKey: true,
        plan: res.plan,
        licenseKey: res.licenseKey,
        maxDevices: res.maxDevices,
        expiresAt: res.expiresAt,
        features: res.features,
      }));
      onNotify(`Chúc mừng! Bạn đã nâng cấp thành công lên gói ${plan.toUpperCase()}!`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Nâng cấp gói thất bại. Vui lòng liên hệ Admin.', 'error');
    } finally {
      setUpgradingPlan(null);
    }
  };

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
        referral_code_to_join: form.referralCodeToJoin.trim() || undefined,
      });
      onUpdated(updated);
      if (form.referralCodeToJoin.trim()) {
        const refreshedTeam = await getMyTeam();
        setTeamInfo(refreshedTeam);
      }
      setForm(prev => ({
        ...prev,
        referralCodeToJoin: '',
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

  const rawPlan = licenseInfo?.plan || (currentUser.role === 'owner' ? 'enterprise' : '');
  const currentPlan = rawPlan.toLowerCase();
  const isTrialPlan = currentPlan === 'trial' || currentPlan === 'premium_trial';
  const planBadge = resolvePlanMeta(rawPlan);
  const PlanBadgeIcon = planBadge.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <UserCircle className="h-6 w-6 text-rose-400" />
            Quản lý tài khoản & Hồ sơ
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Thiết lập hồ sơ cá nhân, ví token, quản lý khóa Desktop Agent, lấy mã giới thiệu và nâng cấp gói Premium.
          </p>
        </div>

        {walletData && (
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-xl shadow-sm">
            <Coins className="w-5 h-5 text-amber-400 animate-pulse" />
            <div className="text-xs leading-tight">
              <span className="text-slate-400 block text-2xs uppercase tracking-wider font-semibold">Số dư Ví Token</span>
              <span className="font-bold text-amber-300 font-mono text-sm">{walletData.availableBalance.toLocaleString()} Token</span>
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Sub-menu Navigation */}
      <div className="border-b border-slate-800">
        <nav className="flex flex-wrap items-center gap-2 pb-3">
          {[
            { id: 'profile', label: 'Hồ sơ & Bảo mật', icon: UserCircle },
            {
              id: 'wallet',
              label: 'Ví Token (Wallet)',
              icon: Wallet,
              badge: walletData ? `${walletData.availableBalance.toLocaleString()} Token` : undefined,
            },
            { id: 'license', label: 'Khóa & Thiết bị', icon: Key },
            { id: 'referral', label: 'Mã giới thiệu', icon: Share2 },
            { id: 'plans', label: 'Gói Premium', icon: Crown },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ProfileTab)}
                className={`flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                  isActive
                    ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/40'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left Column: Quick Profile & Summary */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 space-y-4 h-fit">
          <div className="relative mx-auto h-28 w-28">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt={currentUser.name}
                className="h-28 w-28 rounded-full object-cover ring-2 ring-rose-500/30"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-3xl font-bold text-rose-300">
                {currentUser.name.trim().charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <label className="absolute bottom-0 right-0 cursor-pointer rounded-full border border-slate-700 bg-slate-950 p-2 text-slate-300 hover:text-white transition-colors">
              <ImageIcon className="h-4 w-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAvatarUpload(e.target.files)}
              />
            </label>
          </div>
          <p className="text-center text-2xs text-slate-500">
            {uploadingAvatar ? 'Đang upload avatar...' : 'Bấm biểu tượng ảnh để đổi avatar'}
          </p>

          <div className="text-center space-y-2">
            <p className="font-bold text-white text-base">{currentUser.name}</p>
            <span
              className={`mx-auto inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${planBadge.badgeClass}`}
              title={`Gói hiện tại: ${planLabel(rawPlan)}`}
            >
              <PlanBadgeIcon className="h-4 w-4" />
              {planLabel(rawPlan)}
            </span>
            <p className="text-xs text-slate-500">{currentUser.email}</p>
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
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
              <span className="text-slate-500">Đội ngũ (Team)</span>
              <span className="font-semibold text-slate-200 truncate max-w-[150px]">
                {teamInfo?.inTeam
                  ? (teamInfo.team?.leadName || 'Platform Team')
                  : 'Chưa tham gia'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
              <span className="text-slate-500">Gói hiện tại</span>
              <span className="inline-flex items-center gap-1 font-bold text-amber-400 uppercase text-2xs px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/50">
                <PlanBadgeIcon className="w-3 h-3" />
                {planLabel(rawPlan)}
              </span>
            </div>
          </div>

          {/* Quick Referral Box */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-amber-300 font-semibold">
              <span className="flex items-center gap-1">
                <Share2 className="w-3.5 h-3.5 text-amber-400" /> Mã giới thiệu
              </span>
              <button
                type="button"
                onClick={() => handleCopy(referralCode, 'quick-ref', 'Đã sao chép mã giới thiệu!')}
                className="inline-flex min-h-6 items-center gap-0.5 text-2xs font-bold text-amber-400 underline hover:text-white"
              >
                {copiedKey === 'quick-ref' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy
              </button>
            </div>
            <div className="font-mono font-bold text-sm text-white tracking-wider bg-slate-950 px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-center select-all">
              {referralCode}
            </div>
          </div>

          {form.showPublicProfile && publicProfileUrl && (
            <a
              href={publicProfileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-slate-900 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Xem hồ sơ công khai
            </a>
          )}
        </div>

        {/* Right Column: Tab Content */}
        <div className="space-y-6">
          {/* TAB 1: Profile & Security */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 space-y-5">
              <div className="border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-rose-400" />
                  Thông tin cá nhân & Hiển thị công khai
                </h3>
                <p className="text-2xs text-slate-500">Cập nhật hồ sơ môi giới của bạn hiển thị trên website và mạng xã hội.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Họ tên</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Email đăng nhập</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Số điện thoại</label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Đường dẫn hồ sơ công khai (Slug)</label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      value={form.publicSlug}
                      onChange={(e) => setForm({ ...form, publicSlug: e.target.value })}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
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
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                    placeholder="Kinh nghiệm, khu vực chuyên môn, phong cách tư vấn..."
                  />
                  <p className="text-2xs text-slate-500">{form.bio.length}/600 ký tự — hiển thị trên hồ sơ công khai</p>
                </div>
                <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-300 cursor-pointer hover:bg-slate-950/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.showPublicProfile}
                    onChange={(e) => setForm({ ...form, showPublicProfile: e.target.checked })}
                    className="accent-rose-600 rounded cursor-pointer"
                  />
                  Hiển thị hồ sơ công khai trên website (trang môi giới + tin BĐS)
                </label>
              </div>

              {/* Đội ngũ & Mã người giới thiệu (Team) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Users className="h-4 w-4 text-amber-400" />
                    Đội ngũ & Người giới thiệu (Team)
                  </div>
                  {teamInfo?.inTeam && (
                    <span className="inline-flex items-center gap-1 text-2xs px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 font-bold">
                      <UserCheck className="w-3 h-3 text-emerald-400" />
                      Đã tham gia Team
                    </span>
                  )}
                </div>

                {teamInfo?.inTeam ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-400" />
                        Leader / Trưởng nhóm:{' '}
                        <span className="text-white font-bold">{teamInfo.team?.leadName || 'Platform Leader'}</span>
                        {teamInfo.team?.leadEmail && (
                          <span className="text-slate-400 font-normal"> ({teamInfo.team.leadEmail})</span>
                        )}
                      </p>
                      <p className="text-2xs text-slate-400">
                        Mã giới thiệu đội ngũ: <span className="font-mono text-amber-300 font-bold">{teamInfo.team?.referralCode || currentUser.referred_by || 'N/A'}</span>
                        {teamInfo.membership?.joinedAt && (
                          <span> • Gia nhập ngày: {new Date(teamInfo.membership.joinedAt).toLocaleDateString('vi-VN')}</span>
                        )}
                      </p>
                    </div>
                    <span className="text-2xs text-emerald-400/90 font-medium px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/40">
                      Vai trò: {teamInfo.membership?.role === 'lead' ? 'Trưởng nhóm' : 'Thành viên'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-2xs text-slate-400">
                      Nếu lúc tạo tài khoản chưa nhập mã giới thiệu của người hướng dẫn (Trưởng nhóm / Leader), bạn có thể cập nhật mã vào ô bên dưới và bấm <strong>Gia nhập Team</strong> hoặc <strong>Lưu hồ sơ</strong> để được thêm vào đội ngũ.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Users className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          value={form.referralCodeToJoin}
                          onChange={(e) => setForm({ ...form, referralCodeToJoin: e.target.value.toUpperCase() })}
                          placeholder="Nhập mã giới thiệu người hướng dẫn (VD: REF-ABC123)"
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs font-mono text-amber-300 uppercase placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={joiningTeam || !form.referralCodeToJoin.trim()}
                        onClick={() => handleJoinTeam(form.referralCodeToJoin)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all disabled:opacity-40 active:scale-95 shadow shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {joiningTeam ? 'Đang thêm...' : 'Gia nhập Team'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Password change section */}
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
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                    placeholder="Mật khẩu hiện tại"
                  />
                  <input
                    type="password"
                    value={form.newPassword}
                    onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                    placeholder="Mật khẩu mới"
                  />
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500 transition-colors"
                    placeholder="Xác nhận mật khẩu mới"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || uploadingAvatar}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-rose-500 disabled:opacity-50 shadow-md active:scale-95"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Đang lưu...' : 'Lưu hồ sơ cá nhân'}
                </button>
              </div>
            </form>
          )}

          {/* TAB: Wallet & Tokens */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              {/* Wallet Overview Cards */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-semibold">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                      Ví Token Hệ Thống House & Life
                    </div>
                    <h3 className="text-lg font-bold text-white">Quản Lý Số Dư & Giao Dịch Token</h3>
                    <p className="text-xs text-slate-400">
                      Tỷ lệ quy đổi: <strong>1 Token = {tokenRateVnd.toLocaleString('vi-VN')}đ</strong>. Nạp token bằng chuyển khoản QR, admin xác nhận và cộng vào ví. Dùng token để nâng cấp Key Agent lên Pro / Enterprise.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openTopUpModal()}
                      className="inline-flex min-h-11 items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white transition-all shadow-md active:scale-95"
                    >
                      <QrCode className="w-4 h-4" />
                      Mua Token
                    </button>
                    <button
                      type="button"
                      onClick={fetchWallet}
                      disabled={walletLoading}
                      className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${walletLoading ? 'animate-spin' : ''}`} />
                      Làm mới số dư
                    </button>
                  </div>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Available Balance */}
                  <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-950 p-4 space-y-2 relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Số dư khả dụng</span>
                      <Coins className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-emerald-300 font-mono tracking-tight">
                      {(walletData?.availableBalance ?? 0).toLocaleString()} <span className="text-sm font-sans font-normal text-emerald-400/80">Token</span>
                    </div>
                    <p className="text-2xs text-slate-400">Sẵn sàng sử dụng cho nâng cấp hoặc dịch vụ</p>
                  </div>

                  {/* Locked Balance */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Số dư tạm khóa</span>
                      <Lock className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-black text-amber-300 font-mono tracking-tight">
                      {(walletData?.lockedBalance ?? 0).toLocaleString()} <span className="text-sm font-sans font-normal text-amber-400/80">Token</span>
                    </div>
                    <p className="text-2xs text-slate-400">Khóa trong quá trình thực hiện giao dịch / pending</p>
                  </div>

                  {/* Total Balance */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Tổng số dư</span>
                      <CreditCard className="w-4 h-4 text-sky-400" />
                    </div>
                    <div className="text-2xl font-black text-white font-mono tracking-tight">
                      {(walletData?.balance ?? 0).toLocaleString()} <span className="text-sm font-sans font-normal text-slate-400">Token</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Trạng thái: Ví đang hoạt động (Active)</span>
                    </div>
                  </div>
                </div>

                {/* Fast Action: Upgrade Key using Token */}
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-rose-400" /> Nâng cấp Key Bản Quyền bằng Token Ví
                    </h4>
                    <p className="text-2xs text-slate-400">
                      Gói Pro (30 ngày): <strong>{planCosts.pro} Token</strong> • Gói Enterprise (30 ngày): <strong>{planCosts.enterprise} Token</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={upgradingWithToken !== null || (walletData?.availableBalance ?? 0) < (planCosts.pro ?? 0)}
                      onClick={() => handleUpgradeWithToken('pro')}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {upgradingWithToken === 'pro' ? 'Đang nâng cấp...' : `Nâng Pro (${planCosts.pro} Token)`}
                    </button>
                    <button
                      type="button"
                      disabled={upgradingWithToken !== null || (walletData?.availableBalance ?? 0) < (planCosts.enterprise ?? 0)}
                      onClick={() => handleUpgradeWithToken('enterprise')}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      {upgradingWithToken === 'enterprise' ? 'Đang nâng cấp...' : `Nâng Enterprise (${planCosts.enterprise} Token)`}
                    </button>
                    {(walletData?.availableBalance ?? 0) < (planCosts.enterprise ?? 0) && (
                      <button
                        type="button"
                        onClick={() => openTopUpModal(missingTokensForPlan((walletData?.availableBalance ?? 0) < (planCosts.pro ?? 0) ? 'pro' : 'enterprise'))}
                        className="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        Mua thêm token
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* User Token Top-Up Requests */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      Yêu Cầu Nạp Token Của Tôi
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Yêu cầu chờ admin đối chiếu chuyển khoản. Token chỉ được cộng sau khi admin xác nhận.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchMyTopUps}
                    className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-300 hover:text-white"
                  >
                    Làm mới
                  </button>
                </div>

                {myTopUps.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    Chưa có yêu cầu nạp token nào. Bấm “Mua Token” để tạo yêu cầu.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Mã yêu cầu</th>
                          <th className="py-2.5 px-3">Thời gian</th>
                          <th className="py-2.5 px-3">Token</th>
                          <th className="py-2.5 px-3">Số tiền</th>
                          <th className="py-2.5 px-3">Trạng thái</th>
                          <th className="py-2.5 px-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {myTopUps.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-white">{req.code}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                              {new Date(req.createdAt).toLocaleString('vi-VN')}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-emerald-300">+{req.tokens}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">{req.amountVnd.toLocaleString('vi-VN')}đ</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold border ${
                                req.status === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : req.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  : req.status === 'rejected'
                                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}>
                                {req.status === 'approved'
                                  ? 'Đã cộng token'
                                  : req.status === 'pending'
                                  ? 'Chờ admin xác nhận'
                                  : req.status === 'rejected'
                                  ? 'Bị từ chối'
                                  : 'Đã hủy'}
                              </span>
                              {req.status === 'rejected' && req.note && (
                                <p className="text-2xs text-rose-300/80 mt-1 max-w-xs">{req.note}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {req.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelTopUp(req.id)}
                                  disabled={cancellingTopUpId === req.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-2xs font-semibold disabled:opacity-50"
                                >
                                  {cancellingTopUpId === req.id ? 'Đang hủy...' : 'Hủy yêu cầu'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SUPER ADMIN: Token Management & Deposit to Users */}
              {(currentUser.role === 'owner' || (currentUser as any).roleKey === 'super_admin') && (
                <div className="rounded-2xl border border-sky-500/30 bg-slate-900/40 p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Shield className="w-4 h-4 text-sky-400" />
                        Quản trị Ví & Nạp Token cho Thành viên (Super Admin)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Cộng token trực tiếp khi người dùng phát sinh giao dịch hoặc điều chỉnh số dư ví.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fetchAdminWallets}
                      disabled={adminWalletsLoading}
                      className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-300 hover:text-white"
                    >
                      Làm mới DS ví
                    </button>
                  </div>

                  {/* Pending token top-up requests */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 text-emerald-400" />
                          Yêu Cầu Nạp Token Chờ Duyệt
                        </h5>
                        <p className="text-2xs text-slate-400 mt-0.5">
                          Đối chiếu sao kê ngân hàng với mã nội dung trước khi cộng token. Hệ thống chỉ cộng một lần.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={fetchAdminTopUpRequests}
                        disabled={adminTopUpsLoading}
                        className="inline-flex min-h-9 items-center px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-2xs text-slate-300 hover:text-white disabled:opacity-50"
                      >
                        {adminTopUpsLoading ? 'Đang tải...' : 'Làm mới yêu cầu'}
                      </button>
                    </div>

                    {adminTopUps.length === 0 ? (
                      <div className="py-4 text-center text-2xs text-slate-500">
                        Không có yêu cầu nạp token nào đang chờ duyệt.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Mã</th>
                              <th className="py-2 px-3">Người dùng</th>
                              <th className="py-2 px-3">Token</th>
                              <th className="py-2 px-3">Số tiền</th>
                              <th className="py-2 px-3">Thời gian</th>
                              <th className="py-2 px-3 text-right">Duyệt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                            {adminTopUps.map((req) => (
                              <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="py-2 px-3 font-mono font-bold text-white">{req.code}</td>
                                <td className="py-2 px-3">
                                  <span className="text-slate-200 font-semibold">{req.name || req.email || req.userId}</span>
                                  {req.email && req.name && (
                                    <span className="block text-2xs text-slate-500 font-mono">{req.email}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono text-emerald-300">+{req.tokens}</td>
                                <td className="py-2 px-3 font-mono text-slate-300">{req.amountVnd.toLocaleString('vi-VN')}đ</td>
                                <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                                  {new Date(req.createdAt).toLocaleString('vi-VN')}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleApproveTopUp(req)}
                                      disabled={reviewingTopUpId === req.id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-2xs font-bold disabled:opacity-50"
                                    >
                                      {reviewingTopUpId === req.id ? 'Đang xử lý...' : 'Đã nhận tiền'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setRejectTarget(req); setRejectReason(''); }}
                                      disabled={reviewingTopUpId === req.id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 text-2xs font-bold disabled:opacity-50"
                                    >
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

                  {adminWalletsLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400">Đang tải danh sách ví người dùng...</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">Thành viên</th>
                            <th className="py-2.5 px-3">Email</th>
                            <th className="py-2.5 px-3">Số dư (Token)</th>
                            <th className="py-2.5 px-3">Tạm khóa</th>
                            <th className="py-2.5 px-3 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                          {adminWallets.map((w) => (
                            <tr key={w.userId} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-3 font-semibold text-white">{w.name || w.userId}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-mono">{w.email || '-'}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">{w.balance.toLocaleString()}</td>
                              <td className="py-2.5 px-3 font-mono text-amber-400">{w.lockedBalance.toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDepositTargetUser({ id: w.userId, email: w.email, name: w.name });
                                    setDepositAmount('100');
                                    setDepositNote('');
                                    setDepositModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 hover:bg-sky-600 hover:text-white text-xs font-semibold transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Nạp / Điều chỉnh Token
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Transaction History */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-rose-400" />
                    Lịch sử Giao dịch Token (Transactions Audit)
                  </h4>
                  <span className="text-2xs text-slate-500 font-mono">Bảo mật transaction & chống trùng lặp</span>
                </div>

                {walletTransactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Chưa có giao dịch token nào phát sinh trong ví của bạn.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Thời gian</th>
                          <th className="py-2.5 px-3">Loại giao dịch</th>
                          <th className="py-2.5 px-3">Số lượng</th>
                          <th className="py-2.5 px-3">Số dư sau GD</th>
                          <th className="py-2.5 px-3">Lý do / Ghi chú</th>
                          <th className="py-2.5 px-3 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {walletTransactions.map((tx) => {
                          const isPositive = tx.amount > 0;
                          return (
                            <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                                {new Date(tx.createdAt).toLocaleString('vi-VN')}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${
                                  tx.type === 'admin_deposit'
                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                    : tx.type === 'license_upgrade'
                                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                    : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {tx.type === 'admin_deposit' ? 'Admin nạp token' : tx.type === 'license_upgrade' ? 'Nâng cấp bản quyền' : tx.type === 'admin_deduct' ? 'Admin trừ token' : tx.type}
                                </span>
                              </td>
                              <td className={`py-2.5 px-3 font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-300">
                                {tx.balanceAfter.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate" title={tx.note}>
                                {tx.note}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-2xs font-medium">
                                  <Check className="w-3 h-3" /> Thành công
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Admin Deposit Modal */}
              {depositModalOpen && depositTargetUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                  <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Coins className="w-4 h-4 text-sky-400" />
                        Cộng / Trừ Token Người Dùng
                      </h4>
                      <button
                        type="button"
                        onClick={() => setDepositModalOpen(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-slate-500 block">Người nhận:</span>
                        <span className="font-bold text-white block">{depositTargetUser.name || 'Thành viên'}</span>
                        <span className="text-slate-400 font-mono text-2xs">{depositTargetUser.email || depositTargetUser.id}</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Số lượng Token (+ để nạp, - để trừ):</label>
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="Ví dụ: 200 hoặc -50"
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Lý do / Ghi chú giao dịch (Bắt buộc):</label>
                        <textarea
                          rows={3}
                          value={depositNote}
                          onChange={(e) => setDepositNote(e.target.value)}
                          placeholder="Ví dụ: Thưởng hoa hồng giao dịch BĐS đất nền Nam Hòa Xuân #204..."
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white focus:border-sky-500 focus:outline-none resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setDepositModalOpen(false)}
                        disabled={depositing}
                        className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleAdminDeposit}
                        disabled={depositing}
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {depositing ? 'Đang giao dịch...' : 'Xác nhận giao dịch'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Token Top-Up Modal */}
              {topUpModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
                  <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl my-8">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-emerald-400" />
                        {topUpPayment ? 'Quét QR để nạp Token' : 'Mua Token'}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setTopUpModalOpen(false)}
                        className="text-slate-400 hover:text-white"
                        aria-label="Đóng"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {!topUpPayment ? (
                      <div className="space-y-3 text-xs">
                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1">
                          <p className="text-slate-300">
                            Tỷ lệ quy đổi: <strong className="text-emerald-300">1 Token = {tokenRateVnd.toLocaleString('vi-VN')}đ</strong>
                          </p>
                          <p className="text-slate-500">
                            Nạp tối thiểu {minTopUpTokens} token. Sau khi chuyển khoản, admin sẽ đối chiếu và cộng token vào ví.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Số token cần nạp:</label>
                          <input
                            type="number"
                            min={minTopUpTokens}
                            step={1}
                            value={topUpTokens}
                            onChange={(e) => setTopUpTokens(e.target.value)}
                            placeholder={`Ví dụ: ${Math.max(minTopUpTokens, planCosts.pro ?? 20)}`}
                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-white font-mono focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        {(['pro', 'enterprise'] as const).map((plan) => {
                          const missing = missingTokensForPlan(plan);
                          if (missing <= 0) return null;
                          return (
                            <button
                              key={plan}
                              type="button"
                              onClick={() => setTopUpTokens(String(Math.max(missing, minTopUpTokens)))}
                              className="w-full text-left px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 hover:border-emerald-500/50 hover:bg-emerald-950/20 text-slate-300 transition-all"
                            >
                              Còn thiếu <strong className="text-emerald-300">{missing} token</strong> để đủ nâng gói {plan === 'pro' ? 'Pro' : 'Enterprise'}
                              <span className="text-slate-500"> — bấm để điền nhanh</span>
                            </button>
                          );
                        })}

                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 flex items-center justify-between">
                          <span className="text-slate-400">Số tiền cần chuyển:</span>
                          <span className="text-lg font-black text-emerald-300 font-mono">
                            {topUpAmountVnd.toLocaleString('vi-VN')}đ
                          </span>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => setTopUpModalOpen(false)}
                            className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateTopUp}
                            disabled={creatingTopUp}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {creatingTopUp ? 'Đang tạo...' : 'Tạo mã QR chuyển khoản'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs">
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
                          <p className="text-slate-300">
                            Yêu cầu <strong className="text-white">{topUpPayment.code}</strong> đã được tạo.
                            Vui lòng chuyển <strong className="text-emerald-300">{topUpPayment.amountVnd.toLocaleString('vi-VN')}đ</strong> để nhận {topUpPayment.tokens} token.
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-white p-3">
                          {qrImageFailed ? (
                            <div className="w-full max-w-[300px] rounded-lg bg-slate-100 p-3 text-center space-y-2">
                              <p className="text-xs font-semibold text-slate-700">
                                Không tải được ảnh QR
                              </p>
                              <p className="text-2xs text-slate-500">
                                Vui lòng chuyển khoản theo thông tin bên dưới hoặc mở mã QR ở tab mới.
                              </p>
                              <a
                                href={topUpPayment.qrUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 underline"
                              >
                                Mở mã QR
                              </a>
                            </div>
                          ) : (
                            <img
                              src={topUpPayment.qrUrl}
                              alt={`QR chuyển khoản ${topUpPayment.code}`}
                              className="w-full max-w-[260px] h-auto"
                              onError={() => setQrImageFailed(true)}
                            />
                          )}
                          <span className="text-2xs text-slate-500 text-center">
                            Quét bằng app ngân hàng (VietQR). Nếu ảnh không hiển thị, chuyển khoản theo thông tin bên dưới.
                          </span>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                          {[
                            { key: 'bank', label: 'Ngân hàng', value: `${topUpPayment.bank.bankName} (${topUpPayment.bank.bankBin})` },
                            { key: 'account', label: 'Số tài khoản', value: topUpPayment.bank.accountNumber },
                            { key: 'owner', label: 'Chủ tài khoản', value: topUpPayment.bank.accountName },
                            { key: 'amount', label: 'Số tiền', value: `${topUpPayment.amountVnd.toLocaleString('vi-VN')}đ` },
                            { key: 'code', label: 'Nội dung chuyển khoản', value: topUpPayment.code },
                          ].map((row) => (
                            <div key={row.key} className="flex items-center justify-between gap-2">
                              <span className="text-slate-500">{row.label}</span>
                              <span className="flex items-center gap-1.5 min-w-0">
                                <strong className="text-white font-mono truncate">{row.value}</strong>
                                <button
                                  type="button"
                                  onClick={() => copyPayField(row.key, row.value)}
                                  className="text-slate-400 hover:text-white shrink-0"
                                  aria-label={`Copy ${row.label}`}
                                >
                                  {copiedPayField === row.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>

                        <p className="text-2xs text-amber-300/90 flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          Chuyển đúng số tiền và đúng nội dung <strong>{topUpPayment.code}</strong> để admin đối chiếu. Sai nội dung có thể làm chậm việc cộng token.
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setTopUpPayment(null);
                              setTopUpTokens('');
                            }}
                            className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                          >
                            Tạo yêu cầu khác
                          </button>
                          <button
                            type="button"
                            onClick={() => setTopUpModalOpen(false)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
                          >
                            Tôi đã chuyển khoản
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reject Top-Up Modal */}
              {rejectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                  <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <X className="w-4 h-4 text-rose-400" />
                        Từ chối yêu cầu {rejectTarget.code}
                      </h4>
                      <button
                        type="button"
                        onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                        className="text-slate-400 hover:text-white"
                        aria-label="Đóng"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      {rejectTarget.email || rejectTarget.name || rejectTarget.userId} • {rejectTarget.tokens} token • {rejectTarget.amountVnd.toLocaleString('vi-VN')}đ
                    </p>
                    <div className="space-y-1 text-xs">
                      <label className="text-slate-300 font-semibold block">Lý do từ chối (bắt buộc):</label>
                      <textarea
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Ví dụ: Chưa nhận được chuyển khoản / Sai số tiền / Sai nội dung..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white focus:border-rose-500 focus:outline-none resize-none"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                        disabled={reviewingTopUpId === rejectTarget.id}
                        className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleRejectTopUp}
                        disabled={reviewingTopUpId === rejectTarget.id}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                      >
                        {reviewingTopUpId === rejectTarget.id ? 'Đang xử lý...' : 'Từ chối yêu cầu'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Referral System */}
          {activeTab === 'referral' && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 space-y-6">
              <div className="border-b border-slate-800 pb-4 space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-800/40 text-amber-300 text-xs font-semibold">
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  Chương trình Giới thiệu Đối tác & Sales
                </div>
                <h3 className="text-lg font-bold text-white">Mã Giới Thiệu & Liên Kết Đăng Ký</h3>
                <p className="text-xs text-slate-400">
                  Chia sẻ mã hoặc đường link này để mời môi giới, cộng tác viên tham gia mạng lưới House & Life.
                </p>
              </div>

              {/* Referral Code Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-amber-500/30 bg-slate-950/90 p-4 space-y-3">
                  <span className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                    <span>Mã giới thiệu của bạn</span>
                    <span className="text-amber-400 text-2xs font-bold uppercase">Có hiệu lực vĩnh viễn</span>
                  </span>
                  <div className="flex items-center justify-between bg-slate-900 border border-amber-500/40 rounded-xl px-4 py-3">
                    <span className="font-mono text-xl font-extrabold text-amber-300 tracking-wider">
                      {referralCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(referralCode, 'ref-code', 'Đã sao chép mã giới thiệu!')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 transition-all active:scale-95"
                    >
                      {copiedKey === 'ref-code' ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" /> Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" /> Sao chép mã
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Referral Link Box */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 space-y-3">
                  <span className="text-xs font-semibold text-slate-400">Đường link đăng ký trực tiếp</span>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <input
                      readOnly
                      value={referralLink}
                      className="w-full bg-transparent text-xs text-slate-300 font-mono outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(referralLink, 'ref-link', 'Đã sao chép link đăng ký giới thiệu!')}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all active:scale-95"
                    >
                      {copiedKey === 'ref-link' ? (
                        <>
                          <Check className="w-4 h-4 text-white" /> Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" /> Sao chép Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Đội ngũ hiện tại & Nhập mã để Gia nhập Team */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-rose-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Đội Ngũ (Team) & Người Hướng Dẫn
                    </h4>
                  </div>
                  {teamInfo?.inTeam ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-2xs font-bold">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Đang thuộc Team
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/40 text-amber-300 text-2xs font-semibold">
                      Chưa tham gia Team
                    </span>
                  )}
                </div>

                {teamInfo?.inTeam ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-3 space-y-1">
                        <span className="text-2xs text-slate-500 font-medium">Trưởng nhóm (Leader)</span>
                        <p className="font-bold text-white truncate">{teamInfo.team?.leadName || 'Platform Lead'}</p>
                      </div>
                      <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-3 space-y-1">
                        <span className="text-2xs text-slate-500 font-medium">Email Leader</span>
                        <p className="font-semibold text-slate-300 truncate">{teamInfo.team?.leadEmail || 'Chưa cập nhật'}</p>
                      </div>
                      <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-3 space-y-1">
                        <span className="text-2xs text-slate-500 font-medium">Mã giới thiệu đội ngũ</span>
                        <p className="font-mono font-bold text-amber-300">{teamInfo.team?.referralCode || currentUser.referred_by || 'N/A'}</p>
                      </div>
                      <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-3 space-y-1">
                        <span className="text-2xs text-slate-500 font-medium">Ngày gia nhập</span>
                        <p className="font-medium text-slate-300">
                          {teamInfo.membership?.joinedAt ? new Date(teamInfo.membership.joinedAt).toLocaleDateString('vi-VN') : 'Mặc định'}
                        </p>
                      </div>
                    </div>
                    {teamInfo.membership?.status === 'pending' ? (
                      <div className="rounded-lg bg-amber-950/40 border border-amber-500/40 p-3.5 flex items-start gap-3 text-xs text-amber-200">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <span className="font-bold text-amber-300">Tài khoản đang chờ duyệt thành viên:</span>{' '}
                          Bạn đã gửi yêu cầu gia nhập team của{' '}
                          <strong className="text-white">
                            {teamInfo.team?.leadName || 'Trưởng nhóm'}
                          </strong>
                          . Vui lòng chờ Trưởng nhóm hoặc Super Admin phê duyệt để kích hoạt đầy đủ quyền hạn thành viên.
                        </div>
                      </div>
                    ) : teamInfo.membership?.status === 'suspended' ? (
                      <div className="rounded-lg bg-rose-950/40 border border-rose-500/40 p-3.5 flex items-start gap-3 text-xs text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-rose-300">Tài khoản đã bị tạm đình chỉ:</span>{' '}
                          Quyền hạn trong team của bạn hiện đang bị khóa tạm thời bởi Trưởng nhóm hoặc Quản trị viên.
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-emerald-950/20 border border-emerald-800/30 p-3 flex items-start gap-2.5 text-xs text-emerald-300/90">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-emerald-200">Đã liên kết thành công với đội ngũ:</span>{' '}
                          Bạn sẽ nhận được các thông báo chiến dịch, phân bổ khách hàng tiềm năng và hỗ trợ đào tạo từ Trưởng nhóm.
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
                    <div>
                      <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-amber-400" />
                        Bạn chưa tham gia đội ngũ nào
                      </h5>
                      <p className="text-2xs text-slate-400 mt-1">
                        Nếu bạn đã tạo tài khoản trước đó mà chưa kịp nhập mã giới thiệu của người hướng dẫn, hãy điền mã giới thiệu vào ô bên dưới để gia nhập team ngay bây giờ.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
                      <div className="relative flex-1">
                        <Users className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="Nhập mã giới thiệu (VD: REF-ABC123)"
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs font-mono text-amber-300 uppercase placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={joiningTeam || !joinCodeInput.trim()}
                        onClick={() => handleJoinTeam(joinCodeInput)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold transition-all disabled:opacity-40 active:scale-95 shadow shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {joiningTeam ? 'Đang gia nhập...' : 'Gia nhập Team ngay'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Member approval list for user's referral code / team */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Thành Viên Nhập Mã Của Bạn & Duyệt Yêu Cầu
                      </h4>
                      <p className="text-2xs text-slate-400 mt-0.5">
                        Duyệt thành viên đăng ký qua mã giới thiệu của bạn để tham gia vào đội ngũ.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingTeamMembersCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-2xs font-extrabold animate-pulse">
                        <Clock className="w-3 h-3" />
                        {pendingTeamMembersCount} chờ duyệt
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={loadingMembers}
                      onClick={fetchMembers}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-2xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingMembers ? 'animate-spin' : ''}`} />
                      Làm mới
                    </button>
                  </div>
                </div>

                {loadingMembers ? (
                  <div className="flex items-center justify-center py-8 text-slate-400 text-xs gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                    Đang tải danh sách thành viên...
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800/80 p-6 text-center space-y-2">
                    <Users className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-300">Chưa có thành viên nào đăng ký qua mã của bạn</p>
                    <p className="text-2xs text-slate-500 max-w-md mx-auto">
                      Khi các môi giới hoặc cộng tác viên nhập mã <span className="font-mono text-amber-400 font-bold">{referralCode}</span>, yêu cầu gia nhập sẽ hiển thị tại đây để bạn duyệt hoặc từ chối.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/40">
                      {teamMembers.map((member) => {
                        const isPending = member.status === 'pending';
                        const isApproved = member.status === 'approved';
                        const isSuspended = member.status === 'suspended';
                        const isUpdating = updatingMemberId === member.userId;

                        return (
                          <div
                            key={member.userId}
                            className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              isPending ? 'bg-amber-950/15' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isPending
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : isApproved
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                }`}
                              >
                                {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-xs">{member.name || 'Thành viên'}</span>
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold ${
                                      isPending
                                        ? 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                                        : isApproved
                                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                                        : 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                                    }`}
                                  >
                                    {isPending && <Clock className="w-2.5 h-2.5 animate-pulse" />}
                                    {isApproved && <CheckCircle2 className="w-2.5 h-2.5" />}
                                    {isSuspended && <UserX className="w-2.5 h-2.5" />}
                                    {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Đình chỉ'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-slate-400 mt-1">
                                  <span>
                                    Email: <strong className="text-slate-300">{member.email || 'N/A'}</strong>
                                  </span>
                                  {member.phone && (
                                    <span>
                                      SĐT: <strong className="text-slate-300">{member.phone}</strong>
                                    </span>
                                  )}
                                  <span>
                                    Ngày tham gia: {new Date(member.joinedAt).toLocaleDateString('vi-VN')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {isPending && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => handleUpdateMemberStatus(member.userId, 'approved')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    {isUpdating ? 'Đang duyệt...' : 'Duyệt thành viên'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => handleUpdateMemberStatus(member.userId, 'suspended')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
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
                                  onClick={() => handleUpdateMemberStatus(member.userId, 'suspended')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-800/40 text-slate-400 hover:text-rose-300 text-2xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                                >
                                  <UserX className="w-3 h-3" />
                                  Tạm đình chỉ
                                </button>
                              )}

                              {isSuspended && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateMemberStatus(member.userId, 'approved')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-2xs font-bold transition-all active:scale-95 disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" />
                                  Kích hoạt lại
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Benefits */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Quyền lợi khi giới thiệu thành viên:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-3 space-y-1">
                    <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Tự động gắn Team
                    </div>
                    <p className="text-2xs text-slate-400">Thành viên đăng ký qua mã của bạn sẽ tự động được phân bổ vào đội ngũ của bạn.</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-3 space-y-1">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" /> Kích hoạt AI Agent
                    </div>
                    <p className="text-2xs text-slate-400">Nhận ngay quyền truy cập dùng thử AI Marketing Agent cho toàn bộ thành viên mới.</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-3 space-y-1">
                    <div className="font-semibold text-sky-400 flex items-center gap-1.5">
                      <Crown className="w-4 h-4" /> Hoa hồng phân phối
                    </div>
                    <p className="text-2xs text-slate-400">Hưởng mức chia sẻ hoa hồng và điểm uy tín khi phân phối BĐS thành công.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: License key & Desktop Agent devices */}
          {activeTab === 'license' && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-950/60 border border-sky-800/40 text-sky-300 text-xs font-semibold">
                    <Key className="w-3.5 h-3.5 text-sky-400" />
                    Bản Quyền Desktop Agent
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">Quản lý Khóa Kích Hoạt</h3>
                  <p className="text-xs text-slate-400">
                    Sử dụng License Key để kích hoạt ứng dụng Desktop Agent quét tin tự động và đồng bộ Lead về CMS.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={requestingLicenseKey}
                  onClick={handleRequestFreeKey}
                  className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-rose-600 hover:from-sky-500 hover:to-rose-500 text-white font-bold text-xs px-4 py-2.5 shadow-lg active:scale-95 disabled:opacity-60 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  {requestingLicenseKey ? 'Đang xử lý...' : 'Nhận / Xem Key Premium Trial'}
                </button>
              </div>

              {/* Status overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1">
                  <span className="text-slate-500 text-2xs uppercase tracking-wider font-semibold">Trạng thái bản quyền</span>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-sm font-bold text-emerald-400">
                      {licenseInfo?.hasKey ? 'Đã kích hoạt (Active)' : 'Chưa có License'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1">
                  <span className="text-slate-500 text-2xs uppercase tracking-wider font-semibold">Gói dịch vụ</span>
                  <div className="text-sm font-bold text-amber-300 uppercase flex items-center gap-1.5">
                    <PlanBadgeIcon className="w-4 h-4 text-amber-400" />
                    {planLabel(licenseInfo?.plan || rawPlan)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1">
                  <span className="text-slate-500 text-2xs uppercase tracking-wider font-semibold">Thời hạn hiệu lực</span>
                  <div className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-sky-400" />
                    {licenseInfo?.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString('vi-VN') : 'Chưa kích hoạt'}
                  </div>
                </div>
              </div>

              {/* License Key Display */}
              {licenseInfo?.hasKey && licenseInfo.licenseKey ? (
                <div className="space-y-4">
                  {/* Raw License Key */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Key className="w-4 h-4 text-sky-400" /> Khóa kích hoạt (License Key)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(licenseInfo.licenseKey || '', 'raw-license', 'Đã sao chép License Key!')}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                      >
                        {copiedKey === 'raw-license' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Sao chép mã
                      </button>
                    </div>
                    <div className="font-mono text-base font-extrabold text-white bg-slate-900/80 px-4 py-2.5 rounded-lg border border-slate-800 select-all tracking-wider">
                      {licenseInfo.licenseKey}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center space-y-3">
                  <Key className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Bạn chưa có Khóa Bản Quyền</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Mỗi tài khoản chỉ được cấp 1 key duy nhất. Bấm nút bên dưới để nhận Premium Trial 3 ngày kèm License Key kích hoạt Desktop Agent.
                  </p>
                  <button
                    type="button"
                    disabled={requestingLicenseKey}
                    onClick={handleRequestFreeKey}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-5 py-2.5 shadow-md active:scale-95 disabled:opacity-60 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    {requestingLicenseKey ? 'Đang xử lý...' : 'Nhận Key Premium Trial'}
                  </button>
                </div>
              )}

              {/* Download App & Quick Start Guide */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-400" />
                      Tải Ứng Dụng Desktop Agent (Windows/Mac)
                    </h4>
                    <p className="text-2xs text-slate-400 mt-0.5">
                      Phần mềm chạy nền trên máy tính cá nhân để quét tin Facebook, Zalo mà không lo bị hạn chế API.
                    </p>
                  </div>
                  <a
                    href="/downloads/HouseAndLife-Agent-Setup.exe"
                    download="HouseAndLife-Agent-Setup.exe"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold transition-all shadow-sm hover:border-emerald-500/40"
                  >
                    <Download className="w-4 h-4 text-emerald-400" /> Tải Agent Setup (.exe)
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                  <div className="space-y-1">
                    <span className="font-bold text-white">Bước 1: Tải & Cài đặt</span>
                    <p className="text-2xs">Tải file cài đặt và mở ứng dụng Desktop Agent trên máy tính của bạn.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-white">Bước 2: Nhập License Key</span>
                    <p className="text-2xs">Sao chép License Key ở trên và dán vào màn hình đăng nhập của Agent.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-white">Bước 3: Tự động đồng bộ</span>
                    <p className="text-2xs">Bật chế độ quét bài đăng; Lead và tin BĐS sẽ tự động đổ về Dashboard CMS.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Premium Subscription Plans */}
          {activeTab === 'plans' && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-6 space-y-6">
              <div className="border-b border-slate-800 pb-4 space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-950/60 border border-yellow-800/40 text-yellow-300 text-xs font-semibold">
                  <Crown className="w-3.5 h-3.5 text-yellow-400" />
                  Bảng Gói Cước & Gói Premium
                </div>
                <h3 className="text-lg font-bold text-white">Lựa Chọn Gói Dịch Vụ Phù Hợp</h3>
                <p className="text-xs text-slate-400">
                  Mở khóa toàn bộ sức mạnh AI Marketing Agent, săn tìm Lead tự động và quản lý đa kênh tiếp thị BĐS.
                </p>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Premium Trial Plan */}
                <div className={`rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                  isTrialPlan
                    ? 'border-emerald-500/50 bg-emerald-950/10 shadow-lg'
                    : 'border-slate-800 bg-slate-950/80'
                }`}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dùng thử</span>
                      {isTrialPlan && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-2xs font-bold border border-emerald-500/30">
                          Đang dùng
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xl font-extrabold text-white">Premium Trial</h4>
                      <p className="text-2xs text-slate-400 mt-1">Dùng thử 1 lần / tài khoản trong 3 ngày</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-2xl font-black text-white">0đ</span>
                      <span className="text-xs text-slate-500 font-medium"> / 3 ngày</span>
                    </div>

                    <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>1 Thiết bị Desktop Agent kết nối</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Quét tin Facebook/Zalo (5 tin/ngày)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Quản lý 50 khách hàng CRM</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>License Key cấp 1 lần, xem lại bất kỳ lúc nào</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={() => setActiveTab('license')}
                      className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 transition-all"
                    >
                      {isTrialPlan ? 'Xem Key Premium Trial' : 'Xem Key Của Tôi'}
                    </button>
                  </div>
                </div>

                {/* Pro Agent Premium Plan */}
                <div className={`relative rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                  currentPlan === 'pro'
                    ? 'border-rose-500/60 bg-rose-950/20 shadow-xl ring-2 ring-rose-500/30'
                    : 'border-rose-500/40 bg-slate-950 shadow-lg'
                }`}>
                  <div className="absolute -top-3 right-5 px-3 py-0.5 rounded-full bg-gradient-to-r from-rose-600 to-amber-600 text-white font-extrabold text-[10px] uppercase tracking-wider shadow">
                    Khuyên Dùng
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> Chuyên nghiệp
                      </span>
                      {currentPlan === 'pro' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-2xs font-bold border border-rose-500/30">
                          Đang dùng
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xl font-extrabold text-white">Pro Agent Premium</h4>
                      <p className="text-2xs text-slate-400 mt-1">Dành cho Môi giới chuyên nghiệp & Trưởng nhóm</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-2xl font-black text-white">199.000đ</span>
                      <span className="text-xs text-slate-500 font-medium"> / tháng</span>
                    </div>

                    <ul className="space-y-2 text-xs text-slate-200 pt-2 border-t border-slate-800/80">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="font-semibold">3 Thiết bị Desktop Agent chạy 24/7</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>AI Employee săn Lead & phân tích nhu cầu</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Sinh Content đa kênh không giới hạn</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Phân phối tài liệu Lead Magnet tự động</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Chatbot AI tương tác khách tự động</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 space-y-2">
                    <button
                      type="button"
                      disabled={upgradingPlan === 'pro' || currentPlan === 'pro'}
                      onClick={() => handleUpgradePlan('pro')}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-xs font-bold text-white shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-4 h-4" />
                      {currentPlan === 'pro' ? 'Đang Sử Dụng' : upgradingPlan === 'pro' ? 'Đang kích hoạt...' : isSuperAdmin ? 'Kích Hoạt Pro (Admin)' : 'Liên Hệ Admin Kích Hoạt Pro'}
                    </button>

                    <button
                      type="button"
                      disabled={upgradingWithToken === 'pro' || currentPlan === 'pro' || (walletData?.availableBalance ?? 0) < (planCosts.pro ?? 0)}
                      onClick={() => handleUpgradeWithToken('pro')}
                      className="w-full py-2 rounded-xl bg-slate-900 border border-rose-500/40 hover:bg-rose-950/40 text-xs font-bold text-rose-300 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      {currentPlan === 'pro'
                        ? 'Đang Dùng'
                        : upgradingWithToken === 'pro'
                        ? 'Đang nâng cấp...'
                        : `Dùng ${planCosts.pro} Token Ví Nâng Cấp`}
                    </button>
                  </div>
                </div>

                {/* Enterprise Plan */}
                <div className={`rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                  currentPlan === 'enterprise' || currentUser.role === 'owner'
                    ? 'border-yellow-500/50 bg-yellow-950/10 shadow-lg'
                    : 'border-slate-800 bg-slate-950/80'
                }`}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                        <Crown className="w-3.5 h-3.5" /> Sàn & Doanh nghiệp
                      </span>
                      {(currentPlan === 'enterprise' || currentUser.role === 'owner') && (
                        <span className="px-2.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-2xs font-bold border border-yellow-500/30">
                          Đang dùng
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xl font-extrabold text-white">Enterprise</h4>
                      <p className="text-2xs text-slate-400 mt-1">Dành cho Sàn BĐS, Đại lý phân phối lớn</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-2xl font-black text-white">999.000đ</span>
                      <span className="text-xs text-slate-500 font-medium"> / tháng</span>
                    </div>

                    <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span className="font-semibold">10+ Thiết bị Agent & Không giới hạn Sales</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span>Phân quyền RBAC ma trận đa tầng</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span>Tự động chia Lead theo khu vực (Đà Nẵng, Hội An...)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span>API Ingest tốc độ cao & Webhook riêng</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span>Hỗ trợ triển khai VPS riêng & Cấu hình IP</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 space-y-2">
                    <button
                      type="button"
                      disabled={upgradingPlan === 'enterprise' || currentPlan === 'enterprise' || currentUser.role === 'owner'}
                      onClick={() => handleUpgradePlan('enterprise')}
                      className="w-full py-2.5 rounded-xl border border-yellow-500/40 bg-yellow-950/40 hover:bg-yellow-900/40 text-xs font-bold text-yellow-300 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Crown className="w-4 h-4" />
                      {currentPlan === 'enterprise' || currentUser.role === 'owner'
                        ? 'Đang Sử Dụng'
                        : upgradingPlan === 'enterprise'
                        ? 'Đang kích hoạt...'
                        : isSuperAdmin
                        ? 'Kích Hoạt Enterprise (Admin)'
                        : 'Liên Hệ Admin Kích Hoạt Enterprise'}
                    </button>

                    <button
                      type="button"
                      disabled={upgradingWithToken === 'enterprise' || currentPlan === 'enterprise' || currentUser.role === 'owner' || (walletData?.availableBalance ?? 0) < (planCosts.enterprise ?? 0)}
                      onClick={() => handleUpgradeWithToken('enterprise')}
                      className="w-full py-2 rounded-xl bg-slate-900 border border-yellow-500/40 hover:bg-yellow-950/40 text-xs font-bold text-yellow-300 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      {currentPlan === 'enterprise' || currentUser.role === 'owner'
                        ? 'Đang Dùng'
                        : upgradingWithToken === 'enterprise'
                        ? 'Đang nâng cấp...'
                        : `Dùng ${planCosts.enterprise} Token Ví Nâng Cấp`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
