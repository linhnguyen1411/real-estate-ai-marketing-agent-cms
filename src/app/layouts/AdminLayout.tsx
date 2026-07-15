import type { ReactNode } from 'react';
import AdminHeader, { type AdminHeaderProps } from './AdminHeader';
import AdminSidebar, { type AdminSidebarProps } from './AdminSidebar';
import AdminToast, { type ToastState } from './AdminToast';

export interface AdminLayoutProps {
  header: AdminHeaderProps;
  sidebar: AdminSidebarProps;
  toast: ToastState;
  onDismissToast: () => void;
  children: ReactNode;
}

/** Authenticated CMS chrome — header + sidebar + toast + main content. */
export default function AdminLayout({
  header,
  sidebar,
  toast,
  onDismissToast,
  children,
}: AdminLayoutProps) {
  return (
    <div className="h-screen min-h-0 overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      <AdminToast toast={toast} onDismiss={onDismissToast} />
      <AdminHeader {...header} />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <AdminSidebar {...sidebar} />
        <main className="flex-1 min-w-0 min-h-0 bg-slate-950/40 p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden space-y-4 sm:space-y-6 app-scroll">
          {children}
        </main>
      </div>
    </div>
  );
}
