'use client';

import { useState, useEffect } from 'react';

import { Sidebar } from '@/components/shared/sidebar';
import type { UserRole } from '@/features/recruitment/types';
import { NotificationBell } from '@/features/recruitment/components/notification-bell';
import { cn } from '@/lib/utils';
import { IconMenu2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface DashboardShellProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
}

export function DashboardShell({ children, role, userName }: DashboardShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Handle responsive auto-collapse
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50/50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar 
        role={role} 
        userName={userName} 
        isCollapsed={isCollapsed} 
        toggleCollapse={() => setIsCollapsed(!isCollapsed)}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content Wrapper */}
      <div className={cn(
        "flex-1 flex min-w-0 flex-col min-h-screen transition-all duration-300 ease-in-out",
        isCollapsed ? "lg:pl-[80px]" : "lg:pl-72" // Fixed width reservation for sidebar
      )}>
        {/* Top Navigation / Header Area */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-gray-200/50 bg-white/80 px-6 backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-950/80">
          <div className="flex items-center gap-4">
             {/* Mobile Toggle */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open navigation"
            >
              <IconMenu2 className="h-5 w-5" />
            </Button>
            
            {/* Breadcrumbs or Page Title could go here */}
          </div>

          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>

        {/* Main Content Area */}
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-6 pb-24 pt-6">
          <div className="mx-auto max-w-7xl min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
