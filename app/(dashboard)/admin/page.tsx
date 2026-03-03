import { requireRole } from '@/lib/auth';
import { AdminUsersClient } from '@/features/recruitment/components/admin-users-client';

export default async function AdminPage() {
  await requireRole(['admin']);
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          User Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage user accounts and roles
        </p>
      </div>
      <AdminUsersClient />
    </div>
  );
}
