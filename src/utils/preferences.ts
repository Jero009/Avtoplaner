export type Theme = 'light' | 'dark' | 'system';

export type Language = 'sl' | 'en';

const THEME_KEY = 'autoplaner.theme';
const LANGUAGE_KEY = 'autoplaner.language';
const SIDEBAR_KEY = 'autoplaner.sidebar-collapsed';

export function storedTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system';
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
}

export function storedLanguage(): Language {
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === 'sl' || value === 'en' ? value : 'sl';
}

export function saveLanguage(language: Language): void {
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
}

export function storedSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
}
