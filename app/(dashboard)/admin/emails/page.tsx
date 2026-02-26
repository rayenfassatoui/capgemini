import { requireRole } from '@/lib/auth';
import { getEmailLogsAction } from '@/features/recruitment/actions';
import { AdminEmailsClient } from '@/features/recruitment/components/admin-emails-client';

export default async function AdminEmailsPage() {
  await requireRole(['admin']);
  const emails = await getEmailLogsAction().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Logs</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Audit trail of all emails sent from the platform
        </p>
      </div>
      <AdminEmailsClient emails={emails} />
    </div>
  );
}
