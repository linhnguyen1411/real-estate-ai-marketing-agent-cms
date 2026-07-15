import type { ReactNode } from 'react';

/**
 * Global providers that wrap the CMS admin tree.
 * Router + HelmetProvider currently live in `main.tsx` (public + admin shared).
 * This component is the extension point for admin-only providers (toast bus, query cache, etc.)
 * without dumping feature state into a god-context.
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
