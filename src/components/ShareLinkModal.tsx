import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, X } from 'lucide-react';

export interface ShareLinkModalProps {
  open: boolean;
  onClose: () => void;
  heading?: string;
  shareLabel?: string;
  description?: string;
  shareUrl: string;
  loading?: boolean;
  error?: string;
  copied?: boolean;
  onCopy: () => void;
}

export default function ShareLinkModal({
  open,
  onClose,
  heading = 'Chia sẻ',
  shareLabel,
  description = 'Copy link để gửi cho khách hoặc đăng lên mạng xã hội.',
  shareUrl,
  loading = false,
  error = '',
  copied = false,
  onCopy,
}: ShareLinkModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-link-modal-title"
        className="my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">{heading}</h3>
            {shareLabel && (
              <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">{shareLabel}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Link chia sẻ</div>
          {loading ? (
            <div className="mt-2 text-sm text-slate-500">Đang tạo link...</div>
          ) : (
            <div className="mt-2 break-all text-sm font-semibold text-invest-blue">{shareUrl}</div>
          )}
          {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
          <button
            type="button"
            onClick={onCopy}
            disabled={loading || !shareUrl}
            className="btn-cta mt-3 w-full py-2.5 text-sm disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Đã copy link' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
