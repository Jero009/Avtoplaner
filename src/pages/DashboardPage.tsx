import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, BookOpen } from 'lucide-react';
import { useDb } from '../app/db-context';
import { useOnline } from '../app/use-online';
import type { CalendarRecord, EventRecord, HomeworkRecord } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { EventListItem } from '../components/EventListItem';
import { findConflictingIds } from '../utils/conflicts';
import {
  addDaysToDayIso,
  dayRangeUtc,
  formatUtcInZone,
  todayDayIso,
} from '../utils/dates';
import { DbInitError } from '../components/DbInitError';

interface DashboardData {
  calendars: CalendarRecord[];
  events: EventRecord[];
  homework: HomeworkRecord[];
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const dbState = useDb();
  const online = useOnline();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (dbState.status !== 'ready') {
      return;
    }
    try {
      const today = todayDayIso();
      const weekRange = dayRangeUtc(addDaysToDayIso(today, 7));
      const todayRange = dayRangeUtc(today);
      const [calendars, events, homework] = await Promise.all([
        dbState.database.repos.calendars.list(),
        dbState.database.repos.events.listBetween(
          todayRange.startUtc,
          weekRange.endUtc,
        ),
        dbState.database.repos.homework.listDueBetween(today, addDaysToDayIso(today, 7)),
      ]);
      setData({ calendars, events, homework });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    }
  }, [dbState]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

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

  const colorOf = (calendarId: string): string =>
    data?.calendars.find((calendar) => calendar.id === calendarId)?.color ??
    '#2563eb';

  const today = todayDayIso();
  const todayRange = dayRangeUtc(today);
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t('dashboard.title')}</h1>

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
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
    </div>
  );
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
