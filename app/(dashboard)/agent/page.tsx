import { requireRole } from '@/lib/auth';
import { AgentWorkspaceClient } from '@/features/recruitment/components/agent-workspace-client';
import type { UserRole } from '@/features/recruitment/types';

export default async function AgentPage() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const role = (session.user.role ?? 'ta') as UserRole;
  const userName = session.user.name ?? 'User';

  return (
    <AgentWorkspaceClient
      role={role}
      userName={userName}
    />
  );
}
