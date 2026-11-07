import type { DbDriver } from '../driver';
import type { CalendarRecord, EventSource } from '../types';

interface CalendarRow {
  id: string;
  source: EventSource;
  external_id: string | null;
  name: string;
  color: string;
  visible: number;
}

function mapRow(row: CalendarRow): CalendarRecord {
  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    name: row.name,
    color: row.color,
    visible: row.visible === 1,
  };
}

export const LOCAL_CALENDAR_ID = 'local';
const LOCAL_CALENDAR_COLOR = '#2563eb';

export function createCalendarRepository(db: DbDriver) {
  return {
    async list(): Promise<CalendarRecord[]> {
      const rows = await db.select<CalendarRow>(
        'SELECT * FROM calendars ORDER BY source, name',
      );
      return rows.map(mapRow);
    },

    async get(id: string): Promise<CalendarRecord | null> {
      const rows = await db.select<CalendarRow>(
        'SELECT * FROM calendars WHERE id = ?',
        [id],
      );
      return rows.length > 0 ? mapRow(rows[0]!) : null;
    },

    async setVisible(id: string, visible: boolean): Promise<void> {
      await db.run('UPDATE calendars SET visible = ? WHERE id = ?', [
        visible ? 1 : 0,
        id,
      ]);
    },

    /**
     * Make sure the built-in local calendar exists. Safe to call on every
     * startup; uses INSERT OR IGNORE so it never overwrites user changes.
     */
    async ensureLocalCalendar(): Promise<void> {
      await db.run(
        `INSERT OR IGNORE INTO calendars (id, source, external_id, name, color, visible)
         VALUES (?, 'local', 'local', 'Local', ?, 1)`,
        [LOCAL_CALENDAR_ID, LOCAL_CALENDAR_COLOR],
      );
    },
  };
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
