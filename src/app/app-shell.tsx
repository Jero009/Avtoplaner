import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  GraduationCap,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Moon,
  WifiOff,
} from 'lucide-react';
import { useTheme } from './theme-context';
import { useOnline } from './use-online';
import {
  saveSidebarCollapsed,
  storedSidebarCollapsed,
} from '../utils/preferences';

interface NavItem {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { to: '/timetable', labelKey: 'nav.timetable', icon: CalendarClock },
  { to: '/grades', labelKey: 'nav.grades', icon: GraduationCap },
  { to: '/homework', labelKey: 'nav.homework', icon: BookOpen },
];

export function AppShell() {
  const { t } = useTranslation();
  const { resolved, setTheme } = useTheme();
  const online = useOnline();
  const [collapsed, setCollapsed] = useState(storedSidebarCollapsed);

  const toggleSidebar = () => {
    setCollapsed((value) => {
      saveSidebarCollapsed(!value);
      return !value;
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t('common.toggleNavigation')}
          title={t('common.toggleNavigation')}
          className="hidden size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:flex dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          )}
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg px-2 py-1 font-medium"
        >
          <CalendarCheck className="size-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span className="text-lg">{t('app.name')}</span>
        </Link>
        <div className="ms-auto flex items-center gap-1">
          {!online && (
            <span
              className="flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-amber-600 dark:text-amber-400"
              role="status"
            >
              <WifiOff className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.offline')}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={t('common.toggleTheme')}
            title={t('common.toggleTheme')}
            className="flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {resolved === 'dark' ? (
              <Sun className="size-5" aria-hidden="true" />
            ) : (
              <Moon className="size-5" aria-hidden="true" />
            )}
          </button>
          <Link
            to="/settings"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            className="flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={`sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-e border-slate-200 bg-white py-4 md:flex dark:border-slate-800 dark:bg-slate-900 ${
            collapsed ? 'w-16' : 'w-60'
          }`}
        >
          <nav aria-label={t('nav.menu')} className="flex flex-col gap-1 px-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  } ${collapsed ? 'justify-center' : ''}`
                }
              >
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto px-4 text-xs text-slate-400">
            {!collapsed && (
              <span>{t('common.version', { version: __APP_VERSION__ })}</span>
            )}
          </div>
        </aside>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label={t('nav.menu')}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex h-14 min-h-11 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="size-5" aria-hidden="true" />
            <span className="truncate px-1">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
