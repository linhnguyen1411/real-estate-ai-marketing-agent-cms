import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { Property } from '../types';
import PropertyShareModal from './PropertyShareModal';

interface PropertyShareActionsProps {
  property: Property;
  className?: string;
  buttonClassName?: string;
}

export default function PropertyShareActions({
  property,
  className = '',
  buttonClassName = 'h-9 px-3 border-slate-200 bg-white text-slate-700 hover:border-invest-blue/30 hover:bg-invest-blue/5 hover:text-invest-blue',
}: PropertyShareActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition ${buttonClassName}`}
        title="Copy link chia sẻ"
      >
        <Share2 className="h-3.5 w-3.5" />
        Chia sẻ
      </button>
      <PropertyShareModal property={property} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
