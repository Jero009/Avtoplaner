import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../db/test-sqlite';
import { runMigrations } from '../../db/migration-runner';
import { createRepositories } from '../../db/repositories';
import type { Repositories } from '../../db/repositories';
import type { DbDriver } from '../../db/driver';
import type { RequestFn } from '../easistent/http';
import { syncEasistent } from '../easistent/sync';
import {
  GROUP_CHOICES_KEY,
  serializeChoices,
  slotKeyOf,
} from '../easistent/group-choice';
import {
  announcedTest,
  cancelledHour,
  lessonBlock,
  lessonWithHomework,
  loginResponse,
  schoolEvent,
  splitGroupTimetable,
  substitution,
  timetableChunkResponse,
} from '../easistent/fixtures';
import {
  DEVICE_CALENDAR_LAST_WRITE_KEY,
  DEVICE_CALENDAR_TARGET_KEY,
  buildDesiredItems,
  removeAllDeviceCalendarEvents,
  syncDeviceCalendar,
  type DeviceCalendarOp,
  type NativeCalendarAdapter,
} from './sync';

const NOW = new Date('2026-11-07T10:00:00Z');
const TARGET = '55';
const LABELS = { homework: 'domača naloga', cancelled: 'odpadla ura' };

const ALL_FIXTURES = [
  lessonBlock(),
  lessonWithHomework(),
  announcedTest(),
  substitution(),
  cancelledHour(),
  schoolEvent(),
];

/**
 * In-memory CalendarProvider test double: (calendarId, nativeId) → event.
 * Records every applyChanges batch for op-level assertions.
 */
class FakeCalendarAdapter implements NativeCalendarAdapter {
  events = new Map<string, { title: string; description: string | null }>();
  private nextId = 1000;
  permissionState: 'granted' | 'denied' = 'granted';
  batches: DeviceCalendarOp[][] = [];

  async checkPermissions() {
    const state = this.permissionState;
    return { readCalendar: state, writeCalendar: state } as const;
  }

  async applyChanges(ops: DeviceCalendarOp[]) {
    this.batches.push(ops.map((op) => ({ ...op })));
    const createdIds: number[] = [];
    for (const op of ops) {
      if (op.op === 'create') {
        const id = this.nextId++;
        this.events.set(`${op.calendarId}:${id}`, {
          title: op.title,
          description: op.description,
        });
        createdIds.push(id);
      } else if (op.op === 'update') {
        const key = `${op.calendarId}:${op.nativeId}`;
        if (!this.events.has(key)) {
          throw new Error(`update of unknown event ${key}`);
        }
        this.events.set(key, { title: op.title, description: op.description });
      } else {
        this.events.delete(`${op.calendarId}:${op.nativeId}`);
      }
    }
    return { createdIds };
  }

  titles(): string[] {
    return [...this.events.values()].map((event) => event.title);
  }
}

interface Env {
  driver: DbDriver;
  repos: Repositories;
  adapter: FakeCalendarAdapter;
}

async function setup(entries = ALL_FIXTURES): Promise<Env> {
  const { driver } = await createTestDatabase();
  await runMigrations(driver);
  const repos = createRepositories(driver);
  await repos.calendars.ensureLocalCalendar();
  await repos.settings.set(DEVICE_CALENDAR_TARGET_KEY, TARGET);
  if (entries.length > 0) {
    await syncEasistent(driver, repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(entries),
    });
  }
  return { driver, repos, adapter: new FakeCalendarAdapter() };
}

function fakeApi(entries: ReturnType<typeof lessonBlock>[]): RequestFn {
  return async (_method, url) =>
    url.endsWith('/login')
      ? loginResponse()
      : timetableChunkResponse(entries);
}

async function mappingCount(env: Env): Promise<number> {
  const rows = await env.driver.select<{ n: number }>(
    'SELECT COUNT(*) AS n FROM device_calendar_map',
  );
  return rows[0]!.n;
}

async function mappings(env: Env) {
  return env.driver.select<{
    source_key: string;
    calendar_id: string;
    native_event_id: number;
    content_hash: string;
  }>('SELECT * FROM device_calendar_map ORDER BY source_key');
}

let env: Env;

beforeEach(async () => {
  env = await setup();
});

describe('syncDeviceCalendar — idempotency', () => {
  it('creates every item once; a second sync is a complete no-op', async () => {
    const first = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });

    expect(first.status).toBe('synced');
    expect(first.created).toBe(first.total);
    expect(first.total).toBeGreaterThan(0);
    expect(await mappingCount(env)).toBe(first.total);

    const mappingRows = await mappings(env);

    const second = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(second).toMatchObject({ status: 'synced', created: 0, updated: 0, deleted: 0 });
    // No provider call at all the second time.
    expect(env.adapter.batches).toHaveLength(1);
    // ...and the mapping table is unchanged (no delete+recreate).
    expect(await mappings(env)).toEqual(mappingRows);
  });

  it('updates in place on content change — never delete+recreate', async () => {
    await syncDeviceCalendar(env.driver, env.repos, env.adapter, { labels: LABELS, now: NOW });
    const before = await mappings(env);
    const lessonRow = before.find((row) => row.source_key.includes('ea-lesson:'))!;

    // The room changes in the source data.
    const changed = ALL_FIXTURES.map((entry) =>
      entry.slug === 'urnik$700422635' ? { ...entry, classroom: 'P256' } : entry,
    );
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(changed),
    });

    const second = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(second).toMatchObject({ status: 'synced', created: 0, deleted: 0 });
    expect(second.updated).toBeGreaterThan(0);

    const after = await mappings(env);
    const updatedRow = after.find((row) => row.source_key === lessonRow.source_key)!;
    // Same native id — updated in place.
    expect(updatedRow.native_event_id).toBe(lessonRow.native_event_id);
    expect(after.length).toBe(before.length);
    expect(env.adapter.batches[1]!.every((op) => op.op !== 'create' && op.op !== 'delete')).toBe(true);
  });

  it('deletes the native event when the source row disappears', async () => {
    await syncDeviceCalendar(env.driver, env.repos, env.adapter, { labels: LABELS, now: NOW });
    const before = await mappings(env);
    const droppedKey = before[0]!.source_key;
    const nativeId = before[0]!.native_event_id;

    await env.driver.run('DELETE FROM events WHERE id = ?', [droppedKey]);

    const second = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(second.deleted).toBe(1);
    expect(env.adapter.events.has(`${TARGET}:${nativeId}`)).toBe(false);
    expect(await mappingCount(env)).toBe(before.length - 1);
  });

  it('removes the homework event when homework is marked done', async () => {
    await syncDeviceCalendar(env.driver, env.repos, env.adapter, { labels: LABELS, now: NOW });
    const before = await mappings(env);
    const homeworkRow = before.find((row) => row.source_key.startsWith('ea-hw:'))!;
    expect(homeworkRow).toBeDefined();

    await env.repos.homework.setDone(homeworkRow.source_key, true);

    const second = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(second.deleted).toBe(1);
    expect(env.adapter.events.has(`${TARGET}:${homeworkRow.native_event_id}`)).toBe(false);
    expect(
      (await mappings(env)).some((row) => row.source_key === homeworkRow.source_key),
    ).toBe(false);
  });

  it('moves all events when the target calendar changes', async () => {
    await syncDeviceCalendar(env.driver, env.repos, env.adapter, { labels: LABELS, now: NOW });
    const oldCount = env.adapter.events.size;
    expect(oldCount).toBeGreaterThan(0);

    await env.repos.settings.set(DEVICE_CALENDAR_TARGET_KEY, '99');
    const second = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(second.deleted).toBe(oldCount);
    expect(second.created).toBe(oldCount);

    // Old calendar empty, new calendar holds everything.
    expect([...env.adapter.events.keys()].every((key) => key.startsWith('99:'))).toBe(true);
    const rows = await mappings(env);
    expect(rows.every((row) => row.calendar_id === '99')).toBe(true);
    expect(rows.length).toBe(oldCount);
  });
});

describe('syncDeviceCalendar — content rules', () => {
  it('writes tests as "🧪 <subject> — <topic>" and homework at the owning lesson hour', async () => {
    const [events, homework, lessons, subjects] = await Promise.all([
      env.repos.events.listAll(),
      env.repos.homework.listAll(),
      env.repos.lessons.listAll(),
      env.repos.subjects.listAll(),
    ]);
    const desired = buildDesiredItems(
      events,
      homework,
      lessons,
      new Map(subjects.map((subject) => [subject.id, subject])),
      LABELS,
    );

    const test = [...desired.entries()].find(([key]) => key.startsWith('ea-test:'))!;
    expect(test[1].title).toBe('🧪 RKO — 1. Pisno ocenjevanje znanja');
    expect(test[1].description).toContain('OSI model');

    const hwKey = homework.find((item) => item.source === 'easistent')!.id;
    const hwItem = desired.get(hwKey)!;
    expect(hwItem.title).toBe('📝 MAT — domača naloga');
    expect(hwItem.description).toBe('str. 45, naloge 1–10');
    // Placed at the owning lesson hour (same subject AND same day), not all-day.
    const hwSubject = homework.find((item) => item.id === hwKey)!.subjectId;
    const owning = lessons.find(
      (lesson) =>
        lesson.subjectId === hwSubject &&
        lesson.startUtc.slice(0, 10) === '2026-10-23',
    )!;
    expect(owning).toBeDefined();
    expect(hwItem.startMs).toBe(Date.parse(owning.startUtc));
    expect(hwItem.endMs).toBe(Date.parse(owning.endUtc));
    expect(hwItem.allDay).toBe(false);

    // Cancelled hours are MARKED, not skipped.
    const cancelled = [...desired.entries()].find(([key]) => key.startsWith('ea-cancelled:'))!;
    expect(cancelled[1].title.startsWith('❌ ')).toBe(true);
    expect(cancelled[1].description).toContain('odpadla ura');
  });
});

describe('syncDeviceCalendar — guards', () => {
  it('is disabled without a target calendar (automatic post-sync hook no-ops)', async () => {
    await env.repos.settings.remove(DEVICE_CALENDAR_TARGET_KEY);
    const result = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(result.status).toBe('disabled');
    expect(env.adapter.batches).toHaveLength(0);
    expect(await mappingCount(env)).toBe(0);
  });

  it('degrades to permission-denied: no provider ops, no mapping writes', async () => {
    env.adapter.permissionState = 'denied';
    const result = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(result.status).toBe('permission-denied');
    expect(env.adapter.batches).toHaveLength(0);
    expect(env.adapter.events.size).toBe(0);
    expect(await mappingCount(env)).toBe(0);
    expect(await env.repos.settings.get(DEVICE_CALENDAR_LAST_WRITE_KEY)).toBeNull();
  });

  it('respects the group picker: the non-selected group never reaches the calendar', async () => {
    // Every split slot holds AAA + BBB; the user picked AAA (api id 111)
    // everywhere. Slots WITHOUT a choice keep both groups by design, so we
    // must choose in all four split slots for a clean assertion.
    const choice = serializeChoices({
      [slotKeyOf('2026-11-09', '08:35', '09:20')]: '111',
      [slotKeyOf('2026-11-09', '12:30', '13:15')]: '111',
      [slotKeyOf('2026-11-10', '10:50', '11:35')]: '111',
      [slotKeyOf('2026-11-12', '09:25', '10:10')]: '111',
    });
    await env.repos.settings.set(GROUP_CHOICES_KEY, choice);
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(splitGroupTimetable()),
    });

    const result = await syncDeviceCalendar(env.driver, env.repos, env.adapter, {
      labels: LABELS,
      now: NOW,
    });
    expect(result.status).toBe('synced');

    const titles = env.adapter.titles();
    expect(titles.some((title) => title.includes('AAA'))).toBe(true);
    expect(titles.some((title) => title.includes('BBB'))).toBe(false);
    // The BBB group's homework ("Vaje BBB") never left the app either.
    expect(titles.some((title) => title.includes('Vaje BBB'))).toBe(false);
    expect(titles.some((title) => title.includes('Naloga AAA'))).toBe(false); // homework uses the label, not the source title
  });

  it('removeAllDeviceCalendarEvents deletes every mapped event and forgets the mapping', async () => {
    await syncDeviceCalendar(env.driver, env.repos, env.adapter, { labels: LABELS, now: NOW });
    const count = env.adapter.events.size;
    expect(count).toBeGreaterThan(0);

    const removed = await removeAllDeviceCalendarEvents(env.driver, env.repos, env.adapter);
    expect(removed).toBe(count);
    expect(env.adapter.events.size).toBe(0);
    expect(await mappingCount(env)).toBe(0);
    expect(await env.repos.settings.get(DEVICE_CALENDAR_LAST_WRITE_KEY)).toBeNull();
  });
});
