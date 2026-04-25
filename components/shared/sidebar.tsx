"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { CapgeminiLogo, CapgeminiIcons } from "@/components/shared/icons";
import { SignOutButton } from "@/features/recruitment/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/shared/i18n-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  IconLayoutDashboard,
  IconFileText,
  IconBriefcase,
  IconUsers,
  IconUserShield,
  IconFileSpreadsheet,
  IconChartBar,
  IconSun,
  IconMoon,
  IconLanguage,
  IconCalendar,
  IconActivity,
  IconSettings,
  IconMail,
  IconUserCheck,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";
import type { UserRole } from "@/features/recruitment/types";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ta: [
    {
      labelKey: "nav.dashboard",
      href: "/ta/dashboard",
      icon: IconLayoutDashboard,
    },
    { labelKey: "nav.cvPool", href: "/ta/cv-pool", icon: IconFileText },
    { labelKey: "nav.jobs", href: "/ta/jobs", icon: IconBriefcase },
    { labelKey: "nav.calendar", href: "/ta/calendar", icon: IconCalendar },
    { labelKey: "nav.statistics", href: "/ta/statistique", icon: IconChartBar },
  ],
  manager: [
    {
      labelKey: "nav.dashboard",
      href: "/manager/dashboard",
      icon: IconLayoutDashboard,
    },
    {
      labelKey: "nav.candidates",
      href: "/manager/candidates",
      icon: IconUsers,
    },
  ],
  hr: [
    {
      labelKey: "nav.dashboard",
      href: "/hr/dashboard",
      icon: IconLayoutDashboard,
    },
    { labelKey: "nav.candidates", href: "/hr/candidates", icon: IconUsers },
    { labelKey: "nav.export", href: "/hr/export", icon: IconFileSpreadsheet },
  ],
  admin: [
    {
      labelKey: "nav.dashboard",
      href: "/admin/dashboard",
      icon: IconLayoutDashboard,
    },
    { labelKey: "nav.users", href: "/admin", icon: IconUserShield },
    { labelKey: "nav.activity", href: "/admin/activity", icon: IconActivity },
    { labelKey: "nav.analytics", href: "/admin/analytics", icon: IconChartBar },
    { labelKey: "nav.emails", href: "/admin/emails", icon: IconMail },
    {
      labelKey: "nav.onboarding",
      href: "/admin/onboarding",
      icon: IconUserCheck,
    },
    { labelKey: "nav.settings", href: "/admin/settings", icon: IconSettings },
  ],
};

const ROLE_LABELS: Record<UserRole, string> = {
  ta: "Talent Acquisition",
  manager: "Manager",
  hr: "Human Resources",
  admin: "Administrator",
};

interface SidebarProps {
  role: UserRole;
  userName: string;
  isCollapsed?: boolean;
  toggleCollapse?: () => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
}

function SidebarContent({
  role,
  userName,
  isCollapsed = false,
  toggleCollapse,
  isMobile = false,
}: {
  role: UserRole;
  userName: string;
  isCollapsed?: boolean;
  toggleCollapse?: () => void;
  isMobile?: boolean;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const navItems = NAV_ITEMS[role] ?? NAV_ITEMS.ta;
  const roleLabel = ROLE_LABELS[role] ?? "Talent Acquisition";
  // Prevents hydration mismatch: theme is unknown on the server.
  // We defer all theme-dependent rendering until after mount.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-950">
      {/* Header */}
      <div
        className={cn(
          "flex items-center h-16 border-b border-gray-200 dark:border-gray-800 transition-all duration-300",
          isCollapsed ? "justify-center px-2" : "justify-between px-6",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 overflow-hidden transition-all duration-300",
            isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100",
          )}
        >
          <CapgeminiLogo className="h-8 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              Talent Intelligence
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              Recruitment OS
            </p>
          </div>
        </div>

        {isCollapsed && <CapgeminiIcons className="h-8 w-8 shrink-0" />}
      </div>

      {/* User Profile */}
      <div className="shrink-0 p-4">
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg bg-gray-50/50 p-2 transition-all dark:bg-gray-900/50",
            isCollapsed ? "justify-center bg-transparent p-0" : "",
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-bold text-white shadow-sm">
            {userName.charAt(0).toUpperCase()}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {userName}
              </p>
              <Badge
                variant="secondary"
                className="mt-0.5 h-5 px-1.5 text-[10px] font-normal"
              >
                {roleLabel}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-3">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <TooltipProvider key={item.href} delay={0}>
                <Tooltip>
                  <TooltipTrigger render={<span className="block w-full" />}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-900/20 dark:text-blue-300"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white",
                        isCollapsed && "justify-center px-2",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0 transition-transform duration-200",
                          isActive && "scale-110",
                        )}
                      />

                      {!isCollapsed && (
                        <span className="ml-3 flex-1 truncate transition-opacity duration-300">
                          {t(item.labelKey)}
                        </span>
                      )}

                      {!isCollapsed && isActive && (
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      )}
                    </Link>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" className="font-medium">
                      {t(item.labelKey)}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}

          {/* Admin Role View Switcher */}
          {role === "admin" && (
            <>
              <div className="my-4 border-t border-gray-200 dark:border-gray-800" />
              {!isCollapsed && (
                <p className="px-3 mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {t("nav.roleViews")}
                </p>
              )}

              {(["ta", "manager", "hr"] as const).map((r) =>
                NAV_ITEMS[r].map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <TooltipProvider key={item.href} delay={0}>
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="block w-full" />}
                        >
                          <Link
                            href={item.href}
                            className={cn(
                              "group flex items-center rounded-md px-3 py-2 text-sm transition-all",
                              isActive
                                ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white",
                              isCollapsed && "justify-center px-2",
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!isCollapsed && (
                              <span className="ml-3 flex-1 truncate">
                                {t(item.labelKey)}
                              </span>
                            )}
                            {!isCollapsed && (
                              <Badge
                                variant="outline"
                                className="ml-auto text-[9px] h-4 px-1"
                              >
                                {r.toUpperCase()}
                              </Badge>
                            )}
                          </Link>
                        </TooltipTrigger>
                        {isCollapsed && (
                          <TooltipContent side="right">
                            {t(item.labelKey)} ({r.toUpperCase()})
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  );
                }),
              )}
            </>
          )}
        </nav>
      </ScrollArea>

      {/* Footer / Settings */}
      <div className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800">
        <div
          className={cn(
            "space-y-1",
            isCollapsed ? "flex flex-col items-center" : "",
          )}
        >
          {/* Theme Toggle */}
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger render={<span className="block" />}>
                <Button
                  variant="ghost"
                  size={isCollapsed ? "icon" : "sm"}
                  className={cn(
                    "w-full justify-start text-gray-600 dark:text-gray-400",
                    isCollapsed && "justify-center h-9 w-9",
                  )}
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {/* Render placeholder until mounted to avoid hydration mismatch */}
                  {mounted ? (
                    theme === "dark" ? (
                      <IconSun className="h-4 w-4 shrink-0" />
                    ) : (
                      <IconMoon className="h-4 w-4 shrink-0" />
                    )
                  ) : (
                    <IconSun className="h-4 w-4 shrink-0 opacity-0" />
                  )}
                  {!isCollapsed && mounted && (
                    <span className="ml-3">
                      {theme === "dark"
                        ? t("settings.light")
                        : t("settings.dark")}
                    </span>
                  )}
                  {!isCollapsed && !mounted && (
                    <span className="ml-3 opacity-0">{t("settings.dark")}</span>
                  )}
                </Button>
              </TooltipTrigger>
              {isCollapsed && mounted && (
                <TooltipContent side="right">
                  {theme === "dark" ? t("settings.light") : t("settings.dark")}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {/* Language Toggle */}
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger render={<span className="block" />}>
                <Button
                  variant="ghost"
                  size={isCollapsed ? "icon" : "sm"}
                  className={cn(
                    "w-full justify-start text-gray-600 dark:text-gray-400",
                    isCollapsed && "justify-center h-9 w-9",
                  )}
                  onClick={() => setLocale(locale === "en" ? "fr" : "en")}
                >
                  <IconLanguage className="h-4 w-4 shrink-0" />
                  {!isCollapsed && (
                    <span className="ml-3">
                      {locale === "en" ? "Français" : "English"}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">
                  {locale === "en" ? "Switch to French" : "Switch to English"}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <div className="pt-2">
            <TooltipProvider delay={0}>
              <Tooltip>
                <TooltipTrigger render={<span className="block" />}>
                  <SignOutButton isCollapsed={isCollapsed} />
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right">Sign Out</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Collapse Toggle (Desktop Only) */}
      {!isMobile && toggleCollapse && (
        <div className="hidden lg:flex border-t border-gray-200 p-2 dark:border-gray-800 justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
            onClick={toggleCollapse}
          >
            {isCollapsed ? (
              <IconChevronsRight className="h-4 w-4" />
            ) : (
              <IconChevronsLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  role,
  userName,
  isCollapsed = false,
  toggleCollapse,
  isMobileOpen,
  setIsMobileOpen,
}: SidebarProps) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen border-r border-gray-200 bg-white transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-950 lg:block",
          isCollapsed ? "w-[80px]" : "w-72",
        )}
      >
        <SidebarContent
          role={role}
          userName={userName}
          isCollapsed={isCollapsed}
          toggleCollapse={toggleCollapse}
        />
      </aside>

      {/* Mobile Sidebar (Sheet) */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <SidebarContent
            role={role}
            userName={userName}
            isCollapsed={false}
            isMobile={true}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
