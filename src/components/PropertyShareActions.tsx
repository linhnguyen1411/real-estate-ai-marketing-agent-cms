import React from 'react';
import { Copy, Facebook, Music2, Share2 } from 'lucide-react';
import { Property } from '../types';
import { shareProperty } from '../utils/propertyShare';

interface PropertyShareActionsProps {
  property: Property;
  className?: string;
  buttonClassName?: string;
  onCopied?: () => void;
  onError?: (error: unknown) => void;
}

const baseButtonClassName = 'inline-flex items-center justify-center rounded-lg border text-xs font-bold transition';

export default function PropertyShareActions({
  property,
  className = '',
  buttonClassName = 'h-9 px-3 border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700',
  onCopied,
  onError
}: PropertyShareActionsProps) {
  const runShare = (event: React.MouseEvent<HTMLButtonElement>, platform: Parameters<typeof shareProperty>[1]) => {
    event.preventDefault();
    event.stopPropagation();
    shareProperty(property, platform, { onCopied, onError });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={event => runShare(event, 'native')}
        className={`${baseButtonClassName} ${buttonClassName}`}
        title="Chia sẻ nhanh"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="ml-1.5">Share</span>
      </button>
      <button
        type="button"
        onClick={event => runShare(event, 'facebook')}
        className={`${baseButtonClassName} ${buttonClassName}`}
        title="Chia sẻ Facebook"
      >
        <Facebook className="h-3.5 w-3.5" />
        <span className="ml-1.5">Facebook</span>
      </button>
      <button
        type="button"
        onClick={event => runShare(event, 'zalo')}
        className={`${baseButtonClassName} ${buttonClassName}`}
        title="Chia sẻ Zalo"
      >
        Zalo
      </button>
      <button
        type="button"
        onClick={event => runShare(event, 'tiktok')}
        className={`${baseButtonClassName} ${buttonClassName}`}
        title="Copy caption và mở TikTok"
      >
        <Music2 className="h-3.5 w-3.5" />
        <span className="ml-1.5">TikTok</span>
      </button>
      <button
        type="button"
        onClick={event => runShare(event, 'copy')}
        className={`${baseButtonClassName} ${buttonClassName}`}
        title="Copy link sản phẩm"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
