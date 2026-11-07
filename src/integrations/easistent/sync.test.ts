import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../../db/test-sqlite';
import { runMigrations } from '../../db/migration-runner';
import { createRepositories } from '../../db/repositories';
import type { Repositories } from '../../db/repositories';
import type { DbDriver } from '../../db/driver';
import { exportAllTables } from '../../db/backup-service';
import type { RequestFn } from './http';
import { EasistentError } from './http';
import {
  EASISTENT_PASSWORD_KEY,
  EASISTENT_USERNAME_KEY,
  MissingCredentialsError,
  loadCredentials,
  syncEasistent,
  syncWithStoredCredentials,
} from './sync';
import {
  announcedTest,
  cancelledHour,
  lessonBlock,
  lessonWithHomework,
  loginResponse,
  schoolEvent,
  substitution,
  timetableChunkResponse,
} from './fixtures';

const NOW = new Date('2026-11-07T10:00:00Z');

const ALL_FIXTURES = [
  lessonBlock(),
  lessonWithHomework(),
  announcedTest(),
  substitution(),
  cancelledHour(),
  schoolEvent(),
];

async function setup(): Promise<{ driver: DbDriver; repos: Repositories }> {
  const { driver } = await createTestDatabase();
  await runMigrations(driver);
  const repos = createRepositories(driver);
  await repos.calendars.ensureLocalCalendar();
  return { driver, repos };
}

function fakeApi(entries = ALL_FIXTURES): RequestFn {
  return vi.fn<(RequestFn)>().mockImplementation(async (_method, url) =>
    url.endsWith('/login')
      ? loginResponse()
      : timetableChunkResponse(entries),
  );
}

async function countRows(driver: DbDriver, table: string): Promise<number> {
  const rows = await driver.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0]!.n;
}

let env: { driver: DbDriver; repos: Repositories };

beforeEach(async () => {
  env = await setup();
});

describe('syncEasistent', () => {
  it('stores lessons, homework, tests and events with an eAsistent calendar', async () => {
    const result = await syncEasistent(
      env.driver,
      env.repos,
      { username: 'u', password: 'p' },
      { now: NOW, request: fakeApi() },
    );

    expect(result.lessons).toBeGreaterThanOrEqual(5);
    expect(result.homework).toBe(1);
    expect(result.tests).toBe(1);
    expect(result.events).toBe(6);

    const calendar = await env.repos.calendars.get('easistent');
    expect(calendar).toMatchObject({ source: 'easistent', visible: true });

    const events = await env.repos.events.listAll();
    const sources = new Set(events.map((event) => event.source));
    expect(sources).toEqual(new Set(['easistent']));
    // Announced test lands with its external id prefix used for styling.
    expect(
      events.some((event) => event.externalId === 'ea-test:884612'),
    ).toBe(true);

    const lessons = await env.repos.lessons.listAll();
    expect(lessons.some((lesson) => lesson.status === 'substitution')).toBe(true);
    expect(lessons.some((lesson) => lesson.status === 'cancelled')).toBe(true);

    const state = await env.repos.syncState.get('easistent');
    expect(state).toMatchObject({
      status: 'success',
      lastSuccessUtc: NOW.toISOString(),
      lastError: null,
    });
  });

  it('is idempotent: syncing the same data twice creates no duplicates', async () => {
    const request = fakeApi();
    const first = await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request,
    });
    const countsAfterFirst = await rowCounts(env.driver);

    const second = await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: new Date('2026-11-07T12:00:00Z'),
      request,
    });
    const countsAfterSecond = await rowCounts(env.driver);

    expect(countsAfterSecond).toEqual(countsAfterFirst);
    expect(second.lessons).toBe(first.lessons);
    expect(second.homework).toBe(first.homework);
    expect(second.tests).toBe(first.tests);
  });

  it('keeps locally checked-off homework done across syncs', async () => {
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });

    const homework = await env.repos.homework.listAll();
    expect(homework).toHaveLength(1);
    expect(homework[0]!.done).toBe(false);

    await env.repos.homework.setDone(homework[0]!.id, true);

    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: new Date('2026-11-07T12:00:00Z'),
      request: fakeApi(),
    });

    const after = await env.repos.homework.listAll();
    expect(after).toHaveLength(1);
    expect(after[0]!.done).toBe(true);
    expect(after[0]!.id).toBe(homework[0]!.id);
  });

  it('does not touch local events or manual homework', async () => {
    await env.repos.events.createLocal({
      calendarId: 'local',
      title: 'Zobozdravnik',
      description: null,
      location: null,
      startUtc: '2026-11-07T08:00:00.000Z',
      endUtc: '2026-11-07T09:00:00.000Z',
      allDay: false,
    });

    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });

    const events = await env.repos.events.listAll();
    const local = events.filter((event) => event.source === 'local');
    expect(local).toHaveLength(1);
    expect(local[0]!.title).toBe('Zobozdravnik');
  });

  it('records the error in sync_state and rethrows on API failure', async () => {
    const request = vi.fn<(RequestFn)>().mockImplementation(async (_method, url) => {
      if (url.endsWith('/login')) {
        throw new EasistentError('auth', 'eAsistent request failed with HTTP 401', 401);
      }
      return loginResponse();
    });

    await expect(
      syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
        now: NOW,
        request,
      }),
    ).rejects.toThrow(EasistentError);

    const state = await env.repos.syncState.get('easistent');
    expect(state).toMatchObject({ status: 'error' });
    expect(state!.lastError).toContain('401');
    // Credentials never appear in the stored error.
    expect(state!.lastError).not.toContain('p');
  });

  it('replaces removed eAsistent rows on the next sync', async () => {
    const full = fakeApi();
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: full,
    });

    // Next sync returns fewer entries (test + homework gone server-side).
    const reduced = fakeApi([lessonBlock(), substitution()]);
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: reduced,
    });

    const events = await env.repos.events.listAll();
    expect(events.some((event) => event.externalId === 'ea-test:884612')).toBe(false);
    expect(await env.repos.homework.listAll()).toHaveLength(0);
  });
});

describe('syncWithStoredCredentials', () => {
  it('throws MissingCredentialsError when nothing is configured', async () => {
    await expect(
      syncWithStoredCredentials(env.driver, env.repos, { now: NOW }),
    ).rejects.toThrow(MissingCredentialsError);
  });

  it('loads credentials from the settings table and syncs', async () => {
    await env.repos.settings.set(EASISTENT_USERNAME_KEY, 'user@example');
    await env.repos.settings.set(EASISTENT_PASSWORD_KEY, 'secret');

    const credentials = await loadCredentials(env.repos);
    expect(credentials).toEqual({ username: 'user@example', password: 'secret' });

    const result = await syncWithStoredCredentials(env.driver, env.repos, {
      now: NOW,
      request: fakeApi(),
    });
    expect(result.events).toBeGreaterThan(0);
  });
});

describe('backup export with eAsistent data', () => {
  it('includes eAsistent rows but never the password', async () => {
    await env.repos.settings.set(EASISTENT_USERNAME_KEY, 'user@example');
    await env.repos.settings.set(EASISTENT_PASSWORD_KEY, 'secret');
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });

    const data = await exportAllTables(env.driver);

    const keys = (data.settings as { key: string }[]).map((row) => row.key);
    expect(keys).toContain(EASISTENT_USERNAME_KEY);
    expect(keys).not.toContain(EASISTENT_PASSWORD_KEY);
    expect(JSON.stringify(data)).not.toContain('secret');

    // eAsistent data itself is part of the backup.
    expect(data.events.length).toBeGreaterThan(0);
    expect(
      (data.events as { source: string }[]).some((row) => row.source === 'easistent'),
    ).toBe(true);
    expect(data.homework.length).toBe(1);
    expect(data.lessons.length).toBeGreaterThan(0);
  });
});

async function rowCounts(driver: DbDriver) {
  return {
    events: await countRows(driver, 'events'),
    lessons: await countRows(driver, 'lessons'),
    homework: await countRows(driver, 'homework'),
    subjects: await countRows(driver, 'subjects'),
    calendars: await countRows(driver, 'calendars'),
  };
}
