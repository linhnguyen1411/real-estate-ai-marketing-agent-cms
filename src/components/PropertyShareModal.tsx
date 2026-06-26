import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import type { Property } from '../types';
import ShareLinkModal from './ShareLinkModal';
import { getPropertyShareData } from '../utils/propertyShare';
import { resolveShortLink } from '../services/shortLinksApi';
import type { ShortLink } from '../types/shortLink';
import { trackPropertyShareCopy, trackPropertyShareOpen } from '../leadGen/analytics';

interface PropertyShareModalProps {
  property: Property;
  open: boolean;
  onClose: () => void;
}

export default function PropertyShareModal({ property, open, onClose }: PropertyShareModalProps) {
  const [shortLink, setShortLink] = useState<ShortLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setCopied(false);
    resolveShortLink('property', property.id)
      .then((link) => {
        setShortLink(link);
        trackPropertyShareOpen(property.id, link.slug);
      })
      .catch((err) => {
        setShortLink(null);
        setError(err instanceof Error ? err.message : 'Không tải được link ngắn');
      })
      .finally(() => setLoading(false));
  }, [open, property.id]);

  const shareUrl = shortLink?.short_url || getPropertyShareData(property).url;

  const runCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackPropertyShareCopy(property.id, shortLink?.slug);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Không copy được link');
    }
  };

  return (
    <ShareLinkModal
      open={open}
      onClose={onClose}
      heading="Chia sẻ tin này"
      shareLabel={property.title}
      description="Link ngắn giúp theo dõi click và nguồn khách."
      shareUrl={shareUrl}
      loading={loading}
      error={error}
      copied={copied}
      onCopy={runCopy}
    />
  );
}

interface PropertyShareButtonProps {
  property: Property;
  className?: string;
}

export function PropertyShareButton({ property, className = '' }: PropertyShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-invest-gold/40 hover:bg-invest-gold-muted hover:text-invest-blue ${className}`}
      >
        <Share2 className="h-4 w-4" />
        Chia sẻ tin này
      </button>
      <PropertyShareModal property={property} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function PropertyShareCompactButton({ property, className = '' }: PropertyShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'flex min-h-[52px] w-full flex-col items-center justify-center rounded-xl bg-slate-700 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white'
        }
      >
        <Share2 className="mb-0.5 h-4 w-4" />
        Share
      </button>
      <PropertyShareModal property={property} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
