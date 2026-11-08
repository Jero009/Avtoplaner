import type { DbDriver, SqlValue } from './driver';
import { REDACTED_SETTING_KEYS } from '../integrations/easistent/sync';

/**
 * Tables included in a backup, with their column order. Insert/delete order
 * matters because of foreign keys: parents first on insert, children first
 * on delete.
 */
export const BACKUP_TABLES: Record<string, readonly string[]> = {
  calendars: ['id', 'source', 'external_id', 'name', 'color', 'visible'],
  subjects: ['id', 'external_id', 'name', 'short_name', 'color'],
  events: [
    'id',
    'calendar_id',
    'source',
    'external_id',
    'title',
    'description',
    'location',
    'start_utc',
    'end_utc',
    'all_day',
    'recurring',
    'updated_at',
    'subject_id',
  ],
  lessons: ['id', 'subject_id', 'teacher', 'classroom', 'start_utc', 'end_utc', 'status', 'note'],
  grades: ['id', 'subject_id', 'value', 'weight', 'date', 'note', 'source'],
  homework: ['id', 'subject_id', 'title', 'description', 'due_date', 'done', 'source'],
  holidays: ['id', 'name', 'start_date', 'end_date'],
  sync_state: ['source', 'last_success_utc', 'last_error', 'status'],
  settings: ['key', 'value'],
  meta: ['key', 'value'],
};

/** Read every backed-up table. Used by backup export.
 *
 * Settings rows holding secrets are redacted: the eAsistent password must
 * never leave the device in a backup file (the username stays, so the user
 * only has to re-enter the password after an import).
 */
export async function exportAllTables(
  driver: DbDriver,
): Promise<Record<string, Record<string, SqlValue>[]>> {
  const data: Record<string, Record<string, SqlValue>[]> = {};
  for (const table of Object.keys(BACKUP_TABLES)) {
    const rows = await driver.select<Record<string, SqlValue>>(
      `SELECT * FROM ${table}`,
    );
    data[table] =
      table === 'settings'
        ? rows.filter((row) => !REDACTED_SETTING_KEYS.includes(String(row.key)))
        : rows;
  }
  return data;
}

function toSqlValue(value: unknown): SqlValue {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return String(value);
}

/**
 * Replace the whole database content with the given tables in one
 * transaction. Rows are plain objects keyed by column name; unknown
 * columns are ignored. The caller must have validated the data first
 * (see `utils/backup.ts`).
 */
export async function replaceAllTables(
  driver: DbDriver,
  data: Record<string, Record<string, unknown>[]>,
  schemaVersion: number,
): Promise<void> {
  const childrenFirst = ['events', 'lessons', 'grades', 'homework', 'holidays'];
  const parentsFirst = ['calendars', 'subjects'];
  const standalone = ['sync_state', 'settings', 'meta'];
  const deleteOrder = [...childrenFirst, ...parentsFirst, ...standalone];
  const insertOrder = [...parentsFirst, ...childrenFirst, ...standalone];

  // Note: on the web plugin every statement auto-commits, so this restore is
  // not atomic across calls there (native is transactional). A failed import
  // may leave partial data on web; the caller should verify and re-import.
  await driver.transaction(async () => {
    for (const table of deleteOrder) {
      await driver.run(`DELETE FROM ${table}`);
    }
    for (const table of insertOrder) {
      const columns = BACKUP_TABLES[table]!;
      const rows = data[table] ?? [];
      if (rows.length === 0) {
        continue;
      }
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      for (const row of rows) {
        await driver.run(sql, columns.map((column) => toSqlValue(row[column])));
      }
    }
    // The schema version is always owned by the migration runner.
    await driver.run(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
      [String(schemaVersion)],
    );
  });
}
