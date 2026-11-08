import type { DbDriver } from '../../db/driver';
import type { Repositories } from '../../db/repositories';
import type {
  EventRecord,
  HomeworkRecord,
  LessonRecord,
  SubjectRecord,
} from '../../db/types';
import { allDayRangeUtc, formatUtcInZone } from '../../utils/dates';
import { stableHash } from '../easistent/parse';
import type { DeviceCalendarPermissions } from './plugin';

/** Settings-table key holding the chosen target calendar id. */
export const DEVICE_CALENDAR_TARGET_KEY = 'deviceCalendar.targetId';
/** Settings-table key holding the last successful write timestamp. */
export const DEVICE_CALENDAR_LAST_WRITE_KEY = 'deviceCalendar.lastWriteUtc';
/** Display name of the dedicated local calendar we can create. */
export const DEVICE_CALENDAR_NAME = 'Avtoplaner';

/**
 * Wordings baked into device-calendar event titles. Passed in by the caller
 * (i18n at sync time) so this module stays UI-free and testable. Titles are
 * rewritten on the next sync after a language switch.
 */
export interface CalendarLabels {
  /** e.g. "domača naloga" / "homework". */
  homework: string;
  /** e.g. "odpadla ura" / "cancelled lesson". */
  cancelled: string;
}

/**
 * One CalendarProvider mutation. Deletes/updates are always scoped to the
 * calendar the mapping row was written for, so we can never touch an event
 * we do not own — even if a native id is reused by another calendar.
 */
export interface DeviceCalendarOpCreate {
  op: 'create';
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startMs: number;
  endMs: number;
  allDay: boolean;
}

export interface DeviceCalendarOpUpdate {
  op: 'update';
  calendarId: string;
  nativeId: number;
  title: string;
  description: string | null;
  location: string | null;
  startMs: number;
  endMs: number;
  allDay: boolean;
}

export interface DeviceCalendarOpDelete {
  op: 'delete';
  calendarId: string;
  nativeId: number;
}

export type DeviceCalendarOp =
  | DeviceCalendarOpCreate
  | DeviceCalendarOpUpdate
  | DeviceCalendarOpDelete;

/**
 * The CalendarProvider boundary. Implemented by the native plugin in the
 * app, by an in-memory fake in tests.
 */
export interface NativeCalendarAdapter {
  checkPermissions(): Promise<DeviceCalendarPermissions>;
  applyChanges(ops: DeviceCalendarOp[]): Promise<{ createdIds: number[] }>;
}

export type DeviceCalendarSyncStatus = 'disabled' | 'permission-denied' | 'synced';

export interface DeviceCalendarSyncResult {
  status: DeviceCalendarSyncStatus;
  created: number;
  updated: number;
  deleted: number;
  /** Events currently present in the target calendar. */
  total: number;
}

interface DesiredItem {
  title: string;
  description: string | null;
  location: string | null;
  startMs: number;
  endMs: number;
  allDay: boolean;
  hash: string;
}

interface MappingRow {
  source_key: string;
  calendar_id: string;
  native_event_id: number;
  content_hash: string;
}

function hashItem(item: Omit<DesiredItem, 'hash'>): string {
  return stableHash(
    JSON.stringify([
      item.title,
      item.description,
      item.location,
      item.startMs,
      item.endMs,
      item.allDay,
    ]),
  );
}

/** Lesson-hour lookup: lessons of one subject on a Ljubljana calendar day. */
function findOwningLesson(
  homework: HomeworkRecord,
  lessons: LessonRecord[],
): LessonRecord | null {
  if (!homework.subjectId) {
    return null;
  }
  return (
    lessons.find(
      (lesson) =>
        lesson.subjectId === homework.subjectId &&
        formatUtcInZone(lesson.startUtc, 'yyyy-MM-dd') === homework.dueDate,
    ) ?? null
  );
}

/**
 * Build the desired state of the target calendar from the local database.
 *
 * Only eAsistent-sourced rows are considered. Group-picker filtering already
 * happened at eAsistent-sync time — non-selected groups never entered the
 * database, so they never reach the device calendar either.
 *
 * Content rules:
 * - lessons/substitutions/school events → one event, title = subject short
 *   name, location = room (substitutions keep their change description);
 * - cancelled hours → MARKED, not skipped: title prefixed with ❌ and the
 *   description states the cancellation, mirroring the in-app timetable;
 * - announced tests → "🧪 <subject> — <topic>" at the lesson hour;
 * - homework (not done) → "📝 <subject> — <domača naloga>" at the owning
 *   lesson hour on the due date, homework text in the description. Homework
 *   with no matching lesson falls back to an all-day event on the due date.
 * - done homework is absent here → its event is deleted on the next sync.
 */
export function buildDesiredItems(
  events: EventRecord[],
  homework: HomeworkRecord[],
  lessons: LessonRecord[],
  subjects: ReadonlyMap<string, SubjectRecord>,
  labels: CalendarLabels,
): Map<string, DesiredItem> {
  const desired = new Map<string, DesiredItem>();

  const subjectLabel = (subjectId: string | null, fallback: string): string => {
    if (!subjectId) {
      return fallback;
    }
    const subject = subjects.get(subjectId);
    return subject ? (subject.shortName ?? subject.name) : fallback;
  };

  const put = (key: string, item: Omit<DesiredItem, 'hash'>) => {
    desired.set(key, { ...item, hash: hashItem(item) });
  };

  for (const event of events) {
    if (event.source !== 'easistent' || !event.externalId) {
      continue;
    }
    const label = subjectLabel(event.subjectId, event.title);
    const startMs = Date.parse(event.startUtc);
    const endMs = Date.parse(event.endUtc);

    if (event.externalId.startsWith('ea-test:')) {
      // Parsed test titles are "<short>: <topic>" — rebuild the full
      // "🧪 <subject> — <topic>" form with the authoritative subject label.
      const prefix = `${label}: `;
      const topic = event.title.startsWith(prefix)
        ? event.title.slice(prefix.length)
        : event.title;
      put(event.externalId, {
        title: `🧪 ${label}${topic ? ` — ${topic}` : ''}`,
        description: event.description,
        location: event.location,
        startMs,
        endMs,
        allDay: false,
      });
      continue;
    }

    if (event.externalId.startsWith('ea-cancelled:')) {
      put(event.externalId, {
        title: `❌ ${event.title}`,
        description: [labels.cancelled, event.description]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join('\n'),
        location: event.location,
        startMs,
        endMs,
        allDay: false,
      });
      continue;
    }

    // Regular lesson, substitution or school event.
    put(event.externalId, {
      title: label,
      description: event.description,
      location: event.location,
      startMs,
      endMs,
      allDay: false,
    });
  }

  for (const item of homework) {
    if (item.source !== 'easistent' || item.done) {
      continue;
    }
    const label = subjectLabel(item.subjectId, '');
    const lesson = findOwningLesson(item, lessons);
    const range = lesson
      ? { startMs: Date.parse(lesson.startUtc), endMs: Date.parse(lesson.endUtc) }
      : (() => {
          const day = allDayRangeUtc(item.dueDate);
          return { startMs: Date.parse(day.startUtc), endMs: Date.parse(day.endUtc) };
        })();
    put(item.id, {
      title: `📝 ${label ? `${label} — ` : ''}${labels.homework}`,
      description: item.description,
      location: null,
      startMs: range.startMs,
      endMs: range.endMs,
      allDay: !lesson,
    });
  }

  return desired;
}

export interface DeviceCalendarSyncOptions {
  now?: Date;
  /** Override the stored target (used by the Settings picker preview). */
  targetId?: string;
  labels: CalendarLabels;
}

/**
 * Push the desired state into the device calendar IDEMPOTENTLY:
 * - the `device_calendar_map` table maps our stable eAsistent row ids to
 *   native CalendarProvider event ids per target calendar;
 * - unchanged content (content hash) → no provider call at all;
 * - changed content → update-in-place, never delete+recreate;
 * - source gone (or homework done) → delete the native event;
 * - target calendar switched → old calendar's events deleted, then written
 *   to the new one in the same pass.
 *
 * Native ops run as one batched provider transaction; the mapping table is
 * updated afterwards in one DB transaction. A crash between the two leaves
 * the mapping stale — the next sync re-diffing recovers (worst case a
 * duplicate created event, never a lost one).
 */
export async function syncDeviceCalendar(
  driver: DbDriver,
  repos: Repositories,
  adapter: NativeCalendarAdapter,
  options: DeviceCalendarSyncOptions,
): Promise<DeviceCalendarSyncResult> {
  const now = options.now ?? new Date();
  const targetId = options.targetId ?? (await repos.settings.get(DEVICE_CALENDAR_TARGET_KEY));
  if (!targetId) {
    return { status: 'disabled', created: 0, updated: 0, deleted: 0, total: 0 };
  }

  const permissions = await adapter.checkPermissions();
  if (permissions.readCalendar !== 'granted' || permissions.writeCalendar !== 'granted') {
    return { status: 'permission-denied', created: 0, updated: 0, deleted: 0, total: 0 };
  }

  const [eventRows, homeworkRows, lessonRows, subjectRows] = await Promise.all([
    repos.events.listAll(),
    repos.homework.listAll(),
    repos.lessons.listAll(),
    repos.subjects.listAll(),
  ]);
  const desired = buildDesiredItems(
    eventRows,
    homeworkRows,
    lessonRows,
    new Map(subjectRows.map((subject) => [subject.id, subject])),
    options.labels,
  );

  const mappings = await driver.select<MappingRow>(
    'SELECT source_key, calendar_id, native_event_id, content_hash FROM device_calendar_map',
  );

  const creates: { key: string; op: DeviceCalendarOpCreate }[] = [];
  const updates: { mapping: MappingRow; op: DeviceCalendarOpUpdate }[] = [];
  const deletes: MappingRow[] = [];

  const mappingByKey = new Map(
    mappings
      .filter((row) => row.calendar_id === targetId)
      .map((row) => [row.source_key, row]),
  );

  // Mappings for OTHER calendars: the target changed — remove the leftovers.
  for (const mapping of mappings) {
    if (mapping.calendar_id !== targetId) {
      deletes.push(mapping);
    }
  }

  for (const [key, item] of desired) {
    const mapping = mappingByKey.get(key);
    if (!mapping) {
      creates.push({
        key,
        op: {
          op: 'create',
          calendarId: targetId,
          title: item.title,
          description: item.description,
          location: item.location,
          startMs: item.startMs,
          endMs: item.endMs,
          allDay: item.allDay,
        },
      });
    } else if (mapping.content_hash !== item.hash) {
      updates.push({
        mapping,
        op: {
          op: 'update',
          calendarId: targetId,
          nativeId: mapping.native_event_id,
          title: item.title,
          description: item.description,
          location: item.location,
          startMs: item.startMs,
          endMs: item.endMs,
          allDay: item.allDay,
        },
      });
    }
  }

  // Sources that disappeared (or homework marked done): remove their events.
  for (const [key, mapping] of mappingByKey) {
    if (!desired.has(key)) {
      deletes.push(mapping);
    }
  }

  let createdIds: number[] = [];
  const ops: DeviceCalendarOp[] = [
    ...deletes.map((mapping) => ({
      op: 'delete' as const,
      calendarId: mapping.calendar_id,
      nativeId: mapping.native_event_id,
    })),
    ...updates.map(({ op }) => op),
    ...creates.map(({ op }) => op),
  ];
  if (ops.length > 0) {
    createdIds = (await adapter.applyChanges(ops)).createdIds;
  }

  const updatedUtc = now.toISOString();
  await driver.transaction(async () => {
    for (const mapping of deletes) {
      await driver.run(
        'DELETE FROM device_calendar_map WHERE source_key = ? AND calendar_id = ?',
        [mapping.source_key, mapping.calendar_id],
      );
    }
    for (const { mapping } of updates) {
      await driver.run(
        `UPDATE device_calendar_map SET content_hash = ?, updated_utc = ?
         WHERE source_key = ? AND calendar_id = ?`,
        [
          desired.get(mapping.source_key)!.hash,
          updatedUtc,
          mapping.source_key,
          mapping.calendar_id,
        ],
      );
    }
    for (const [index, { key }] of creates.entries()) {
      await driver.run(
        `INSERT INTO device_calendar_map
           (source_key, calendar_id, native_event_id, content_hash, updated_utc)
         VALUES (?, ?, ?, ?, ?)`,
        [key, targetId, createdIds[index], desired.get(key)!.hash, updatedUtc],
      );
    }
    await repos.settings.set(DEVICE_CALENDAR_LAST_WRITE_KEY, updatedUtc);
  });

  return {
    status: 'synced',
    created: creates.length,
    updated: updates.length,
    deleted: deletes.length,
    total: desired.size,
  };
}

/** Run the device-calendar sync only when a target calendar is configured. */
export async function syncDeviceCalendarIfEnabled(
  driver: DbDriver,
  repos: Repositories,
  adapter: NativeCalendarAdapter,
  labels: CalendarLabels,
  options: { now?: Date } = {},
): Promise<DeviceCalendarSyncResult> {
  const targetId = await repos.settings.get(DEVICE_CALENDAR_TARGET_KEY);
  if (!targetId) {
    return { status: 'disabled', created: 0, updated: 0, deleted: 0, total: 0 };
  }
  return syncDeviceCalendar(driver, repos, adapter, { ...options, labels });
}

/**
 * Remove every event we wrote (any calendar) and forget the mapping + the
 * last-write indicator. The selected target calendar itself is kept — it
 * may be a user calendar (we never delete calendars, CalendarProvider
 * reserves that for sync adapters).
 */
export async function removeAllDeviceCalendarEvents(
  driver: DbDriver,
  repos: Repositories,
  adapter: NativeCalendarAdapter,
): Promise<number> {
  const mappings = await driver.select<MappingRow>(
    'SELECT source_key, calendar_id, native_event_id, content_hash FROM device_calendar_map',
  );
  if (mappings.length > 0) {
    await adapter.applyChanges(
      mappings.map((mapping) => ({
        op: 'delete' as const,
        calendarId: mapping.calendar_id,
        nativeId: mapping.native_event_id,
      })),
    );
  }
  await driver.transaction(async () => {
    await driver.run('DELETE FROM device_calendar_map');
    await repos.settings.remove(DEVICE_CALENDAR_LAST_WRITE_KEY);
  });
  return mappings.length;
}
