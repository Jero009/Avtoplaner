import { useTranslation } from 'react-i18next';
import type { CalendarRecord } from '../db/types';
import { LOCAL_CALENDAR_ID } from '../db/repositories/calendar-repository';

/**
 * Per-source on/off toggles for every calendar. Toggling persists to the
 * `calendars.visible` column through the repository.
 */
export function CalendarToggleList({
  calendars,
  onToggle,
}: {
  calendars: CalendarRecord[];
  onToggle: (id: string, visible: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();

  const displayName = (calendar: CalendarRecord): string =>
    calendar.id === LOCAL_CALENDAR_ID
      ? t('calendar.localCalendarName')
      : calendar.name;

  if (calendars.length === 0) {
    return <p className="text-sm text-nt-dim">{t('calendar.noCalendars')}</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {calendars.map((calendar) => (
        <li key={calendar.id}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-nt-surface-2">
            <input
              type="checkbox"
              checked={calendar.visible}
              onChange={(event) => {
                void onToggle(calendar.id, event.target.checked);
              }}
              className="size-4 accent-nt-primary-bg"
            />
            <span
              className="size-3 shrink-0 rounded-full border border-nt-border-strong"
              style={{ backgroundColor: calendar.color }}
              aria-hidden="true"
            />
            <span>{displayName(calendar)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
