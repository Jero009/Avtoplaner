import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import slLocale from '@fullcalendar/core/locales/sl';
import enLocale from '@fullcalendar/core/locales/en-gb';
import type { EventSourceFunc } from '@fullcalendar/core';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDb } from '../app/db-context';
import type { CalendarRecord, EventRecord } from '../db/types';
import type { EventDraft } from '../db/repositories/event-repository';
import { CalendarToggleList } from '../components/CalendarToggleList';
import { EventForm } from '../components/EventForm';
import { EventDetails } from '../components/EventDetails';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { findConflictingIds } from '../utils/conflicts';
import { toDateTimeLocalValue } from '../utils/dates';
import { DbInitError } from '../components/DbInitError';

type ViewKey = 'day' | 'week' | 'month' | 'agenda';

const VIEW_CONFIG: Record<ViewKey, { fcView: string; labelKey: string }> = {
  day: { fcView: 'timeGridDay', labelKey: 'calendar.viewDay' },
  week: { fcView: 'timeGridWeek', labelKey: 'calendar.viewWeek' },
  month: { fcView: 'dayGridMonth', labelKey: 'calendar.viewMonth' },
  agenda: { fcView: 'listMonth', labelKey: 'calendar.viewAgenda' },
};

const VIEW_ORDER: readonly ViewKey[] = ['day', 'week', 'month', 'agenda'];

interface Selection {
  event: EventRecord;
  conflicting: boolean;
  conflictTitles: string[];
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const dbState = useDb();
  const [calendars, setCalendars] = useState<CalendarRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>('month');
  const [title, setTitle] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [formState, setFormState] = useState<{
    event: EventRecord | null;
    prefillStart: string | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<EventRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const calendarRef = useRef<FullCalendar>(null);

  /** id -> record and conflict set from the most recent event fetch. */
  const eventsById = useRef(new Map<string, EventRecord>());
  const conflictIds = useRef(new Set<string>());

  const loadCalendars = useCallback(async () => {
    if (dbState.status !== 'ready') {
      return;
    }
    try {
      setCalendars(await dbState.database.repos.calendars.list());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [dbState]);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  const visibleIds = calendars
    ? calendars.filter((calendar) => calendar.visible).map((c) => c.id)
    : null;

  const fetchEvents = useCallback<EventSourceFunc>(
    async (fetchInfo, successCallback, failureCallback) => {
      if (dbState.status !== 'ready' || !visibleIds) {
        successCallback([]);
        return;
      }
      // The refreshKey dependency recreates this callback after every
      // mutation, which re-registers the event source and refetches.
      void refreshKey;
      try {
        const records = await dbState.database.repos.events.listBetween(
          fetchInfo.start.toISOString(),
          fetchInfo.end.toISOString(),
        );
        const visible = records.filter((record) =>
          visibleIds.includes(record.calendarId),
        );
        eventsById.current = new Map(visible.map((record) => [record.id, record]));
        conflictIds.current = findConflictingIds(visible);
        const colorOf = (calendarId: string): string =>
          calendars?.find((calendar) => calendar.id === calendarId)?.color ??
          '#2563eb';
        // eAsistent rows carry their kind in the external-id prefix so the
        // calendar can style them without extra schema.
        const extraClassNames = (record: EventRecord): string[] => {
          if (record.source !== 'easistent') {
            return [];
          }
          const classes = ['easistent-event'];
          if (record.externalId?.startsWith('ea-test:')) {
            classes.push('easistent-test');
          } else if (record.externalId?.startsWith('ea-cancelled:')) {
            classes.push('easistent-cancelled');
          } else if (record.externalId?.startsWith('ea-event:')) {
            classes.push('easistent-change');
          }
          return classes;
        };
        successCallback(
          visible.map((record) => ({
            id: record.id,
            title: record.title,
            start: record.startUtc,
            end: record.endUtc,
            allDay: record.allDay,
            backgroundColor: colorOf(record.calendarId),
            borderColor: colorOf(record.calendarId),
            classNames: [
              ...(conflictIds.current.has(record.id) ? ['conflict-event'] : []),
              ...extraClassNames(record),
            ],
          })),
        );
      } catch (error) {
        failureCallback(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [dbState, visibleIds, calendars, refreshKey],
  );

  const refresh = () => {
    setRefreshKey((key) => key + 1);
  };

  useEffect(() => {
    // Switch the mounted calendar when the toolbar selection changes.
    calendarRef.current?.getApi().changeView(VIEW_CONFIG[view].fcView);
  }, [view]);

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={() => {
            calendarRef.current?.getApi().prev();
          }}
          aria-label={t('common.previous')}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            calendarRef.current?.getApi().today();
          }}
        >
          {t('common.today')}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={() => {
            calendarRef.current?.getApi().next();
          }}
          aria-label={t('common.next')}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      <h2 className="min-w-0 flex-1 truncate text-center text-base font-semibold" aria-live="polite">
        {title}
      </h2>
      <div
        className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700"
        role="group"
        aria-label={t('calendar.title')}
      >
        {VIEW_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`h-11 px-3 text-sm font-medium ${
              view === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {t(VIEW_CONFIG[key].labelKey)}
          </button>
        ))}
      </div>
    </div>
  );

  if (dbState.status === 'loading') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('calendar.title')}</h1>
        <LoadingState label={t('db.loadingDb')} />
      </>
    );
  }

  if (dbState.status === 'error') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('calendar.title')}</h1>
        <DbInitError />
      </>
    );
  }

  const colorOf = (calendarId: string): string =>
    calendars?.find((calendar) => calendar.id === calendarId)?.color ?? '#2563eb';

  const handleToggle = async (id: string, visible: boolean) => {
    await dbState.database.repos.calendars.setVisible(id, visible);
    await loadCalendars();
  };

  const selectEvent = (id: string): void => {
    const record = eventsById.current.get(id);
    if (!record) {
      return;
    }
    const conflicting = conflictIds.current.has(id);
    const conflictTitles =
      conflicting && conflictIds.current.size > 1
        ? [...eventsById.current.values()]
            .filter(
              (other) =>
                other.id !== id &&
                Date.parse(other.startUtc) < Date.parse(record.endUtc) &&
                Date.parse(record.startUtc) < Date.parse(other.endUtc),
            )
            .map((other) => other.title)
        : [];
    setSelection({ event: record, conflicting, conflictTitles });
  };

  const handleSubmit = async (draft: EventDraft) => {
    if (formState?.event) {
      await dbState.database.repos.events.updateLocal(formState.event.id, draft);
    } else {
      await dbState.database.repos.events.createLocal(draft);
    }
    setFormState(null);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('calendar.title')}</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setFormState({ event: null, prefillStart: null })}
        >
          <Plus className="size-5" aria-hidden="true" />
          {t('calendar.newEvent')}
        </button>
      </div>

      {loadError && (
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            void loadCalendars();
          }}
        />
      )}
      {!calendars && !loadError && <LoadingState />}

      {calendars && (
        <section className="card" aria-label={t('calendar.sources')}>
          <h2 className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {t('calendar.sources')}
          </h2>
          <CalendarToggleList calendars={calendars} onToggle={handleToggle} />
        </section>
      )}

      <section className="card">
        {toolbar}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={VIEW_CONFIG[view].fcView}
          headerToolbar={false}
          height="auto"
          firstDay={1}
          nowIndicator
          slotMinTime="06:00:00"
          allDayText={t('dashboard.allDay')}
          locale={i18n.language === 'sl' ? slLocale : enLocale}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          // No dayHeaderFormat override: setting month/day here triggers the
          // known FullCalendar bug where dayGridMonth renders wrong dates in
          // the column headers (fullcalendar/fullcalendar#5854, #7613). The
          // per-view defaults format every view correctly.
          datesSet={(arg) => {
            setTitle(
              new Intl.DateTimeFormat(i18n.language, {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(arg.view.currentStart),
            );
          }}
          events={fetchEvents}
          eventClick={(info) => selectEvent(info.event.id)}
          dateClick={(info) =>
            setFormState({
              event: null,
              prefillStart: toDateTimeLocalValue(info.date.toISOString()),
            })
          }
        />
      </section>

      {selection && (
        <EventDetails
          event={selection.event}
          color={colorOf(selection.event.calendarId)}
          conflicting={selection.conflicting}
          conflictTitles={selection.conflictTitles}
          canEdit={selection.event.source === 'local'}
          onEdit={() => {
            setFormState({ event: selection.event, prefillStart: null });
            setSelection(null);
          }}
          onDelete={() => {
            setDeleting(selection.event);
            setSelection(null);
          }}
          onClose={() => setSelection(null)}
        />
      )}

      {formState && (
        <EventForm
          event={formState.event}
          prefillStart={formState.prefillStart}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('calendar.deleteConfirmTitle')}
          message={t('calendar.deleteConfirmMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await dbState.database.repos.events.deleteLocal(deleting.id);
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
