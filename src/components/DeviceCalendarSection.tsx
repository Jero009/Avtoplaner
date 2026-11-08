import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, CalendarSync, CalendarX, RefreshCw } from 'lucide-react';
import { useDb } from '../app/db-context';
import { formatUtcInZone } from '../utils/dates';
import { ConfirmDialog } from './ConfirmDialog';
import {
  DeviceCalendarPlugin,
  createNativeCalendarAdapter,
  deviceCalendarSupported,
  permissionsGranted,
  type DeviceCalendarInfo,
} from '../integrations/device-calendar/plugin';
import {
  DEVICE_CALENDAR_LAST_WRITE_KEY,
  DEVICE_CALENDAR_NAME,
  DEVICE_CALENDAR_TARGET_KEY,
  removeAllDeviceCalendarEvents,
  syncDeviceCalendar,
} from '../integrations/device-calendar/sync';
import { calendarLabels } from '../integrations/device-calendar/labels';

type Status = { kind: 'info' | 'error'; text: string } | null;

/**
 * Settings section "Koledar": pick the target device calendar (CalendarProvider),
 * write/sync eAsistent data into it, and remove everything again.
 * Android-only — on web/PWA the section degrades to an explanatory note.
 */
export function DeviceCalendarSection() {
  const { t } = useTranslation();
  const dbState = useDb();
  const db = dbState.status === 'ready' ? dbState.database : null;
  const supported = deviceCalendarSupported();

  const [calendars, setCalendars] = useState<DeviceCalendarInfo[] | null>(null);
  const [targetId, setTargetId] = useState<string>('');
  const [lastWrite, setLastWrite] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadState = useCallback(async () => {
    if (!db) {
      return;
    }
    const [storedTarget, storedLastWrite] = await Promise.all([
      db.repos.settings.get(DEVICE_CALENDAR_TARGET_KEY),
      db.repos.settings.get(DEVICE_CALENDAR_LAST_WRITE_KEY),
    ]);
    setTargetId(storedTarget ?? '');
    setLastWrite(storedLastWrite);
  }, [db]);

  const refreshCalendars = useCallback(async () => {
    if (!supported) {
      return;
    }
    try {
      const permissions = await DeviceCalendarPlugin.checkPermissions();
      if (!permissionsGranted(permissions)) {
        setCalendars([]);
        return;
      }
      const { calendars: list } = await DeviceCalendarPlugin.listWritableCalendars();
      setCalendars(list);
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }, [supported]);

  useEffect(() => {
    void loadState();
    void refreshCalendars();
  }, [loadState, refreshCalendars]);

  const ensurePermissions = async (): Promise<boolean> => {
    const permissions = await DeviceCalendarPlugin.requestPermissions();
    if (!permissionsGranted(permissions)) {
      setStatus({ kind: 'error', text: t('deviceCalendar.permissionDenied') });
      return false;
    }
    return true;
  };

  const requestAccessAndLoad = async () => {
    setBusy(true);
    try {
      if (await ensurePermissions()) {
        await refreshCalendars();
        setStatus(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const pickTarget = async (id: string) => {
    if (!db) {
      return;
    }
    setTargetId(id);
    // A calendar switch is cleaned up by the next sync (old calendar's
    // events are deleted, the new one is filled) — see sync-device-calendar.
    await db.repos.settings.set(DEVICE_CALENDAR_TARGET_KEY, id);
  };

  const createAndPick = async () => {
    setBusy(true);
    try {
      if (!(await ensurePermissions())) {
        return;
      }
      const { id } = await DeviceCalendarPlugin.createCalendar({
        name: DEVICE_CALENDAR_NAME,
      });
      await pickTarget(id);
      await refreshCalendars();
      setStatus({ kind: 'info', text: t('deviceCalendar.created') });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const writeNow = async () => {
    if (!db || !targetId) {
      return;
    }
    setBusy(true);
    try {
      if (!(await ensurePermissions())) {
        return;
      }
      const result = await syncDeviceCalendar(db.driver, db.repos, createNativeCalendarAdapter(), {
        targetId,
        labels: await calendarLabels(),
      });
      if (result.status === 'permission-denied') {
        setStatus({ kind: 'error', text: t('deviceCalendar.permissionDenied') });
        return;
      }
      if (result.status === 'disabled') {
        setStatus({ kind: 'error', text: t('deviceCalendar.pickFirst') });
        return;
      }
      await loadState();
      setStatus({
        kind: 'info',
        text: t('deviceCalendar.summary', {
          created: result.created,
          updated: result.updated,
          deleted: result.deleted,
          total: result.total,
        }),
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: `${t('deviceCalendar.syncFailed')} ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (!db) {
      return;
    }
    setBusy(true);
    try {
      const count = await removeAllDeviceCalendarEvents(
        db.driver,
        db.repos,
        createNativeCalendarAdapter(),
      );
      await loadState();
      setStatus({ kind: 'info', text: t('deviceCalendar.removed', { count }) });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <section className="card" aria-labelledby="device-calendar-heading">
      <h2 id="device-calendar-heading" className="section-title mb-1">
        {t('deviceCalendar.title')}
      </h2>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {t('deviceCalendar.description')}
      </p>

      {!supported ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('deviceCalendar.webOnly')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="device-calendar-target">
                {t('deviceCalendar.target')}
              </label>
              <div className="flex gap-2">
                <select
                  id="device-calendar-target"
                  className="input"
                  value={targetId}
                  disabled={busy || calendars === null}
                  onChange={(event) => void pickTarget(event.target.value)}
                >
                  <option value="">{t('deviceCalendar.pick')}</option>
                  {(calendars ?? []).map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                      {calendar.accountName ? ` (${calendar.accountName})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0"
                  onClick={() => void requestAccessAndLoad()}
                  disabled={busy}
                  aria-label={t('deviceCalendar.refresh')}
                  title={t('deviceCalendar.refresh')}
                >
                  <RefreshCw className="size-5" aria-hidden="true" />
                </button>
              </div>
              {calendars !== null && calendars.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  {t('deviceCalendar.noCalendars')}
                </p>
              )}
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void createAndPick()}
                disabled={busy}
              >
                <CalendarPlus className="size-5" aria-hidden="true" />
                {t('deviceCalendar.create')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void writeNow()}
              disabled={!db || busy || targetId === ''}
            >
              <CalendarSync className="size-5" aria-hidden="true" />
              {busy
                ? t('deviceCalendar.syncing')
                : lastWrite
                  ? t('deviceCalendar.sync')
                  : t('deviceCalendar.write')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmRemove(true)}
              disabled={!db || busy || lastWrite === null}
            >
              <CalendarX className="size-5" aria-hidden="true" />
              {t('deviceCalendar.removeAll')}
            </button>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('deviceCalendar.lastWrite', {
              time: lastWrite
                ? formatUtcInZone(lastWrite, 'd.M.yyyy HH:mm')
                : t('easistent.never'),
            })}
          </p>

          {status && (
            <p
              role="status"
              className={`text-sm ${
                status.kind === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-700 dark:text-green-400'
              }`}
            >
              {status.text}
            </p>
          )}
        </div>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={t('deviceCalendar.removeConfirmTitle')}
          message={t('deviceCalendar.removeConfirmMessage')}
          confirmLabel={t('common.confirm')}
          danger
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => void removeAll()}
        />
      )}
    </section>
  );
}
