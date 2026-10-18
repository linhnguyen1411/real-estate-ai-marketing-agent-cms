import type { ReactNode } from 'react';
import { ThemeProvider } from './theme/ThemeContext';

export default function AppProviders({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
