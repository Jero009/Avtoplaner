import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '../../app/db-context';
import { EasistentError } from './http';
import {
  MissingCredentialsError,
  loadCredentials,
  syncWithStoredCredentials,
} from './sync';
import { createEasistentClient } from './client';
import { createNativeCalendarAdapter } from '../device-calendar/plugin';
import { syncDeviceCalendarIfEnabled } from '../device-calendar/sync';
import { calendarLabels } from '../device-calendar/labels';

export type EasistentFeedback = { kind: 'info' | 'error'; text: string } | null;

/**
 * Shared UI driver for the eAsistent sync: runs the sync with the stored
 * credentials and turns errors into translated messages. Credentials are
 * never rendered or logged.
 */
export function useEasistentSync() {
  const { t } = useTranslation();
  const dbState = useDb();
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<EasistentFeedback>(null);

  const errorMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof MissingCredentialsError) {
        return t('easistent.errors.missingCredentials');
      }
      if (error instanceof EasistentError) {
        switch (error.kind) {
          case 'auth':
            return t('easistent.errors.auth');
          case 'network':
            return t('easistent.errors.network');
          case 'http':
            return t('easistent.errors.http');
          case 'parse':
            return t('easistent.errors.parse');
        }
      }
      return error instanceof Error && error.message
        ? error.message
        : t('easistent.errors.unknown');
    },
    [t],
  );

  /** Login-only check with the stored credentials. */
  const testConnection = useCallback(async (): Promise<boolean> => {
    if (dbState.status !== 'ready') {
      return false;
    }
    setTesting(true);
    setFeedback(null);
    try {
      const { repos } = dbState.database;
      const credentials = await loadCredentials(repos);
      if (!credentials) {
        setFeedback({ kind: 'error', text: t('easistent.errors.missingCredentials') });
        return false;
      }
      await createEasistentClient(credentials).testConnection();
      setFeedback({ kind: 'info', text: t('easistent.connectionOk') });
      return true;
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) });
      return false;
    } finally {
      setTesting(false);
    }
  }, [dbState, errorMessage, t]);

  /** Full sync; returns true on success. */
  const sync = useCallback(async (): Promise<boolean> => {
    if (dbState.status !== 'ready') {
      return false;
    }
    setSyncing(true);
    setFeedback(null);
    try {
      const { driver, repos } = dbState.database;
      const result = await syncWithStoredCredentials(driver, repos);
      // When a device calendar is configured, mirror the fresh data into
      // it right away (idempotent; failures must not fail the sync).
      try {
        await syncDeviceCalendarIfEnabled(
          driver,
          repos,
          createNativeCalendarAdapter(),
          await calendarLabels(),
        );
      } catch (error) {
        console.warn('[device-calendar] post-sync write failed', error);
      }
      setFeedback({
        kind: 'info',
        text: t('easistent.syncSummary', {
          lessons: result.lessons,
          homework: result.homework,
          tests: result.tests,
        }),
      });
      return true;
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) });
      return false;
    } finally {
      setSyncing(false);
    }
  }, [dbState, errorMessage, t]);

  return { syncing, testing, feedback, setFeedback, sync, testConnection };
}
