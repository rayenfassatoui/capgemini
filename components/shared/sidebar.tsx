'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { CapgeminiLogo } from '@/components/shared/icons';
import { SignOutButton } from '@/features/recruitment/components/sign-out-button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/components/shared/i18n-provider';
import type { Locale } from '@/components/shared/i18n-provider';
import {
  IconLayoutDashboard,
  IconFileText,
  IconBriefcase,
  IconUsers,
  IconUserShield,
  IconFileSpreadsheet,
  IconChartBar,
  IconChevronRight,
  IconSun,
  IconMoon,
  IconLanguage,
  IconCalendar,
  IconActivity,
  IconSettings,
  IconMail,
  IconUserCheck,
} from '@tabler/icons-react';
import type { UserRole } from '@/features/recruitment/types';

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ta: [
    { labelKey: 'nav.dashboard', href: '/ta/dashboard', icon: IconLayoutDashboard },
    { labelKey: 'nav.cvPool', href: '/ta/cv-pool', icon: IconFileText },
    { labelKey: 'nav.jobs', href: '/ta/jobs', icon: IconBriefcase },
    { labelKey: 'nav.calendar', href: '/ta/calendar', icon: IconCalendar },
    { labelKey: 'nav.statistics', href: '/ta/statistique', icon: IconChartBar },
  ],
  manager: [
    { labelKey: 'nav.dashboard', href: '/manager/dashboard', icon: IconLayoutDashboard },
    { labelKey: 'nav.candidates', href: '/manager/candidates', icon: IconUsers },
  ],
  hr: [
    { labelKey: 'nav.dashboard', href: '/hr/dashboard', icon: IconLayoutDashboard },
    { labelKey: 'nav.candidates', href: '/hr/candidates', icon: IconUsers },
    { labelKey: 'nav.export', href: '/hr/export', icon: IconFileSpreadsheet },
  ],
  admin: [
    { labelKey: 'nav.dashboard', href: '/admin/dashboard', icon: IconLayoutDashboard },
    { labelKey: 'nav.users', href: '/admin', icon: IconUserShield },
    { labelKey: 'nav.activity', href: '/admin/activity', icon: IconActivity },
    { labelKey: 'nav.analytics', href: '/admin/analytics', icon: IconChartBar },
    { labelKey: 'nav.emails', href: '/admin/emails', icon: IconMail },
    { labelKey: 'nav.onboarding', href: '/admin/onboarding', icon: IconUserCheck },
    { labelKey: 'nav.settings', href: '/admin/settings', icon: IconSettings },
  ],
};

const ROLE_LABELS: Record<UserRole, string> = {
  ta: 'Talent Acquisition',
  manager: 'Manager',
  hr: 'Human Resources',
  admin: 'Administrator',
};

interface SidebarProps {
  role: UserRole;
  userName: string;
}

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const navItems = NAV_ITEMS[role] ?? NAV_ITEMS.ta;
  const roleLabel = ROLE_LABELS[role] ?? 'Talent Acquisition';

  return (
    <aside className="flex w-full flex-col border-b border-gray-200 pb-4 dark:border-gray-800 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <CapgeminiLogo className="h-8 w-auto" />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Talent Intelligence
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Recruitment OS</p>
        </div>
      </div>

      {/* User info */}
      <div className="mt-6 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {userName}
          </p>
          <Badge variant="secondary" className="mt-0.5 text-[10px]">
            {roleLabel}
          </Badge>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-6 space-y-1 text-sm">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 transition ${
                isActive
                  ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t(item.labelKey)}</span>
              {isActive && <IconChevronRight className="h-3.5 w-3.5 opacity-50" />}
            </Link>
          );
        })}

        {/* Admin users can also see all other role views */}
        {role === 'admin' && (
          <>
            <div className="my-3 border-t border-gray-200 dark:border-gray-800" />
            <p className="px-3 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t('nav.roleViews')}
            </p>
            {(['ta', 'manager', 'hr'] as const).map((r) =>
              NAV_ITEMS[r].map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 transition ${
                      isActive
                        ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{t(item.labelKey)}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5">
                      {r.toUpperCase()}
                    </Badge>
                  </Link>
                );
              })
            )}
          </>
        )}
      </nav>

      {/* Settings: Theme & Language */}
      <div className="mt-auto pt-6 space-y-3">
        <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
          {/* Theme toggle */}
          <div className="flex items-center justify-between rounded-md px-3 py-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('settings.theme')}
            </span>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <>
                  <IconSun className="h-3.5 w-3.5" />
                  {t('settings.light')}
                </>
              ) : (
                <>
                  <IconMoon className="h-3.5 w-3.5" />
                  {t('settings.dark')}
                </>
              )}
            </button>
          </div>

          {/* Language toggle */}
          <div className="flex items-center justify-between rounded-md px-3 py-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('settings.language')}
            </span>
            <button
              onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label={`Switch to ${locale === 'en' ? 'French' : 'English'}`}
            >
              <IconLanguage className="h-3.5 w-3.5" />
              {locale === 'en' ? 'FR' : 'EN'}
            </button>
          </div>
        </div>

        <SignOutButton />
      </div>
    </aside>
  );
}
