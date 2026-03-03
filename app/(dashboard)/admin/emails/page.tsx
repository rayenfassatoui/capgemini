import { requireRole } from '@/lib/auth';
import { getEmailLogsAction } from '@/features/recruitment/actions';
import { AdminEmailsClient } from '@/features/recruitment/components/admin-emails-client';

export default async function AdminEmailsPage() {
  await requireRole(['admin']);
  const emails = await getEmailLogsAction().catch(() => []);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Email Logs
        </h1>
        <p className="text-muted-foreground mt-1">
          Audit trail of all emails sent from the platform
        </p>
      </div>
      <AdminEmailsClient emails={emails} />
    </div>
  );
}
