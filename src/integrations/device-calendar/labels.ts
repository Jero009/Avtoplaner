import type { CalendarLabels } from './sync';
import { safeDynamicImport } from '../../utils/safe-dynamic-import';

/**
 * Wordings baked into device-calendar event titles, in the current app
 * language. Async + lazy import: the i18n module touches localStorage at
 * load time, which would crash node-environment tests importing siblings.
 */
export async function calendarLabels(): Promise<CalendarLabels> {
  const i18n = (await safeDynamicImport(() => import('../../i18n'))).default;
  return {
    homework: i18n.t('deviceCalendar.homeworkLabel'),
    cancelled: i18n.t('deviceCalendar.cancelledLabel'),
  };
}
