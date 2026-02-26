import { requireRole } from '@/lib/auth';
import { AdminSettingsClient } from '@/features/recruitment/components/admin-settings-client';

export default async function AdminSettingsPage() {
  await requireRole(['admin']);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Platform Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure system-wide settings and preferences
        </p>
      </div>
      <AdminSettingsClient />
    </div>
  );
}
