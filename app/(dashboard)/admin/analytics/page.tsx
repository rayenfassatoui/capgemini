import { requireRole } from '@/lib/auth';
import { getRecruitmentAnalyticsAction } from '@/features/recruitment/actions';
import { AdminAnalyticsClient } from '@/features/recruitment/components/admin-analytics-client';

export default async function AdminAnalyticsPage() {
  await requireRole(['admin']);
  const analytics = await getRecruitmentAnalyticsAction().catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recruitment Analytics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Pipeline performance, hiring metrics, and recruitment insights
        </p>
      </div>
      <AdminAnalyticsClient analytics={analytics} />
    </div>
  );
}
