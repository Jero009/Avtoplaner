import type { DbDriver } from '../../db/driver';
import type { Repositories } from '../../db/repositories';
import { addDaysToDayIso, todayDayIso } from '../../utils/dates';
import {
  createEasistentClient,
  type EasistentCredentials,
} from './client';
import { EasistentError, type RequestFn, defaultRequest } from './http';
import { parseTimetable } from './parse';
import {
  GROUP_CHOICES_KEY,
  filterEntriesByGroupChoices,
  parseChoices,
} from './group-choice';

/** Settings-table keys holding the stored credentials. */
export const EASISTENT_USERNAME_KEY = 'easistent.username';
export const EASISTENT_PASSWORD_KEY = 'easistent.password';

/** Never included in backups (see backup-service redaction). */
export const REDACTED_SETTING_KEYS: readonly string[] = [EASISTENT_PASSWORD_KEY];

/** Default sync window: two weeks back (recent changes) + six weeks ahead. */
export const SYNC_PAST_DAYS = 14;
export const SYNC_FUTURE_DAYS = 42;

export interface SyncOptions {
  fromDay?: string;
  toDay?: string;
  now?: Date;
  request?: RequestFn;
}

export interface SyncResult {
  syncedAtUtc: string;
  lessons: number;
  homework: number;
  tests: number;
  events: number;
}

export class MissingCredentialsError extends Error {
  constructor() {
    super('eAsistent username or password is not configured');
    this.name = 'MissingCredentialsError';
  }
}

/** Load the stored credentials from the settings table. */
export async function loadCredentials(
  repos: Repositories,
): Promise<EasistentCredentials | null> {
  const [username, password] = await Promise.all([
    repos.settings.get(EASISTENT_USERNAME_KEY),
    repos.settings.get(EASISTENT_PASSWORD_KEY),
  ]);
  if (!username || !password) {
    return null;
  }
  return { username, password };
}

/**
 * Sync eAsistent data into the local database. Always re-logs in (the token
 * expires after ~24 h), replaces every previously synced eAsistent row in
 * one transaction and records the outcome in `sync_state`.
 *
 * Idempotency: row ids are derived from stable API ids/content hashes, so
 * syncing twice in a row produces exactly the same rows — no duplicates.
 * Locally checked-off homework stays done across syncs.
 */
export async function syncEasistent(
  driver: DbDriver,
  repos: Repositories,
  credentials: EasistentCredentials,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const fromDay = options.fromDay ?? addDaysToDayIso(todayDayIso(now), -SYNC_PAST_DAYS);
  const toDay = options.toDay ?? addDaysToDayIso(todayDayIso(now), SYNC_FUTURE_DAYS);
  const client = createEasistentClient(credentials, options.request ?? defaultRequest);

  try {
    const entries = await client.fetchTimetable(fromDay, toDay);
    // Drop the non-selected group's entries before parsing so their
    // lessons, calendar events AND homework never reach the database.
    // See group-choice.ts for the choice contract.
    const choices = parseChoices(await repos.settings.get(GROUP_CHOICES_KEY));
    const kept = filterEntriesByGroupChoices(entries, choices);
    const parsed = parseTimetable(kept);

    const result = await driver.transaction<SyncResult>(() =>
      replaceEasistentRows(driver, repos, parsed, now),
    );
    await repos.syncState.recordSuccess('easistent', now.toISOString());
    return result;
  } catch (error) {
    const message =
      error instanceof EasistentError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    // The message never contains credentials: request bodies are not part
    // of any error we propagate.
    await repos.syncState.recordError('easistent', message);
    throw error;
  }
}

async function replaceEasistentRows(
  driver: DbDriver,
  repos: Repositories,
  parsed: ReturnType<typeof parseTimetable>,
  now: Date,
): Promise<SyncResult> {
  await repos.calendars.ensureEasistentCalendar();

  // Preserve locally checked-off homework across the replace.
  const existingHomework = await driver.select<{ id: string; done: number }>(
    "SELECT id, done FROM homework WHERE source = 'easistent'",
  );
  const doneBefore = new Set(
    existingHomework.filter((row) => row.done === 1).map((row) => row.id),
  );

  // Remove every eAsistent-owned row (all carry the ea- id prefix / source).
  await driver.run("DELETE FROM events WHERE source = 'easistent'");
  await driver.run("DELETE FROM lessons WHERE id LIKE 'ea-%'");
  await driver.run("DELETE FROM homework WHERE source = 'easistent'");
  await driver.run("DELETE FROM subjects WHERE id LIKE 'ea-subj:%'");

  for (const subject of parsed.subjects) {
    await driver.run(
      'INSERT INTO subjects (id, external_id, name, short_name, color) VALUES (?, ?, ?, ?, ?)',
      [subject.id, subject.externalId, subject.name, subject.shortName, subject.color],
    );
  }

  for (const lesson of parsed.lessons) {
    await driver.run(
      `INSERT INTO lessons (id, subject_id, teacher, classroom, start_utc, end_utc, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lesson.id,
        lesson.subjectId,
        lesson.teacher,
        lesson.classroom,
        lesson.startUtc,
        lesson.endUtc,
        lesson.status,
        lesson.note,
      ],
    );
  }

  for (const item of parsed.homework) {
    await driver.run(
      `INSERT INTO homework (id, subject_id, title, description, due_date, done, source)
       VALUES (?, ?, ?, ?, ?, ?, 'easistent')`,
      [
        item.id,
        item.subjectId,
        item.title,
        item.description,
        item.dueDate,
        item.done || doneBefore.has(item.id) ? 1 : 0,
      ],
    );
  }

  const updatedAt = now.toISOString();
  for (const event of parsed.events) {
    await driver.run(
      `INSERT INTO events (id, calendar_id, source, external_id, title, description,
        location, start_utc, end_utc, all_day, recurring, updated_at)
       VALUES (?, 'easistent', 'easistent', ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [
        event.externalId,
        event.externalId,
        event.title,
        event.description,
        event.location,
        event.startUtc,
        event.endUtc,
        updatedAt,
      ],
    );
  }

  return {
    syncedAtUtc: updatedAt,
    lessons: parsed.lessons.length,
    homework: parsed.homework.length,
    tests: parsed.events.filter((event) => event.kind === 'test').length,
    events: parsed.events.length,
  };
}

/**
 * Convenience wrapper: read the credentials from the settings table and
 * sync. Throws MissingCredentialsError when they are not configured.
 */
export async function syncWithStoredCredentials(
  driver: DbDriver,
  repos: Repositories,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const credentials = await loadCredentials(repos);
  if (!credentials) {
    throw new MissingCredentialsError();
  }
  return syncEasistent(driver, repos, credentials, options);
}
