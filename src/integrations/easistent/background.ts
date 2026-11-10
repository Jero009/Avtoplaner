import { Capacitor } from '@capacitor/core';
import type { DbDriver } from '../../db/driver';
import type { Repositories } from '../../db/repositories';
import { safeDynamicImport } from '../../utils/safe-dynamic-import';
import { openDatabase } from '../../db/connection';
import { runMigrations } from '../../db/migration-runner';
import { createRepositories } from '../../db/repositories';
import { createNativeCalendarAdapter } from '../device-calendar/plugin';
import {
  syncDeviceCalendarIfEnabled,
} from '../device-calendar/sync';
import { calendarLabels } from '../device-calendar/labels';
import {
  loadCredentials,
  syncEasistent,
  syncWithStoredCredentials,
} from './sync';

/** Auto-sync on app open when the last successful sync is older than this. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Settings-table key for the background-sync toggle ('0' = off, '1' = on). */
export const BACKGROUND_SYNC_KEY = 'easistent.backgroundSync';

/** Daily WorkManager/JobScheduler cadence (minutes). */
export const BACKGROUND_FETCH_INTERVAL_MINUTES = 1440;

export function isStale(lastSuccessUtc: string | null, now: Date = new Date()): boolean {
  if (!lastSuccessUtc) {
    return true;
  }
  const lastSuccess = Date.parse(lastSuccessUtc);
  return Number.isNaN(lastSuccess) || now.getTime() - lastSuccess > STALE_AFTER_MS;
}

/**
 * Opt-out model: the toggle defaults to ON once credentials are saved (no
 * stored value = follow credentials); '0' explicitly disables it.
 */
export function backgroundSyncEnabled(
  rawSetting: string | null,
  hasCredentials: boolean,
): boolean {
  if (rawSetting === '0') {
    return false;
  }
  if (rawSetting === '1') {
    return true;
  }
  return hasCredentials;
}

/** Best-effort device-calendar write; never fails the surrounding sync. */
async function writeDeviceCalendar(
  driver: DbDriver,
  repos: Repositories,
): Promise<void> {
  try {
    await syncDeviceCalendarIfEnabled(
      driver,
      repos,
      createNativeCalendarAdapter(),
      await calendarLabels(),
    );
  } catch (error) {
    console.warn('[device-calendar] write failed', error);
  }
}

/** True when a sync actually ran. Errors are recorded in sync_state (the
 * existing sync-state UI surfaces them on the next app open). */
let onOpenInFlight: Promise<boolean> | null = null;

export async function maybeSyncOnOpen(
  driver: DbDriver,
  repos: Repositories,
  now: Date = new Date(),
): Promise<boolean> {
  if (onOpenInFlight) {
    return onOpenInFlight;
  }
  const run = (async () => {
    const credentials = await loadCredentials(repos);
    if (!credentials) {
      return false;
    }
    const state = await repos.syncState.get('easistent');
    if (!isStale(state?.lastSuccessUtc ?? null, now)) {
      return false;
    }
    try {
      await syncEasistent(driver, repos, credentials, { now });
    } catch {
      // Recorded in sync_state; retried on the next open / background window.
      return false;
    }
    await writeDeviceCalendar(driver, repos);
    return true;
  })();
  onOpenInFlight = run;
  try {
    return await run;
  } finally {
    onOpenInFlight = null;
  }
}

/**
 * The WorkManager-driven background job (runs with the app terminated via
 * @transistorsoft/capacitor-background-fetch, which relaunches the WebView
 * headlessly). Silent by design: failures land in sync_state and are
 * retried on the next window; no notifications, no user-visible spam.
 */
export async function runBackgroundSync(
  now: Date = new Date(),
): Promise<'synced' | 'skipped' | 'failed'> {
  const driver = await openDatabase();
  await runMigrations(driver);
  const repos = createRepositories(driver);

  const credentials = await loadCredentials(repos);
  if (!credentials) {
    return 'skipped';
  }
  const enabled = backgroundSyncEnabled(
    await repos.settings.get(BACKGROUND_SYNC_KEY),
    true,
  );
  if (!enabled) {
    return 'skipped';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // No network: skip silently, the OS retries on the next window.
    return 'skipped';
  }
  try {
    await syncWithStoredCredentials(driver, repos, { now });
  } catch {
    return 'failed';
  }
  await writeDeviceCalendar(driver, repos);
  return 'synced';
}

let backgroundFetchReady: Promise<void> | null = null;

/**
 * Register the daily fetch callback. Called once per JS context — also when
 * the OS relaunches the app headlessly for a background fetch, so the
 * callback must be attached before any fetch can fire.
 */
export function initBackgroundSync(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') {
    return Promise.resolve();
  }
  backgroundFetchReady ??= (async () => {
    try {
      const { BackgroundFetch } = await safeDynamicImport(
        () => import('@transistorsoft/capacitor-background-fetch'),
      );
      await BackgroundFetch.configure(
        {
          minimumFetchInterval: BACKGROUND_FETCH_INTERVAL_MINUTES,
          stopOnTerminate: false,
          startOnBoot: true,
          requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
        },
        async (taskId) => {
          try {
            await runBackgroundSync();
          } catch (error) {
            console.warn('[background-sync] failed', error);
          } finally {
            BackgroundFetch.finish(taskId);
          }
        },
        async (taskId) => {
          BackgroundFetch.finish(taskId);
        },
      );
    } catch (error) {
      console.warn('[background-sync] unavailable', error);
    }
  })();
  return backgroundFetchReady;
}

/** Pause/resume the OS schedule when the user flips the Settings toggle. */
export async function setBackgroundSyncSchedule(enabled: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') {
    return;
  }
  try {
    const { BackgroundFetch } = await safeDynamicImport(
      () => import('@transistorsoft/capacitor-background-fetch'),
    );
    if (enabled) {
      await BackgroundFetch.start();
    } else {
      await BackgroundFetch.stop();
    }
  } catch (error) {
    console.warn('[background-sync] schedule change failed', error);
  }
}
