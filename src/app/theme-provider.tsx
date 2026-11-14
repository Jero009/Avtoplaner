import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Style, Theme } from '../utils/preferences';
import { saveStyle, saveTheme, storedStyle, storedTheme } from '../utils/preferences';
import { ThemeContext, type ThemeContextValue } from './theme-context';

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [style, setStyleState] = useState<Style>(storedStyle);
  const systemDark = useSystemDark();
  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.classList.toggle('theme-tl', style === 'translucent');
    document.documentElement.style.colorScheme = resolved;
  }, [resolved, style]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved,
      setTheme: (next: Theme) => {
        setThemeState(next);
        saveTheme(next);
      },
      style,
      setStyle: (next: Style) => {
        setStyleState(next);
        saveStyle(next);
      },
    }),
    [theme, resolved, style],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
