import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { useDb } from '../../app/db-context';
import { GoogleError } from './http';
import {
  buildAuthUrl,
  createOAuthState,
  createPkcePair,
  exchangeCode,
  redirectUriFor,
} from './oauth';
import {
  awaitAuthorizationCode,
  cancelPendingAuthorization,
} from './oauth-callback';
import {
  MissingGoogleClientIdError,
  MissingGoogleCredentialsError,
  disconnectGoogle,
  saveGoogleConnection,
  syncGoogleCalendar,
} from './sync';
import { EMBEDDED_CLIENT_ID } from './embedded-client-id';
import { safeDynamicImport, StaleChunkError } from '../../utils/safe-dynamic-import';

export type GoogleFeedback = { kind: 'info' | 'error'; text: string } | null;

/**
 * Shared UI driver for the Google Calendar integration: runs the consent
 * flow, stores the resulting refresh token and turns every failure into a
 * translated message. Tokens are never rendered or logged.
 */
export function useGoogleSync() {
  const { t } = useTranslation();
  const dbState = useDb();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<GoogleFeedback>(null);
  // Keeps the connect flow's abort switch across renders.
  const connectAbort = useRef<(() => void) | null>(null);

  const errorMessage = useCallback(
    (error: unknown): string => {
      // Stale chunk after an app update — a one-time reload is already
      // scheduled; tell the user to just tap again.
      if (error instanceof StaleChunkError) {
        return t('common.appUpdated');
      }
      if (error instanceof MissingGoogleClientIdError) {
        return t('google.errors.missingClientId');
      }
      if (error instanceof MissingGoogleCredentialsError) {
        return t('google.errors.missingCredentials');
      }
      if (error instanceof GoogleError) {
        switch (error.kind) {
          case 'auth':
            return t('google.errors.auth');
          case 'network':
            return t('google.errors.network');
          case 'http':
            return t('google.errors.http');
          case 'parse':
            return t('google.errors.parse');
        }
      }
      const message = error instanceof Error ? error.message : '';
      if (message.includes('timed out') || message.includes('cancelled')) {
        return t('google.connectCancelled');
      }
      return message || t('google.errors.unknown');
    },
    [t],
  );

  /**
   * Full consent flow for the given OAuth client ID. Opens the system
   * browser (Android) or navigates the page (web), waits for the redirect
   * via oauth-callback, stores the refresh token and runs the first sync.
   */
  const connect = useCallback(
    async (clientIdInput: string): Promise<boolean> => {
      const db = dbState.status === 'ready' ? dbState.database : null;
      // Field left empty → fall back to the client ID bundled with the app,
      // so the released build connects out of the box for everyone.
      const clientId = clientIdInput.trim() || EMBEDDED_CLIENT_ID;
      if (!db) {
        return false;
      }
      if (clientId.length === 0) {
        setFeedback({ kind: 'error', text: t('google.errors.missingClientId') });
        return false;
      }
      setConnecting(true);
      setFeedback(null);
      try {
        const redirectUri = redirectUriFor(
          clientId,
          Capacitor.isNativePlatform() ? undefined : window.location.origin,
        );
        const [pair, state] = await Promise.all([
          createPkcePair(),
          createOAuthState(),
        ]);
        const url = buildAuthUrl({
          clientId,
          redirectUri,
          codeChallenge: pair.challenge,
          state,
        });

        const codePromise = awaitAuthorizationCode(state);
        connectAbort.current = () =>
          cancelPendingAuthorization('Connection cancelled.');
        codePromise.catch(() => undefined); // no unhandled rejection on cancel

        // Hand off to the browser: on Android the deep link comes back to
        // us via appUrlOpen, on web Google redirects to <origin>/oauth2redirect.
        if (Capacitor.isNativePlatform()) {
          const { Browser } = await safeDynamicImport(() => import('@capacitor/browser'));
          await Browser.open({ url });
        } else {
          window.location.assign(url);
        }

        const code = await codePromise;
        const tokens = await exchangeCode({
          clientId,
          code,
          codeVerifier: pair.verifier,
          redirectUri,
        });
        if (!tokens.refreshToken) {
          throw new GoogleError(
            'auth',
            'Google did not return a refresh token — reconnect with full consent.',
          );
        }
        await saveGoogleConnection(db.repos, { clientId, refreshToken: tokens.refreshToken });

        await syncGoogleCalendar(db.driver, db.repos);
        setFeedback({ kind: 'info', text: t('google.connectSuccess') });
        return true;
      } catch (error) {
        setFeedback({ kind: 'error', text: errorMessage(error) });
        return false;
      } finally {
        connectAbort.current = null;
        setConnecting(false);
      }
    },
    [dbState, errorMessage, t],
  );

  const sync = useCallback(async (): Promise<boolean> => {
    const db = dbState.status === 'ready' ? dbState.database : null;
    if (!db) {
      return false;
    }
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncGoogleCalendar(db.driver, db.repos);
      setFeedback({
        kind: 'info',
        text: t('google.syncSummary', {
          events: result.events,
          calendars: result.calendars,
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

  const disconnect = useCallback(async (): Promise<void> => {
    const db = dbState.status === 'ready' ? dbState.database : null;
    if (!db) {
      return;
    }
    await disconnectGoogle(db.driver, db.repos);
    setFeedback({ kind: 'info', text: t('google.disconnected') });
  }, [dbState, t]);

  return { connecting, syncing, feedback, connect, sync, disconnect };
}
