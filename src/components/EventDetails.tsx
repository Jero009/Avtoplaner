import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import type { EventRecord } from '../db/types';
import { Modal } from './Modal';
import { formatUtcInZone } from '../utils/dates';

/** Read-only event details with conflict warning and local-event actions. */
export function EventDetails({
  event,
  color,
  conflicting,
  conflictTitles,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: {
  event: EventRecord;
  color: string;
  conflicting: boolean;
  conflictTitles: string[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const dateTime = (utcIso: string): string =>
    event.allDay
      ? formatUtcInZone(utcIso, 'd. MMM yyyy')
      : formatUtcInZone(utcIso, 'd. MMM yyyy HH:mm');

  return (
    <Modal title={t('calendar.eventDetails')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {conflicting && (
          <div
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            role="alert"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p>{t('calendar.conflictWarning')}</p>
              {conflictTitles.length > 0 && (
                <p className="mt-1">
                  {t('calendar.conflictsWith', {
                    titles: conflictTitles.join(', '),
                  })}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span
            className="size-4 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold">{event.title}</h3>
        </div>
        <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">
            {t('calendar.fieldStart')}
          </dt>
          <dd>{dateTime(event.startUtc)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">
            {t('calendar.fieldEnd')}
          </dt>
          <dd>{dateTime(event.endUtc)}</dd>
          {event.allDay && (
            <>
              <dt className="text-slate-500 dark:text-slate-400">
                {t('calendar.fieldAllDay')}
              </dt>
              <dd>{t('dashboard.allDay')}</dd>
            </>
          )}
          {event.location && (
            <>
              <dt className="text-slate-500 dark:text-slate-400">
                {t('calendar.fieldLocation')}
              </dt>
              <dd>{event.location}</dd>
            </>
          )}
          {event.description && (
            <>
              <dt className="text-slate-500 dark:text-slate-400">
                {t('calendar.fieldDescription')}
              </dt>
              <dd className="whitespace-pre-line">{event.description}</dd>
            </>
          )}
        </dl>
        <div className="mt-2 flex justify-end gap-2">
          {canEdit && (
            <>
              <button type="button" className="btn btn-danger" onClick={onDelete}>
                {t('common.delete')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onEdit}>
                {t('common.edit')}
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
