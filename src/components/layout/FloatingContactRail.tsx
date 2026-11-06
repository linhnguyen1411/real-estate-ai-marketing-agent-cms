import { Link } from 'react-router-dom';
import { Bot, Facebook, MessageCircle, Phone } from 'lucide-react';
import { CONTACT } from '../../seo/siteConfig';
import { trackMessengerClick, trackPhoneClick, trackZaloClick } from '../../leadGen/analytics';

export interface FloatingContactRailProps {
  hidden?: boolean;
  trackingSource: string;
  ask?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

const actionClass =
  'pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg ring-2 ring-white/80 transition-transform active:scale-95';

export default function FloatingContactRail({ hidden, trackingSource, ask }: FloatingContactRailProps) {
  const askIcon = <Bot className="h-5 w-5" />;

  return (
    <div
      data-mobile-floating="true"
      className={`pointer-events-none fixed bottom-24 right-3 z-[70] flex flex-col gap-2.5 lg:hidden ${
        hidden ? 'hidden' : ''
      }`}
      style={{ paddingRight: 'env(safe-area-inset-right)' }}
    >
      <a
        href={`tel:${CONTACT.phoneTel}`}
        onClick={() => trackPhoneClick(trackingSource)}
        className={`${actionClass} bg-invest-success`}
        aria-label="Gọi điện"
      >
        <Phone className="h-5 w-5" />
      </a>
      <a
        href={CONTACT.zalo}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackZaloClick(trackingSource)}
        className={`${actionClass} bg-blue-600`}
        aria-label="Chat Zalo"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
      <a
        href={CONTACT.messenger}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackMessengerClick(trackingSource)}
        className={`${actionClass} bg-sky-600`}
        aria-label="Nhắn tin Messenger"
      >
        <Facebook className="h-5 w-5" />
      </a>
      {ask?.href && (
        <Link to={ask.href} className={`${actionClass} bg-invest-cta`} aria-label={ask.label}>
          {askIcon}
        </Link>
      )}
      {ask?.onClick && (
        <button type="button" onClick={ask.onClick} className={`${actionClass} bg-invest-cta`} aria-label={ask.label}>
          {askIcon}
        </button>
      )}
    </div>
  );
}
