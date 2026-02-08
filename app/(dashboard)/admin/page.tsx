import { requireRole } from '@/lib/auth';
import { AdminUsersClient } from '@/features/recruitment/components/admin-users-client';

export default async function AdminPage() {
  await requireRole(['admin']);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage user accounts and roles</p>
      </div>
      <AdminUsersClient />
    </div>
  );
}
