import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../db/test-sqlite';
import { runMigrations } from '../../db/migration-runner';
import { createRepositories } from '../../db/repositories';
import type { Repositories } from '../../db/repositories';
import type { DbDriver } from '../../db/driver';
import type { GoogleRequestFn } from './http';
import {
  GOOGLE_CLIENT_ID_KEY,
  GOOGLE_REFRESH_TOKEN_KEY,
  MissingGoogleCredentialsError,
  disconnectGoogle,
  loadGoogleConnection,
  saveGoogleConnection,
  syncGoogleCalendar,
} from './sync';
import type { GoogleEvent } from './types';

const NOW = new Date('2026-11-09T10:00:00Z');

let calendarListCalls = 0;

/** One calendar; the second sync returns one fewer event (remote deletion). */
let remoteEvents: GoogleEvent[] = [
  {
    id: 'evt-1',
    status: 'confirmed',
    summary: 'Gym',
    location: 'Fitnes',
    start: { dateTime: '2026-11-09T18:00:00+01:00' },
    end: { dateTime: '2026-11-09T19:30:00+01:00' },
  },
  {
    id: 'evt-2',
    status: 'confirmed',
    summary: 'School trip',
    start: { date: '2026-11-20' },
    end: { date: '2026-11-22' },
  },
  {
    id: 'evt-3',
    status: 'cancelled',
    summary: 'Deleted meeting',
    start: { dateTime: '2026-11-10T09:00:00+01:00' },
    end: { dateTime: '2026-11-10T10:00:00+01:00' },
  },
];

/**
 * Fake request fn: serves the token refresh, the calendar list and the
 * event pages — no network involved.
 */
const fakeRequest: GoogleRequestFn = async (method, url) => {
  if (method === 'POST' && url.includes('oauth2.googleapis.com/token')) {
    return { access_token: 'fresh-access-token', expires_in: 3600 };
  }
  if (method === 'GET' && url.includes('/users/me/calendarList')) {
    calendarListCalls += 1;
    return {
      items: [
        { id: 'primary', summary: 'Jernej', primary: true },
        { id: 'family@example.com', summary: 'Family', primary: false },
      ],
    };
  }
  if (method === 'GET' && url.includes('/events')) {
    expect(url).toContain('singleEvents=true');
    expect(url).toContain('orderBy=startTime');
    return { items: remoteEvents };
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

async function setup(): Promise<{ driver: DbDriver; repos: Repositories }> {
  const { driver } = await createTestDatabase();
  await runMigrations(driver);
  const repos = createRepositories(driver);
  await saveGoogleConnection(repos, { clientId: 'client-123', refreshToken: 'rt-1' });
  return { driver, repos };
}

describe('syncGoogleCalendar', () => {
  beforeEach(() => {
    remoteEvents = [
      {
        id: 'evt-1',
        status: 'confirmed',
        summary: 'Gym',
        location: 'Fitnes',
        start: { dateTime: '2026-11-09T18:00:00+01:00' },
        end: { dateTime: '2026-11-09T19:30:00+01:00' },
      },
      {
        id: 'evt-2',
        status: 'confirmed',
        summary: 'School trip',
        start: { date: '2026-11-20' },
        end: { date: '2026-11-22' },
      },
      {
        id: 'evt-3',
        status: 'cancelled',
        summary: 'Deleted meeting',
        start: { dateTime: '2026-11-10T09:00:00+01:00' },
        end: { dateTime: '2026-11-10T10:00:00+01:00' },
      },
    ];
    calendarListCalls = 0;
  });

  it('syncs every calendar, skips cancelled events and records success', async () => {
    const { driver, repos } = await setup();

    const result = await syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest });

    expect(result).toMatchObject({ calendars: 2, events: 4 });
    expect(calendarListCalls).toBe(1);

    const events = await driver.select<{ id: string; title: string; all_day: number; start_utc: string; end_utc: string }>(
      "SELECT id, title, all_day, start_utc, end_utc FROM events WHERE source = 'google' ORDER BY id",
    );
    // Both calendars' events landed: 2 calendars × 2 non-cancelled events.
    expect(events).toHaveLength(4);
    expect(events.filter((row) => row.title === 'Gym')).toHaveLength(2);
    const allDay = events.find((row) => row.title === 'School trip');
    expect(allDay).toMatchObject({ all_day: 1, start_utc: '2026-11-20T00:00:00.000Z', end_utc: '2026-11-22T00:00:00.000Z' });

    // The bucket calendar exists for visibility toggling.
    const calendar = await driver.select<{ name: string }>("SELECT name FROM calendars WHERE id = 'google'");
    expect(calendar[0]?.name).toBe('Google');

    const state = await repos.syncState.get('google');
    expect(state?.status).toBe('success');
    expect(state?.lastSuccessUtc).toBe(NOW.toISOString());
  });

  it('is idempotent: syncing twice produces exactly the same rows', async () => {
    const { driver, repos } = await setup();
    await syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest });
    const snapshot = await driver.select<unknown>("SELECT * FROM events WHERE source = 'google' ORDER BY id");
    await syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest });
    const snapshot2 = await driver.select<unknown>("SELECT * FROM events WHERE source = 'google' ORDER BY id");
    expect(snapshot2).toEqual(snapshot);
  });

  it('removes events that disappeared remotely (full replace)', async () => {
    const { driver, repos } = await setup();
    await syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest });
    expect(await driver.select<unknown>("SELECT id FROM events WHERE source = 'google'")).toHaveLength(4);

    remoteEvents = remoteEvents.filter((event) => event.id !== 'evt-2');
    await syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest });
    const remaining = await driver.select<{ id: string }>("SELECT id FROM events WHERE source = 'google'");
    expect(remaining).toHaveLength(2);
  });

  it('throws MissingGoogleCredentialsError when not connected', async () => {
    const { driver } = await createTestDatabase();
    await runMigrations(driver);
    const repos = createRepositories(driver);

    // Configuration errors throw before the sync starts — same convention
    // as eAsistent — so no sync_state entry is recorded.
    await expect(
      syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest }),
    ).rejects.toBeInstanceOf(MissingGoogleCredentialsError);
    expect(await repos.syncState.get('google')).toBeNull();
  });

  it('records an error when the token refresh fails', async () => {
    const { driver, repos } = await setup();
    const failing: GoogleRequestFn = async (method, url) => {
      if (method === 'POST' && url.includes('/token')) {
        throw new Error('network down');
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    };
    await expect(
      syncGoogleCalendar(driver, repos, { now: NOW, request: failing }),
    ).rejects.toThrow('network down');
    const state = await repos.syncState.get('google');
    expect(state?.status).toBe('error');
    expect(state?.lastError).toBe('network down');
  });
});

describe('connection storage', () => {
  it('round-trips and loads the connection', async () => {
    const { driver } = await createTestDatabase();
    await runMigrations(driver);
    const repos = createRepositories(driver);
    expect(await loadGoogleConnection(repos)).toBeNull();
    await saveGoogleConnection(repos, { clientId: 'c-1', refreshToken: 'r-1' });
    expect(await loadGoogleConnection(repos)).toEqual({ clientId: 'c-1', refreshToken: 'r-1' });
    expect(await repos.settings.get(GOOGLE_CLIENT_ID_KEY)).toBe('c-1');
    expect(await repos.settings.get(GOOGLE_REFRESH_TOKEN_KEY)).toBe('r-1');
    void driver;
  });

  it('disconnect removes the token, rows, calendar and sync state', async () => {
    const { driver, repos } = await setup();
    await syncGoogleCalendar(driver, repos, { now: NOW, request: fakeRequest });

    await disconnectGoogle(driver, repos);

    expect(await loadGoogleConnection(repos)).toBeNull();
    expect(await repos.settings.get(GOOGLE_CLIENT_ID_KEY)).toBe('client-123'); // client ID kept for reconnect
    expect(await driver.select<unknown>("SELECT * FROM events WHERE source = 'google'")).toHaveLength(0);
    expect(await driver.select<unknown>("SELECT * FROM calendars WHERE id = 'google'")).toHaveLength(0);
    expect(await driver.select<unknown>("SELECT * FROM sync_state WHERE source = 'google'")).toHaveLength(0);
  });
});
