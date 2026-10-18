import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CmsTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: CmsTheme;
  toggleTheme: () => void;
  setTheme: (theme: CmsTheme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<CmsTheme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cms_theme');
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark';
  });

  useEffect(() => {
    try {
      localStorage.setItem('cms_theme', theme);
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('theme-light');
        root.classList.remove('theme-dark');
      } else {
        root.classList.add('theme-dark');
        root.classList.remove('theme-light');
      }
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (nextTheme: CmsTheme) => {
    setThemeState(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
