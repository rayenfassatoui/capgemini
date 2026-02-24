import { requireRole } from '@/lib/auth';
import { CalendarView } from '@/features/recruitment/components/calendar-view';

export default async function CalendarPage() {
  await requireRole(['ta', 'admin']);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Calendar
        </h1>
        <p className="text-muted-foreground mt-1">
          Interview schedule overview
        </p>
      </div>
      <CalendarView />
    </div>
  );
}
