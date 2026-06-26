import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareLinkModal from '../ShareLinkModal';
import { resolveShortLink } from '../../services/shortLinksApi';
import type { ShortLink } from '../../types/shortLink';
import { getBlogPostShareUrl } from '../../utils/blogShare';

interface BlogShareModalProps {
  slug: string;
  title?: string;
  open: boolean;
  onClose: () => void;
}

export default function BlogShareModal({ slug, title, open, onClose }: BlogShareModalProps) {
  const [shortLink, setShortLink] = useState<ShortLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setCopied(false);
    resolveShortLink('blog_post', slug)
      .then(setShortLink)
      .catch((err) => {
        setShortLink(null);
        setError(err instanceof Error ? err.message : 'Không tải được link ngắn');
      })
      .finally(() => setLoading(false));
  }, [open, slug]);

  const shareUrl = shortLink?.short_url || getBlogPostShareUrl(slug);

  const runCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Không copy được link');
    }
  };

  return (
    <ShareLinkModal
      open={open}
      onClose={onClose}
      heading="Chia sẻ bài viết"
      shareLabel={title}
      description="Copy link bài viết để gửi cho khách hoặc đăng lên mạng xã hội."
      shareUrl={shareUrl}
      loading={loading}
      error={error}
      copied={copied}
      onCopy={runCopy}
    />
  );
}

interface BlogShareButtonProps {
  slug: string;
  title?: string;
  className?: string;
  compact?: boolean;
  label?: string;
}

export function BlogShareButton({
  slug,
  title,
  className = '',
  compact = false,
  label,
}: BlogShareButtonProps) {
  const [open, setOpen] = useState(false);

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            className ||
            'flex min-h-[52px] w-full flex-col items-center justify-center rounded-xl bg-slate-700 px-2 py-2 text-[11px] font-bold leading-tight text-white'
          }
        >
          <Share2 className="mb-0.5 h-4 w-4" />
          {label || 'Share'}
        </button>
        <BlogShareModal slug={slug} title={title} open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-invest-gold/40 hover:bg-invest-gold-muted hover:text-invest-blue'
        }
      >
        <Share2 className="h-4 w-4" />
        {label || 'Chia sẻ bài viết'}
      </button>
      <BlogShareModal slug={slug} title={title} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
