import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EventRecord } from '../db/types';
import { formatUtcInZone } from '../utils/dates';

/** One event row as shown on the dashboard lists. */
export function EventListItem({
  event,
  color,
  conflicting,
}: {
  event: EventRecord;
  color: string;
  conflicting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex min-h-11 items-center gap-3 py-1">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="w-28 shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400">
        {event.allDay
          ? t('dashboard.allDay')
          : formatUtcInZone(event.startUtc, 'HH:mm')}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {event.title}
      </span>
      {conflicting && (
        <span
          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
          title={t('dashboard.conflictBadge')}
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
          <span className="sr-only">{t('dashboard.conflictBadge')}</span>
        </span>
      )}
    </li>
  );
}
