import { requireRole } from '@/lib/auth';
import { AdminSettingsClient } from '@/features/recruitment/components/admin-settings-client';

export default async function AdminSettingsPage() {
  await requireRole(['admin']);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Platform Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure system-wide settings and preferences
        </p>
      </div>
      <AdminSettingsClient />
    </div>
  );
}
