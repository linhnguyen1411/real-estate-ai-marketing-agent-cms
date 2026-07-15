import { FormEvent } from 'react';
import { Sparkles } from 'lucide-react';

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
}

export default function LoginPage({
  loginEmail,
  loginPassword,
  loginError,
  authLoading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginPageProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 lg:gap-8 items-stretch">
        <section className="flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 text-rose-300 text-xs font-bold uppercase tracking-wider mb-5">
            <Sparkles className="w-4 h-4" />
            Real Estate AI Marketing Agent CMS
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
            Đăng nhập để quản lý CRM, tài nguyên team và AI Assistant
          </h1>
          <p className="text-slate-400 text-sm leading-7 max-w-2xl">
            Owner có toàn quyền. Company Admin chỉ quản lý dữ liệu của company/team. Member chỉ truy cập tài
            nguyên được admin client cấp phát.
          </p>
        </section>

        <form
          onSubmit={onSubmit}
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-2xl space-y-5"
        >
          <div>
            <h2 className="text-xl font-bold text-white">Login</h2>
            <p className="text-xs text-slate-500 mt-1">Nhập tài khoản đã được cấp để truy cập CMS.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Email</label>
            <input
              type="email"
              value={loginEmail}
              onChange={e => onEmailChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-rose-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Password</label>
            <input
              type="password"
              value={loginPassword}
              onChange={e => onPasswordChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-rose-500"
            />
          </div>

          {loginError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 py-3 text-sm font-bold text-white transition-colors"
          >
            {authLoading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
