import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../../db/test-sqlite';
import { runMigrations } from '../../db/migration-runner';
import { createRepositories } from '../../db/repositories';
import type { Repositories } from '../../db/repositories';
import type { DbDriver } from '../../db/driver';
import { formatUtcInZone, wallTimeToUtc } from '../../utils/dates';
import type { RequestFn } from './http';
import { syncEasistent } from './sync';
import { parseTimetable, subjectRowId } from './parse';
import {
  loginResponse,
  splitGroupTimetable,
  timetableChunkResponse,
} from './fixtures';
import {
  GROUP_CHOICES_KEY,
  applyGroupChoices,
  detectSlotConflicts,
  filterEntriesByGroupChoices,
  isoWeekdayOf,
  parseChoices,
  serializeChoices,
  slotKeyFromUtc,
  slotKeyOf,
} from './group-choice';

const NOW = new Date('2026-11-07T10:00:00Z');

const AAA = 'Predmet AAA';
const BBB = 'Predmet BBB';

function fakeApi(entries = splitGroupTimetable()): RequestFn {
  return vi.fn<(RequestFn)>().mockImplementation(async (_method, url) =>
    url.endsWith('/login') ? loginResponse() : timetableChunkResponse(entries),
  );
}

async function setup(): Promise<{ driver: DbDriver; repos: Repositories }> {
  const { driver } = await createTestDatabase();
  await runMigrations(driver);
  const repos = createRepositories(driver);
  await repos.calendars.ensureLocalCalendar();
  return { driver, repos };
}

/** Lessons of one wall-clock slot, e.g. Monday 2026-11-09 08:35–09:20. */
function lessonsInSlot<T extends { id: string; startUtc: string; endUtc: string }>(
  lessons: readonly T[],
  dayIso: string,
  from: string,
  to: string,
): T[] {
  return lessons.filter(
    (lesson) =>
      formatUtcInZone(lesson.startUtc, 'yyyy-MM-dd') === dayIso &&
      formatUtcInZone(lesson.startUtc, 'HH:mm') === from &&
      formatUtcInZone(lesson.endUtc, 'HH:mm') === to,
  );
}

let env: { driver: DbDriver; repos: Repositories };

beforeEach(async () => {
  env = await setup();
});

describe('slot keys', () => {
  it('maps a date to the ISO weekday (1 = Monday)', () => {
    expect(isoWeekdayOf('2026-11-09')).toBe(1);
    expect(isoWeekdayOf('2026-11-12')).toBe(4);
    expect(isoWeekdayOf('2026-11-14')).toBe(6);
    expect(isoWeekdayOf('2026-11-15')).toBe(7);
  });

  it('builds "<weekday>|<from>|<to>" keys', () => {
    expect(slotKeyOf('2026-11-09', '08:35', '09:20')).toBe('1|08:35|09:20');
  });

  it('keeps the same slot key across a DST change (wall-clock based)', () => {
    // 2026-10-19 is CEST (UTC+2), 2026-10-26 is CET (UTC+1) — both Mondays.
    const before = slotKeyFromUtc(
      wallTimeToUtc('2026-10-19T08:35'),
      wallTimeToUtc('2026-10-19T09:20'),
    );
    const after = slotKeyFromUtc(
      wallTimeToUtc('2026-10-26T08:35'),
      wallTimeToUtc('2026-10-26T09:20'),
    );
    expect(before).toBe('1|08:35|09:20');
    expect(after).toBe('1|08:35|09:20');
  });
});

describe('choice persistence', () => {
  it('round-trips through serialize/parse', () => {
    const choices = { '1|08:35|09:20': '222', '2|10:50|11:35': subjectRowId(AAA) };
    expect(parseChoices(serializeChoices(choices))).toEqual(choices);
  });

  it('tolerates missing, malformed and wrong-shaped stored values', () => {
    expect(parseChoices(null)).toEqual({});
    expect(parseChoices('')).toEqual({});
    expect(parseChoices('not json')).toEqual({});
    expect(parseChoices('[]')).toEqual({});
    expect(parseChoices(JSON.stringify({ '1|08:35|09:20': 222 }))).toEqual({});
    expect(parseChoices(JSON.stringify({ 'no-slot': '222' }))).toEqual({});
  });

  it('survives a settings-table round trip', async () => {
    await env.repos.settings.set(
      GROUP_CHOICES_KEY,
      serializeChoices({ '1|08:35|09:20': '222' }),
    );
    const stored = await env.repos.settings.get(GROUP_CHOICES_KEY);
    expect(parseChoices(stored)).toEqual({ '1|08:35|09:20': '222' });
  });
});

describe('filterEntriesByGroupChoices (sync time)', () => {
  it('drops the non-selected group across all weeks, keeping homework of the chosen group only', () => {
    const entries = splitGroupTimetable();
    const kept = filterEntriesByGroupChoices(entries, { '1|08:35|09:20': '222' });
    // Only the two AAA Monday-08:35 entries are dropped.
    expect(kept).toHaveLength(entries.length - 2);
    const subjectTitle = (entry: (typeof entries)[number]): string | null =>
      entry.subject && typeof entry.subject === 'object'
        ? (entry.subject.title ?? null)
        : entry.subject ?? null;
    expect(
      kept.some(
        (entry) =>
          entry.date === '2026-11-09' &&
          entry.from === '08:35' &&
          subjectTitle(entry) === AAA,
      ),
    ).toBe(false);
    expect(
      kept.some(
        (entry) =>
          entry.date === '2026-11-16' &&
          subjectTitle(entry) === AAA &&
          entry.from === '08:35',
      ),
    ).toBe(false);
    expect(
      kept.some(
        (entry) =>
          entry.date === '2026-11-16' &&
          subjectTitle(entry) === BBB &&
          entry.from === '08:35',
      ),
    ).toBe(true);

    const parsed = parseTimetable(kept);
    expect(parsed.homework.map((item) => item.title)).toEqual(['Vaje BBB']);
  });

  it('keeps a substitution of the chosen group, drops it for the other group', () => {
    const entries = splitGroupTimetable();
    const keptBbb = filterEntriesByGroupChoices(entries, { '1|08:35|09:20': '222' });
    const substitution = keptBbb.find((entry) => entry.is_substitution === true);
    expect(substitution).toBeDefined(); // his hour, substituted — still his

    const keptAaa = filterEntriesByGroupChoices(entries, { '1|08:35|09:20': '111' });
    expect(keptAaa.some((entry) => entry.is_substitution === true)).toBe(false);
  });

  it('accepts the subject row id when the payload has no API subject ids', () => {
    const entries = splitGroupTimetable().map((entry) => ({
      ...entry,
      subject:
        entry.subject && typeof entry.subject === 'object'
          ? { title: entry.subject.title, title_short: entry.subject.title_short }
          : entry.subject,
    }));
    const kept = filterEntriesByGroupChoices(entries, {
      '1|08:35|09:20': subjectRowId(BBB),
    });
    expect(kept).toHaveLength(entries.length - 2);
  });

  it('keeps everything for a stale choice (subject no longer in the slot)', () => {
    const entries = splitGroupTimetable();
    const kept = filterEntriesByGroupChoices(entries, { '1|08:35|09:20': '999' });
    expect(kept).toHaveLength(entries.length);
  });

  it('keeps everything without choices and for non-split slots', () => {
    const entries = splitGroupTimetable();
    expect(filterEntriesByGroupChoices(entries, {})).toHaveLength(entries.length);
    expect(
      filterEntriesByGroupChoices(entries, { '1|07:45|08:30': '333' }),
    ).toHaveLength(entries.length);
  });
});

describe('sync with group choices (integration)', () => {
  it('syncs everything without a choice and detects the four split slots', async () => {
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });

    const lessons = await env.repos.lessons.listAll();
    const subjects = await env.repos.subjects.listAll();
    const conflicts = detectSlotConflicts(lessons, subjects);

    expect(conflicts.map((slot) => slot.key)).toEqual([
      '1|08:35|09:20',
      '1|12:30|13:15',
      '2|10:50|11:35',
      '4|09:25|10:10',
    ]);
    const monday = conflicts[0]!;
    expect(monday.options.map((option) => option.subject.shortName).sort()).toEqual(['AAA', 'BBB']);
    const aaa = monday.options.find((option) => option.subject.shortName === 'AAA')!;
    expect(aaa.teacher).toBe('Učitelj Ena');
    expect(aaa.classroom).toBe('11');
  });

  it('persists the school-assigned subject colors', async () => {
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });
    const subjects = await env.repos.subjects.listAll();
    const byShort = new Map(subjects.map((subject) => [subject.shortName, subject]));
    expect(byShort.get('AAA')).toMatchObject({ color: '#c15644', externalId: '111' });
    expect(byShort.get('BBB')).toMatchObject({ color: '#2f7ed8', externalId: '222' });
  });

  it('never stores the non-selected group in the chosen slot (lessons, events, homework)', async () => {
    await env.repos.settings.set(
      GROUP_CHOICES_KEY,
      serializeChoices({ '1|08:35|09:20': '222' }),
    );
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });

    const lessons = await env.repos.lessons.listAll();
    for (const monday of ['2026-11-09', '2026-11-16']) {
      const slot = lessonsInSlot(lessons, monday, '08:35', '09:20');
      const subjects = await env.repos.subjects.listAll();
      const names = slot.map((lesson) =>
        subjects.find((subject) => subject.id === lesson.subjectId)?.shortName,
      );
      expect(names).not.toContain('AAA');
      expect(names.filter((name) => name === 'BBB').length).toBeGreaterThan(0);
    }

    // The other split slots are untouched (both groups still stored).
    expect(lessonsInSlot(lessons, '2026-11-09', '12:30', '13:15')).toHaveLength(2);

    const homework = await env.repos.homework.listAll();
    expect(homework.map((item) => item.title)).toEqual(['Vaje BBB']);

    const events = await env.repos.events.listAll();
    const mondaySlotEvents = events.filter(
      (event) =>
        formatUtcInZone(event.startUtc, 'yyyy-MM-dd') === '2026-11-09' &&
        formatUtcInZone(event.startUtc, 'HH:mm') === '08:35',
    );
    expect(mondaySlotEvents.some((event) => event.title === 'AAA')).toBe(false);
    expect(mondaySlotEvents.some((event) => event.title === 'BBB')).toBe(true);
  });
});

describe('applyGroupChoices (query time)', () => {
  async function syncedEnv() {
    await syncEasistent(env.driver, env.repos, { username: 'u', password: 'p' }, {
      now: NOW,
      request: fakeApi(),
    });
    return {
      lessons: await env.repos.lessons.listAll(),
      events: await env.repos.events.listAll(),
      subjects: await env.repos.subjects.listAll(),
    };
  }

  it('hides rows synced before the choice was made', async () => {
    const { lessons, events, subjects } = await syncedEnv();
    const result = applyGroupChoices({
      lessons,
      events,
      subjects,
      choices: { '1|08:35|09:20': '222' },
    });

    const slot = lessonsInSlot(result.lessons, '2026-11-09', '08:35', '09:20');
    const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
    expect(
      slot.map((lesson) => subjectsById.get(lesson.subjectId)?.shortName),
    ).not.toContain('AAA');

    const slotEvents = result.events.filter(
      (event) =>
        formatUtcInZone(event.startUtc, 'yyyy-MM-dd') === '2026-11-09' &&
        formatUtcInZone(event.startUtc, 'HH:mm') === '08:35',
    );
    expect(slotEvents.some((event) => event.title === 'AAA')).toBe(false);
    expect(slotEvents.some((event) => event.title === 'BBB')).toBe(true);

    // The other split slots are reported as unresolved (need a choice).
    expect(result.unresolved.map((slot) => slot.key)).toEqual([
      '1|12:30|13:15',
      '2|10:50|11:35',
      '4|09:25|10:10',
    ]);
  });

  it('falls back to showing both lessons for a stale choice and flags it', async () => {
    const { lessons, subjects } = await syncedEnv();
    const result = applyGroupChoices({
      lessons,
      subjects,
      choices: { '1|08:35|09:20': '999' },
    });
    expect(result.lessons).toHaveLength(lessons.length);
    expect(result.unresolved.map((slot) => slot.key)).toContain('1|08:35|09:20');
  });

  it('reports every split slot as unresolved when nothing was chosen', async () => {
    const { lessons, subjects } = await syncedEnv();
    const result = applyGroupChoices({ lessons, subjects, choices: {} });
    expect(result.lessons).toHaveLength(lessons.length);
    expect(result.unresolved).toHaveLength(4);
  });

  it('keeps local events untouched', async () => {
    const { lessons, subjects } = await syncedEnv();
    await env.repos.events.createLocal({
      calendarId: 'local',
      title: 'Zobozdravnik',
      description: null,
      location: null,
      startUtc: wallTimeToUtc('2026-11-09T08:35'),
      endUtc: wallTimeToUtc('2026-11-09T09:20'),
      allDay: false,
    });
    const events = await env.repos.events.listAll();
    const result = applyGroupChoices({
      lessons,
      events,
      subjects,
      choices: { '1|08:35|09:20': '222' },
    });
    expect(result.events.some((event) => event.title === 'Zobozdravnik')).toBe(true);
  });
});
