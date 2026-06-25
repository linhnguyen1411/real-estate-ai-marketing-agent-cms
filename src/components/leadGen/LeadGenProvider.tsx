import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import MultiStepInvestorForm from './MultiStepInvestorForm';
import {
  EXIT_DISMISS_KEY,
  POPUP_DISMISS_KEY,
  markPopupDismissed,
  trackGa4Event,
  wasPopupDismissedRecently,
} from '../../leadGen/analytics';

function isAdminPath() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
}

export default function LeadGenProvider({ children }: { children: React.ReactNode }) {
  const [showExit, setShowExit] = useState(false);
  const [showMobile, setShowMobile] = useState(false);

  useEffect(() => {
    if (isAdminPath()) return;

    const mobileTimer = window.setTimeout(() => {
      if (!wasPopupDismissedRecently(POPUP_DISMISS_KEY, 24)) {
        setShowMobile(true);
        trackGa4Event('popup_shown', { popup_type: 'mobile_timed' });
      }
    }, 30000);

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !wasPopupDismissedRecently(EXIT_DISMISS_KEY, 24)) {
        setShowExit(true);
        trackGa4Event('exit_intent_shown', { popup_type: 'desktop_exit' });
      }
    };

    if (window.matchMedia('(min-width: 1024px)').matches) {
      document.addEventListener('mouseout', handleMouseLeave);
    }

    return () => {
      window.clearTimeout(mobileTimer);
      document.removeEventListener('mouseout', handleMouseLeave);
    };
  }, []);

  const closeExit = () => {
    markPopupDismissed(EXIT_DISMISS_KEY);
    setShowExit(false);
  };

  const closeMobile = () => {
    markPopupDismissed(POPUP_DISMISS_KEY);
    setShowMobile(false);
  };

  const popup = (visible: boolean, onClose: () => void, type: string) => {
    if (!visible) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-4 sm:items-center">
        <div className="relative w-full max-w-md rounded-2xl bg-white p-1 shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="rounded-xl bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-rose-400">Đừng rời đi!</p>
            <h3 className="mt-2 text-xl font-extrabold leading-tight">
              Nhận miễn phí khung 20 nhóm cơ hội đầu tư BĐS Đà Nẵng
            </h3>
            <p className="mt-2 text-sm text-slate-300">Dành cho nhà đầu tư trung và dài hạn</p>
          </div>
          <div className="p-4">
            <MultiStepInvestorForm
              source={type}
              magnetSlug="top-20-co-hoi-dau-tu"
              compact
              onSuccess={() => {
                trackGa4Event('generate_lead', { popup_type: type });
                window.setTimeout(onClose, 2000);
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {children}
      {popup(showExit, closeExit, 'exit_intent')}
      {popup(showMobile, closeMobile, 'mobile_30s')}
    </>
  );
}
