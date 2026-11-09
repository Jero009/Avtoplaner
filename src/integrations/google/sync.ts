import type { DbDriver } from '../../db/driver';
import type { Repositories } from '../../db/repositories';
import { addDaysToDayIso, todayDayIso } from '../../utils/dates';
import { createGoogleCalendarClient } from './client';
import { GoogleError, type GoogleRequestFn, defaultGoogleRequest } from './http';
import { refreshAccessToken } from './oauth';
import { parseGoogleEvents } from './parse';
import type { GoogleEvent } from './types';

/**
 * Settings-table keys holding the Google connection. The refresh token is a
 * long-lived secret: never included in backups, never rendered or logged.
 * The client ID is public by design (PKCE, no embedded secret).
 */
export const GOOGLE_CLIENT_ID_KEY = 'google.clientId';
export const GOOGLE_REFRESH_TOKEN_KEY = 'google.refreshToken';

/** Never included in backups (see backup-service redaction). */
export const GOOGLE_REDACTED_SETTING_KEYS: readonly string[] = [
  GOOGLE_REFRESH_TOKEN_KEY,
];

/** Sync window: thirty days back + 120 days ahead (events live further out than a timetable). */
export const GOOGLE_SYNC_PAST_DAYS = 30;
export const GOOGLE_SYNC_FUTURE_DAYS = 120;

export interface GoogleSyncOptions {
  now?: Date;
  request?: GoogleRequestFn;
}

export interface GoogleSyncResult {
  syncedAtUtc: string;
  calendars: number;
  events: number;
}

export class MissingGoogleClientIdError extends Error {
  constructor() {
    super('Google OAuth client ID is not configured');
    this.name = 'MissingGoogleClientIdError';
  }
}

export class MissingGoogleCredentialsError extends Error {
  constructor() {
    super('Google account is not connected');
    this.name = 'MissingGoogleCredentialsError';
  }
}

export interface GoogleConnection {
  clientId: string;
  refreshToken: string;
}

/** Read the stored connection from the settings table. */
export async function loadGoogleConnection(
  repos: Repositories,
): Promise<GoogleConnection | null> {
  const [clientId, refreshToken] = await Promise.all([
    repos.settings.get(GOOGLE_CLIENT_ID_KEY),
    repos.settings.get(GOOGLE_REFRESH_TOKEN_KEY),
  ]);
  if (!clientId || !refreshToken) {
    return null;
  }
  return { clientId, refreshToken };
}

/** Store the connection after a successful consent flow. */
export async function saveGoogleConnection(
  repos: Repositories,
  connection: GoogleConnection,
): Promise<void> {
  await repos.settings.set(GOOGLE_CLIENT_ID_KEY, connection.clientId);
  await repos.settings.set(GOOGLE_REFRESH_TOKEN_KEY, connection.refreshToken);
}

/** Remove the connection and every synced Google row. */
export async function disconnectGoogle(
  driver: DbDriver,
  repos: Repositories,
): Promise<void> {
  await repos.settings.remove(GOOGLE_REFRESH_TOKEN_KEY);
  await driver.run("DELETE FROM events WHERE source = 'google'");
  await driver.run("DELETE FROM calendars WHERE id = 'google'");
  await driver.run("DELETE FROM sync_state WHERE source = 'google'");
}

/**
 * Sync every Google Calendar of the connected account into the local
 * database. Always does a full replace inside one transaction and records
 * the outcome in `sync_state`.
 *
 * Idempotency: row ids are `g:<calendarId>:<eventId>` — syncing twice in a
 * row produces exactly the same rows, no duplicates.
 */
export async function syncGoogleCalendar(
  driver: DbDriver,
  repos: Repositories,
  options: GoogleSyncOptions = {},
): Promise<GoogleSyncResult> {
  const now = options.now ?? new Date();
  const request = options.request ?? defaultGoogleRequest;
  const connection = await loadGoogleConnection(repos);
  if (!connection) {
    throw new MissingGoogleCredentialsError();
  }

  try {
    const token = await refreshAccessToken({
      clientId: connection.clientId,
      refreshToken: connection.refreshToken,
      request,
    });
    const client = createGoogleCalendarClient(token.accessToken, request);

    const calendars = await client.listCalendars();
    const timeMin = addDaysToDayIso(todayDayIso(now), -GOOGLE_SYNC_PAST_DAYS);
    const timeMax = addDaysToDayIso(todayDayIso(now), GOOGLE_SYNC_FUTURE_DAYS);
    const window = { timeMin: `${timeMin}T00:00:00Z`, timeMax: `${timeMax}T23:59:59Z` };

    const remoteEvents = (
      await Promise.all(
        calendars.map(async (calendar) =>
          (await client.listEvents(calendar.id, window)).map(
            (event): GoogleEvent => ({
              ...event,
              // Event ids are only unique per calendar; namespace them so
              // two calendars never collide on UNIQUE(source, external_id).
              id: `g:${calendar.id}:${event.id}`,
            }),
          ),
        ),
      )
    ).flat();
    const parsed = parseGoogleEvents(remoteEvents);

    const result = await driver.transaction<GoogleSyncResult>(() =>
      replaceGoogleRows(driver, repos, parsed, now, calendars.length),
    );
    await repos.syncState.recordSuccess('google', now.toISOString());
    return result;
  } catch (error) {
    const message =
      error instanceof GoogleError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    await repos.syncState.recordError('google', message);
    throw error;
  }
}

async function replaceGoogleRows(
  driver: DbDriver,
  repos: Repositories,
  parsed: ReturnType<typeof parseGoogleEvents>,
  now: Date,
  calendarCount: number,
): Promise<GoogleSyncResult> {
  await repos.calendars.ensureGoogleCalendar();

  await driver.run("DELETE FROM events WHERE source = 'google'");
  const updatedAt = now.toISOString();
  for (const event of parsed) {
    await driver.run(
      `INSERT INTO events (id, calendar_id, source, external_id, title, description,
        location, start_utc, end_utc, all_day, recurring, updated_at, subject_id)
       VALUES (?, 'google', 'google', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        event.externalId,
        event.externalId,
        event.title,
        event.description,
        event.location,
        event.startUtc,
        event.endUtc,
        event.allDay ? 1 : 0,
        event.recurring ? 1 : 0,
        updatedAt,
      ],
    );
  }

  return { syncedAtUtc: updatedAt, events: parsed.length, calendars: calendarCount };
}
