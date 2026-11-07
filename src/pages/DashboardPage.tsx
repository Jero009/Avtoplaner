import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, BookOpen, Plus } from 'lucide-react';
import { useDb } from '../app/db-context';
import { useOnline } from '../app/use-online';
import type {
  CalendarRecord,
  EventRecord,
  HomeworkRecord,
  LessonRecord,
  SubjectRecord,
} from '../db/types';
import type { EventDraft } from '../db/repositories/event-repository';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { EventListItem } from '../components/EventListItem';
import { EventForm } from '../components/EventForm';
import { DayTimeline } from '../components/DayTimeline';
import { DbInitError } from '../components/DbInitError';
import { findConflictingIds } from '../utils/conflicts';
import { buildTimelineBlocks } from '../utils/timeline';
import {
  applyGroupChoices,
  GROUP_CHOICES_KEY,
  parseChoices,
} from '../integrations/easistent/group-choice';
import {
  addDaysToDayIso,
  dayRangeUtc,
  formatUtcInZone,
  todayDayIso,
} from '../utils/dates';

interface DashboardData {
  calendars: CalendarRecord[];
  events: EventRecord[];
  lessons: LessonRecord[];
  subjects: SubjectRecord[];
  homework: HomeworkRecord[];
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const dbState = useDb();
  const online = useOnline();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  const [formOpen, setFormOpen] = useState<string | null>(null);

  const today = todayDayIso();
  const viewedDay = addDaysToDayIso(today, dayOffset);

  const load = useCallback(async () => {
    if (dbState.status !== 'ready') {
      return;
    }
    try {
      const todayIso = todayDayIso();
      const weekRange = dayRangeUtc(addDaysToDayIso(todayIso, 7));
      const todayRange = dayRangeUtc(todayIso);
      const [calendars, events, homework, lessons, subjects, choicesRaw] = await Promise.all([
        dbState.database.repos.calendars.list(),
        dbState.database.repos.events.listBetween(
          todayRange.startUtc,
          weekRange.endUtc,
        ),
        dbState.database.repos.homework.listDueBetween(todayIso, addDaysToDayIso(todayIso, 7)),
        dbState.database.repos.lessons.listAll(),
        dbState.database.repos.subjects.listAll(),
        dbState.database.repos.settings.get(GROUP_CHOICES_KEY),
      ]);
      // Defensively hide non-selected group rows at render time (the sync
      // already keeps them out of the DB; this covers rows synced before
      // the choice was made).
      const { events: filteredEvents, lessons: filteredLessons } = applyGroupChoices({
        lessons,
        events,
        subjects,
        choices: parseChoices(choicesRaw),
      });
      setData({
        calendars,
        events: filteredEvents,
        lessons: filteredLessons,
        subjects,
        homework,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    }
  }, [dbState]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const colorOf = (calendarId: string): string =>
    data?.calendars.find((calendar) => calendar.id === calendarId)?.color ??
    '#2563eb';

  const todayRange = dayRangeUtc(today);
  const viewedRange = dayRangeUtc(viewedDay);

  const dayBlocks = useMemo(
    () =>
      data
        ? buildTimelineBlocks(
            data.events.filter(
              (event) =>
                event.startUtc < viewedRange.endUtc && event.endUtc > viewedRange.startUtc,
            ),
            data.lessons,
            data.subjects,
            data.calendars,
          )
        : [],
    [data, viewedRange.startUtc, viewedRange.endUtc],
  );

  const conflictIds = data ? findConflictingIds(data.events) : new Set<string>();
  const todayEvents =
    data?.events.filter(
      (event) =>
        event.startUtc < todayRange.endUtc && event.endUtc > todayRange.startUtc,
    ) ?? [];
  const upcomingEvents =
    data?.events.filter((event) => event.startUtc >= todayRange.endUtc) ?? [];

  const groups = groupByDay(upcomingEvents);

  const dayLabel = (dayIso: string): string =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Ljubljana',
    }).format(new Date(`${dayIso}T12:00:00Z`));

  const createEvent = async (draft: EventDraft) => {
    if (dbState.status !== 'ready') {
      return;
    }
    await dbState.database.repos.events.createLocal(draft);
    setFormOpen(null);
    setReloadKey((key) => key + 1);
  };

  if (dbState.status === 'loading') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('dashboard.title')}</h1>
        <LoadingState label={t('db.loadingDb')} />
      </>
    );
  }

  if (dbState.status === 'error') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('dashboard.title')}</h1>
        <DbInitError />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
      {online ? null : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300" role="status">
          {t('common.offline')}
        </p>
      )}

      {data && (
        <>
          {/* The day timeline IS the home view; the previous dashboard
              sections follow below it. */}
          <DayTimeline
            dayIso={viewedDay}
            blocks={dayBlocks}
            isToday={viewedDay === today}
            onPrevDay={() => setDayOffset((offset) => offset - 1)}
            onNextDay={() => setDayOffset((offset) => offset + 1)}
            onToday={() => setDayOffset(0)}
          />

          <section className="card" aria-labelledby="today-heading">
            <h2 id="today-heading" className="section-title mb-2">
              {t('dashboard.todayEvents')}
            </h2>
            {todayEvents.length === 0 ? (
              <EmptyState icon={CalendarDays} title={t('dashboard.noEventsToday')} />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {todayEvents.map((event) => (
                  <EventListItem
                    key={event.id}
                    event={event}
                    color={colorOf(event.calendarId)}
                    conflicting={conflictIds.has(event.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="next7-heading">
            <h2 id="next7-heading" className="section-title mb-2">
              {t('dashboard.next7days')}
            </h2>
            {groups.length === 0 ? (
              <EmptyState icon={CalendarDays} title={t('dashboard.noEventsNext7Days')} />
            ) : (
              groups.map(([dayIso, events]) => (
                <div key={dayIso} className="mb-2">
                  <h3 className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                    {dayLabel(dayIso)}
                  </h3>
                  <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {events.map((event) => (
                      <EventListItem
                        key={event.id}
                        event={event}
                        color={colorOf(event.calendarId)}
                        conflicting={conflictIds.has(event.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section className="card" aria-labelledby="homework-heading">
            <h2 id="homework-heading" className="section-title mb-2">
              {t('dashboard.homeworkDueSoon')}
            </h2>
            {data.homework.length === 0 ? (
              <EmptyState icon={BookOpen} title={t('dashboard.noHomeworkDue')} />
            ) : (
              <ul>
                {data.homework.map((item) => (
                  <li key={item.id} className="flex min-h-11 items-center gap-3 py-1 text-sm">
                    <span className="w-24 shrink-0 text-slate-500 dark:text-slate-400">
                      {item.dueDate}
                    </span>
                    <span className="font-medium">{item.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <button
        type="button"
        className="fixed bottom-24 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:bottom-8 dark:bg-blue-500 dark:hover:bg-blue-400"
        onClick={() => setFormOpen(`${viewedDay}T${prefillHour()}`)}
        aria-label={t('timeline.newEvent')}
      >
        <Plus className="size-7" aria-hidden="true" />
      </button>

      {formOpen && (
        <EventForm
          event={null}
          prefillStart={formOpen}
          onSubmit={createEvent}
          onCancel={() => setFormOpen(null)}
        />
      )}
    </div>
  );
}

/** Wall-clock hour (HH:00) in Ljubljana to prefill the FAB event form with. */
function prefillHour(): string {
  return `${formatUtcInZone(new Date().toISOString(), 'HH')}:00`;
}

function groupByDay(events: EventRecord[]): [string, EventRecord[]][] {
  const byDay = new Map<string, EventRecord[]>();
  for (const event of events) {
    const dayIso = formatUtcInZone(event.startUtc, 'yyyy-MM-dd');
    const bucket = byDay.get(dayIso);
    if (bucket) {
      bucket.push(event);
    } else {
      byDay.set(dayIso, [event]);
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
}
