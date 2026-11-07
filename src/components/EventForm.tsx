import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventRecord } from '../db/types';
import type { EventDraft } from '../db/repositories/event-repository';
import { Modal } from './Modal';
import {
  allDayRangeUtc,
  dayRangeUtc,
  formatUtcInZone,
  fromDateTimeLocalValue,
  wallTimeToUtc,
} from '../utils/dates';
import { LOCAL_CALENDAR_ID } from '../db/repositories/calendar-repository';

interface FormState {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string;
  end: string;
}

function initialState(event: EventRecord | null, prefillStart: string | null): FormState {
  if (event) {
    return {
      title: event.title,
      description: event.description ?? '',
      location: event.location ?? '',
      allDay: event.allDay,
      start: event.allDay
        ? formatUtcInZone(event.startUtc, 'yyyy-MM-dd')
        : formatUtcInZone(event.startUtc, "yyyy-MM-dd'T'HH:mm"),
      end: event.allDay
        ? formatUtcInZone(event.endUtc, 'yyyy-MM-dd')
        : formatUtcInZone(event.endUtc, "yyyy-MM-dd'T'HH:mm"),
    };
  }
  const start = prefillStart ?? formatUtcInZone(new Date().toISOString(), "yyyy-MM-dd'T'HH:mm");
  const end = formatUtcInZone(
    new Date(Date.parse(wallTimeToUtc(start)) + 3_600_000).toISOString(),
    "yyyy-MM-dd'T'HH:mm",
  );
  return {
    title: '',
    description: '',
    location: '',
    allDay: false,
    start,
    end,
  };
}

function toDraft(state: FormState, calendarId: string): EventDraft {
  if (state.allDay) {
    const startDay = state.start.slice(0, 10);
    const endDay = state.end.slice(0, 10);
    const range = endDay > startDay
      ? { startUtc: dayRangeUtc(startDay).startUtc, endUtc: dayRangeUtc(endDay).startUtc }
      : allDayRangeUtc(startDay);
    return {
      calendarId,
      title: state.title,
      description: state.description.trim() || null,
      location: state.location.trim() || null,
      allDay: true,
      ...range,
    };
  }
  return {
    calendarId,
    title: state.title,
    description: state.description.trim() || null,
    location: state.location.trim() || null,
    allDay: false,
    startUtc: fromDateTimeLocalValue(state.start),
    endUtc: fromDateTimeLocalValue(state.end),
  };
}

/** Create/edit form for local events. All times entered as Ljubljana wall time. */
export function EventForm({
  event,
  prefillStart,
  onSubmit,
  onCancel,
}: {
  event: EventRecord | null;
  prefillStart: string | null;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() =>
    initialState(event, prefillStart),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (state.title.trim().length === 0) {
      setError(t('calendar.validation.titleRequired'));
      return;
    }
    const draft = toDraft(state, event?.calendarId ?? LOCAL_CALENDAR_ID);
    if (Date.parse(draft.endUtc) <= Date.parse(draft.startUtc)) {
      setError(t('calendar.validation.endAfterStart'));
      return;
    }
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t('common.error'),
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      title={event ? t('calendar.editEvent') : t('calendar.newEvent')}
      onClose={onCancel}
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label className="label" htmlFor="event-title">
            {t('calendar.fieldTitle')}
          </label>
          <input
            id="event-title"
            className="input"
            type="text"
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="event-start">
              {t('calendar.fieldStart')}
            </label>
            <input
              id="event-start"
              className="input"
              type={state.allDay ? 'date' : 'datetime-local'}
              value={state.start}
              onChange={(e) => setState((s) => ({ ...s, start: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="event-end">
              {t('calendar.fieldEnd')}
            </label>
            <input
              id="event-end"
              className="input"
              type={state.allDay ? 'date' : 'datetime-local'}
              value={state.end}
              onChange={(e) => setState((s) => ({ ...s, end: e.target.value }))}
              required
            />
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.allDay}
            onChange={(e) => setState((s) => ({ ...s, allDay: e.target.checked }))}
            className="size-4 accent-blue-600"
          />
          {t('calendar.fieldAllDay')}
        </label>
        <div>
          <label className="label" htmlFor="event-location">
            {t('calendar.fieldLocation')}
          </label>
          <input
            id="event-location"
            className="input"
            type="text"
            value={state.location}
            onChange={(e) => setState((s) => ({ ...s, location: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="event-description">
            {t('calendar.fieldDescription')}
          </label>
          <textarea
            id="event-description"
            className="input min-h-20 py-2"
            value={state.description}
            onChange={(e) =>
              setState((s) => ({ ...s, description: e.target.value }))
            }
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
