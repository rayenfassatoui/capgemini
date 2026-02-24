import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession, getRoleHome } from '@/lib/auth';
import { Sidebar } from '@/components/shared/sidebar';
import { DashboardProviders } from '@/components/shared/dashboard-providers';
import { StatisticsChat } from '@/features/recruitment/components/statistics-chat';
import { NotificationBell } from '@/features/recruitment/components/notification-bell';
import type { UserRole } from '@/features/recruitment/types';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  const role = (session.user.role ?? 'ta') as UserRole;
  const userName = session.user.name ?? 'User';

  return (
    <DashboardProviders>
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-6 lg:flex-row">
          <Sidebar role={role} userName={userName} />
          <main id="main-content" className="flex-1 min-w-0">
            <div className="mb-4 flex justify-end">
              <NotificationBell />
            </div>
            {children}
          </main>
        </div>
      </div>
      <StatisticsChat />
    </DashboardProviders>
  );
}
