import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;

export default function AdminToast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-4 left-3 right-3 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-0 sm:bottom-6 sm:left-auto sm:right-6 sm:px-5 sm:py-4 ${
        toast.type === 'success'
          ? 'bg-emerald-950/95 border border-emerald-500 text-emerald-200'
          : toast.type === 'error'
            ? 'bg-rose-950/95 border border-rose-500 text-rose-200'
            : 'bg-slate-900 border border-indigo-500 text-indigo-200'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      ) : (
        <AlertCircle className="w-5 h-5 text-rose-400" />
      )}
      <span className="font-medium text-sm leading-relaxed">{toast.message}</span>
      <button type="button" onClick={onDismiss} className="text-slate-400 hover:text-slate-200 ml-2">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
