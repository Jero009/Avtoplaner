import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfWeek, format } from 'date-fns';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDb } from '../app/db-context';
import type { LessonRecord, SubjectRecord } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { DbInitError } from '../components/DbInitError';
import { EasistentSyncButton } from '../components/EasistentSyncButton';
import {
  addDaysToDayIso,
  dayRangeUtc,
  formatUtcInZone,
  todayDayIso,
} from '../utils/dates';

const STATUS_BADGE: Record<string, string> = {
  substitution:
    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  changed: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  substitution: 'timetable.statusSubstitution',
  cancelled: 'timetable.statusCancelled',
  changed: 'timetable.statusChanged',
};

/** Monday of the week containing `dayIso` (Ljubljana calendar arithmetic). */
function weekStart(dayIso: string): string {
  const monday = startOfWeek(new Date(`${dayIso}T12:00:00Z`), { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

interface TimetablePageData {
  lessons: LessonRecord[];
  subjects: Map<string, SubjectRecord>;
}

export function TimetablePage() {
  const { t, i18n } = useTranslation();
  const dbState = useDb();
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<TimetablePageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const monday = useMemo(
    () => addDaysToDayIso(weekStart(todayDayIso()), weekOffset * 7),
    [weekOffset],
  );
  const sunday = addDaysToDayIso(monday, 6);

  const load = useCallback(async () => {
    if (dbState.status !== 'ready') {
      return;
    }
    try {
      const [lessons, subjects] = await Promise.all([
        dbState.database.repos.lessons.listAll(),
        dbState.database.repos.subjects.listAll(),
      ]);
      setData({
        lessons,
        subjects: new Map(subjects.map((subject) => [subject.id, subject])),
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [dbState]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (dbState.status === 'loading') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('timetable.title')}</h1>
        <LoadingState label={t('db.loadingDb')} />
      </>
    );
  }

  if (dbState.status === 'error') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('timetable.title')}</h1>
        <DbInitError />
      </>
    );
  }

  const range = dayRangeUtc(monday);
  const nextMonday = dayRangeUtc(sunday).endUtc;
  const weekLessons = (data?.lessons ?? []).filter(
    (lesson) => lesson.startUtc < nextMonday && lesson.endUtc > range.startUtc,
  );

  const byDay = new Map<string, LessonRecord[]>();
  for (const lesson of weekLessons) {
    const dayIso = formatUtcInZone(lesson.startUtc, 'yyyy-MM-dd');
    const bucket = byDay.get(dayIso);
    if (bucket) {
      bucket.push(lesson);
    } else {
      byDay.set(dayIso, [lesson]);
    }
  }

  const subjectOf = (lesson: LessonRecord): SubjectRecord | undefined =>
    lesson.subjectId ? data?.subjects.get(lesson.subjectId) : undefined;

  const dayLabel = (dayIso: string): string =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${dayIso}T12:00:00Z`));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('timetable.title')}</h1>
        <EasistentSyncButton />
      </div>

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setReloadKey((key) => key + 1);
          }}
        />
      )}
      {!data && !error && <LoadingState />}

      {data && (
        <section className="card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => setWeekOffset((offset) => offset - 1)}
              aria-label={t('common.previous')}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <h2 className="text-base font-semibold" aria-live="polite">
              {t('timetable.weekOf', { date: dayLabel(monday) })}
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => setWeekOffset((offset) => offset + 1)}
              aria-label={t('common.next')}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>

          {weekLessons.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t('timetable.noLessons')}
              description={t('easistent.description')}
            />
          ) : (
            [...byDay.entries()].map(([dayIso, lessons]) => (
              <div key={dayIso} className="mb-3 last:mb-0">
                <h3 className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                  {dayLabel(dayIso)}
                </h3>
                <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                  {lessons.map((lesson) => {
                    const subject = subjectOf(lesson);
                    const name = subject ? (subject.shortName ?? subject.name) : '—';
                    const isChange = lesson.status !== 'normal';
                    return (
                      <li
                        key={lesson.id}
                        className={`flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm ${
                          lesson.status === 'cancelled'
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : ''
                        }`}
                      >
                        <span className="w-28 shrink-0 text-slate-500 tabular-nums dark:text-slate-400">
                          {formatUtcInZone(lesson.startUtc, 'HH:mm')}–
                          {formatUtcInZone(lesson.endUtc, 'HH:mm')}
                        </span>
                        <span className="font-medium">{name}</span>
                        {lesson.classroom && (
                          <span className="text-slate-500 dark:text-slate-400">
                            {lesson.classroom}
                          </span>
                        )}
                        {lesson.teacher && (
                          <span className="hidden text-slate-400 sm:inline">
                            {lesson.teacher}
                          </span>
                        )}
                        {isChange && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              STATUS_BADGE[lesson.status]
                            }`}
                          >
                            {t(STATUS_LABEL_KEY[lesson.status])}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
