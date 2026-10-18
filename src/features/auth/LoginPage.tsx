import { FormEvent, useEffect, useState } from 'react';
import { Sparkles, LogIn, UserPlus, AlertCircle, CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';
import { register } from '../../services/api';
import type { AuthUser } from '../../types';

export function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="text-sm text-slate-400">Đang kiểm tra phiên đăng nhập...</div>
    </div>
  );
}

export interface LoginPageProps {
  loginEmail: string;
  loginPassword: string;
  loginError: string;
  authLoading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onRegisterSuccess?: (user: AuthUser) => void;
}

export default function LoginPage({
  loginEmail,
  loginPassword,
  loginError,
  authLoading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onRegisterSuccess,
}: LoginPageProps) {
  const isAdminPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Register form fields
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerReferralCode, setRegisterReferralCode] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');

  useEffect(() => {
    if (isAdminPortal) {
      setMode('login');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const refParam = params.get('ref') || params.get('referral');
    if (modeParam === 'register' || window.location.pathname === '/register' || window.location.pathname === '/dang-ky' || refParam) {
      setMode('register');
    }
    if (refParam) {
      setRegisterReferralCode(refParam.toUpperCase());
    }
  }, [isAdminPortal]);

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');

    if (!registerName.trim()) {
      setRegisterError('Vui lòng nhập họ và tên.');
      return;
    }
    if (!registerEmail.trim()) {
      setRegisterError('Vui lòng nhập email.');
      return;
    }
    if (registerPassword.length < 8) {
      setRegisterError('Mật khẩu phải có tối thiểu 8 ký tự.');
      return;
    }

    setRegisterLoading(true);
    try {
      const session = await register({
        name: registerName.trim(),
        email: registerEmail.trim().toLowerCase(),
        password: registerPassword,
        referralCode: registerReferralCode.trim().toUpperCase() || undefined,
      });

      setRegisterSuccess('Đăng ký tài khoản thành công! Đang chuyển hướng...');
      setTimeout(() => {
        if (session?.user && onRegisterSuccess) {
          onRegisterSuccess(session.user);
        } else {
          onEmailChange(registerEmail.trim().toLowerCase());
          onPasswordChange(registerPassword);
          setMode('login');
        }
      }, 1000);
    } catch (err: any) {
      setRegisterError(err.message || 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Header brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            Real Estate AI Marketing Agent CMS
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isAdminPortal
              ? 'Đăng nhập Super Admin'
              : mode === 'login'
              ? 'Đăng nhập hệ thống'
              : 'Đăng ký tài khoản'}
          </h1>
          {isAdminPortal && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              Cổng Quản trị Super Admin
            </div>
          )}
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Tabs for Member portal */}
          {!isAdminPortal && (
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  mode === 'login'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LogIn className="w-4 h-4" />
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  mode === 'register'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Đăng ký
              </button>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">
                  {isAdminPortal ? 'Email hoặc Tên tài khoản' : 'Email'}
                </label>
                <input
                  type={isAdminPortal ? 'text' : 'email'}
                  required
                  value={loginEmail}
                  onChange={e => onEmailChange(e.target.value)}
                  placeholder={isAdminPortal ? 'admin@example.com hoặc admin' : 'Nhập email'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Mật khẩu</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={e => onPasswordChange(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              {loginError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 flex-1">
                    <div>{loginError}</div>
                    {isAdminPortal && (loginError.includes('/dang-nhap') || loginError.includes('PORTAL_RESTRICTED')) && (
                      <div>
                        <a
                          href="/dang-nhap"
                          className="inline-flex items-center gap-1 font-bold underline text-rose-300 hover:text-white"
                        >
                          Chuyển sang Cổng Đăng nhập Thành viên <ArrowRight className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {!isAdminPortal && (loginError.includes('/admin/login') || loginError.includes('PORTAL_RESTRICTED')) && (
                      <div>
                        <a
                          href="/admin/login"
                          className="inline-flex items-center gap-1 font-bold underline text-rose-300 hover:text-white"
                        >
                          Chuyển sang Cổng Super Admin <ArrowRight className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 py-3 text-sm font-bold text-white transition-all shadow-md active:scale-[0.99]"
              >
                {authLoading ? 'Đang xác thực…' : 'Đăng nhập'}
              </button>

              {isAdminPortal ? (
                <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-800">
                  <a href="/dang-nhap" className="text-slate-400 hover:text-slate-200 transition-colors">
                    Đăng nhập cổng Thành viên &rarr;
                  </a>
                </div>
              ) : (
                <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-800">
                  Chưa có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className="font-semibold text-rose-400 hover:text-rose-300 underline"
                  >
                    Đăng ký ngay
                  </button>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={registerName}
                  onChange={e => setRegisterName(e.target.value)}
                  placeholder="Nhập họ và tên"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Email</label>
                <input
                  type="email"
                  required
                  value={registerEmail}
                  onChange={e => setRegisterEmail(e.target.value)}
                  placeholder="Nhập địa chỉ email"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Mật khẩu</label>
                <input
                  type="password"
                  required
                  value={registerPassword}
                  onChange={e => setRegisterPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Mã giới thiệu (Nếu có)</label>
                <input
                  type="text"
                  value={registerReferralCode}
                  onChange={e => setRegisterReferralCode(e.target.value.toUpperCase())}
                  placeholder="Mã giới thiệu"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white uppercase placeholder-slate-600 outline-none focus:border-rose-500 font-mono transition-colors"
                />
              </div>

              {registerError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{registerError}</span>
                </div>
              )}

              {registerSuccess && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{registerSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={registerLoading}
                className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 py-3 text-sm font-bold text-white transition-all shadow-md active:scale-[0.99]"
              >
                {registerLoading ? 'Đang tạo tài khoản…' : 'Đăng ký tài khoản'}
              </button>

              <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-800">
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="font-semibold text-rose-400 hover:text-rose-300 underline"
                >
                  Đăng nhập
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
