import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { DashboardProviders } from '@/components/shared/dashboard-providers';
import { StatisticsChat } from '@/features/recruitment/components/statistics-chat';
import type { UserRole } from '@/features/recruitment/types';
import { DashboardShell } from '@/components/shared/dashboard-shell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  const role = (session.user.role ?? 'ta') as UserRole;
  const userName = session.user.name ?? 'User';

  return (
    <DashboardProviders>
      <DashboardShell role={role} userName={userName}>
        {children}
      </DashboardShell>
      <StatisticsChat />
    </DashboardProviders>
  );
}
