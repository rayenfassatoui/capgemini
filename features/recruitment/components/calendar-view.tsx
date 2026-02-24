'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
  IconVideo,
  IconClock,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getInterviewCalendarAction } from '@/features/recruitment/actions';
import { useI18n } from '@/components/shared/i18n-provider';

interface CalendarInterview {
  interviewId: string;
  candidateId: string;
  jobId: string;
  stage: string;
  scheduledDate: string;
  scheduledTime: string;
  meetLink: string;
  status: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STAGE_COLORS: Record<string, string> = {
  ta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  hr: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: Array<{ date: number; month: number; year: number; current: boolean }> = [];

  // Previous month overflow
  const prevLastDay = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    days.push({ date: prevLastDay - i, month: month - 1, year, current: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: d, month, year, current: true });
  }

  // Next month overflow to fill 6 rows
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: d, month: month + 1, year, current: false });
  }

  return days;
}

function formatDateKey(year: number, month: number, date: number) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(date).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function CalendarView() {
  const { t } = useI18n();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [interviews, setInterviews] = useState<CalendarInterview[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const firstDay = formatDateKey(year, month, 1);
      const lastDay = formatDateKey(year, month, new Date(year, month + 1, 0).getDate());
      const data = await getInterviewCalendarAction(firstDay, lastDay);
      setInterviews(data as CalendarInterview[]);
    } catch {
      setInterviews([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const days = getMonthDays(year, month);
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Group interviews by date
  const byDate = new Map<string, CalendarInterview[]>();
  for (const iv of interviews) {
    const existing = byDate.get(iv.scheduledDate) ?? [];
    existing.push(iv);
    byDate.set(iv.scheduledDate, existing);
  }

  const selectedInterviews = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayKey);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconCalendar className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('calendar.title') !== 'calendar.title' ? t('calendar.title') : 'Interview Calendar'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium text-gray-900 dark:text-white">
            {MONTHS[month]} {year}
          </span>
          <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
            <IconChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Calendar grid */}
        <Card className="flex-1 p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-px">
            {days.map((day, idx) => {
              const dateKey = formatDateKey(day.year, day.month, day.date);
              const dayInterviews = byDate.get(dateKey) ?? [];
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDate;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(dateKey)}
                  className={`relative flex min-h-[60px] flex-col items-start rounded-md p-1.5 text-left transition ${
                    !day.current
                      ? 'text-gray-300 dark:text-gray-600'
                      : isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-800'
                        : isToday
                          ? 'bg-gray-50 dark:bg-gray-800/50'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <span
                    className={`text-xs font-medium ${
                      isToday
                        ? 'flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white'
                        : day.current
                          ? 'text-gray-700 dark:text-gray-300'
                          : ''
                    }`}
                  >
                    {day.date}
                  </span>
                  {dayInterviews.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-0.5">
                      {dayInterviews.slice(0, 3).map((iv) => (
                        <span
                          key={iv.interviewId}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            iv.status === 'cancelled'
                              ? 'bg-gray-300 dark:bg-gray-600'
                              : iv.stage === 'ta'
                                ? 'bg-blue-500'
                                : iv.stage === 'manager'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                          }`}
                        />
                      ))}
                      {dayInterviews.length > 3 && (
                        <span className="text-[9px] text-gray-400">
                          +{dayInterviews.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="mt-2 text-center text-xs text-gray-400">Loading...</div>
          )}
        </Card>

        {/* Selected date detail */}
        <div className="w-full lg:w-72 shrink-0">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              {selectedDate
                ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Select a date'}
            </h3>

            {!selectedDate ? (
              <p className="text-xs text-gray-400">Click a date to see interviews</p>
            ) : selectedInterviews.length === 0 ? (
              <p className="text-xs text-gray-400">No interviews scheduled</p>
            ) : (
              <div className="space-y-3">
                {selectedInterviews.map((iv) => (
                  <div
                    key={iv.interviewId}
                    className={`rounded-md border p-3 ${
                      iv.status === 'cancelled'
                        ? 'border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/50'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {iv.candidateName}
                      </p>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${STAGE_COLORS[iv.stage] ?? ''}`}
                      >
                        {iv.stage.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {iv.jobTitle}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <IconClock className="h-3 w-3" />
                        {iv.scheduledTime}
                      </span>
                      {iv.meetLink && iv.status !== 'cancelled' && (
                        <a
                          href={iv.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <IconVideo className="h-3 w-3" />
                          Join
                        </a>
                      )}
                    </div>
                    {iv.status === 'cancelled' && (
                      <Badge variant="outline" className="mt-2 text-[10px] text-red-500">
                        Cancelled
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
