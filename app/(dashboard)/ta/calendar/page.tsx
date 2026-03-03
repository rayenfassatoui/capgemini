import { requireRole } from '@/lib/auth';
import { CalendarView } from '@/features/recruitment/components/calendar-view';

export default async function CalendarPage() {
  await requireRole(['ta', 'admin']);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
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
