import type { DbDriver, SqlValue } from '../driver';
import type { EventRecord, EventSource } from '../types';

/** Data needed to create or update a local event. */
export interface EventDraft {
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
}

interface EventRow {
  id: string;
  calendar_id: string;
  source: EventSource;
  external_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_utc: string;
  end_utc: string;
  all_day: number;
  recurring: number;
  updated_at: string;
  subject_id: string | null;
}

function mapRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    source: row.source,
    externalId: row.external_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startUtc: row.start_utc,
    endUtc: row.end_utc,
    allDay: row.all_day === 1,
    recurring: row.recurring === 1,
    updatedAt: row.updated_at,
    subjectId: row.subject_id ?? null,
  };
}

function assertDraft(draft: EventDraft): void {
  if (draft.title.trim().length === 0) {
    throw new Error('Event title must not be empty');
  }
  if (Date.parse(draft.endUtc) <= Date.parse(draft.startUtc)) {
    throw new Error('Event end must be after start');
  }
}

function insertParams(
  id: string,
  source: EventSource,
  externalId: string | null,
  draft: EventDraft,
  updatedAt: string,
): SqlValue[] {
  return [
    id,
    draft.calendarId,
    source,
    externalId,
    draft.title.trim(),
    draft.description,
    draft.location,
    draft.startUtc,
    draft.endUtc,
    draft.allDay ? 1 : 0,
    updatedAt,
    null,
  ];
}

const INSERT_SQL = `INSERT INTO events
  (id, calendar_id, source, external_id, title, description, location,
   start_utc, end_utc, all_day, updated_at, subject_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function createEventRepository(db: DbDriver) {
  return {
    /** Events that overlap the half-open UTC interval [fromUtc, toUtc). */
    async listBetween(fromUtc: string, toUtc: string): Promise<EventRecord[]> {
      const rows = await db.select<EventRow>(
        `SELECT * FROM events
         WHERE start_utc < ? AND end_utc > ?
         ORDER BY start_utc`,
        [toUtc, fromUtc],
      );
      return rows.map(mapRow);
    },

    async listAll(): Promise<EventRecord[]> {
      const rows = await db.select<EventRow>('SELECT * FROM events');
      return rows.map(mapRow);
    },

    async get(id: string): Promise<EventRecord | null> {
      const rows = await db.select<EventRow>('SELECT * FROM events WHERE id = ?', [id]);
      return rows.length > 0 ? mapRow(rows[0]!) : null;
    },

    async createLocal(draft: EventDraft): Promise<EventRecord> {
      assertDraft(draft);
      const id = crypto.randomUUID();
      const updatedAt = new Date().toISOString();
      await db.run(INSERT_SQL, insertParams(id, 'local', id, draft, updatedAt));
      return {
        id,
        source: 'local',
        externalId: id,
        recurring: false,
        subjectId: null,
        ...draft,
        title: draft.title.trim(),
        updatedAt,
      };
    },

    async updateLocal(id: string, draft: EventDraft): Promise<void> {
      assertDraft(draft);
      await db.run(
        `UPDATE events SET
           calendar_id = ?, title = ?, description = ?, location = ?,
           start_utc = ?, end_utc = ?, all_day = ?, updated_at = ?
         WHERE id = ? AND source = 'local'`,
        [
          draft.calendarId,
          draft.title.trim(),
          draft.description,
          draft.location,
          draft.startUtc,
          draft.endUtc,
          draft.allDay ? 1 : 0,
          new Date().toISOString(),
          id,
        ],
      );
    },

    async deleteLocal(id: string): Promise<void> {
      await db.run("DELETE FROM events WHERE id = ? AND source = 'local'", [id]);
    },

    /** Remove every cached event of a source; used by the sync runner. */
    async deleteAllBySource(source: EventSource): Promise<void> {
      await db.run('DELETE FROM events WHERE source = ?', [source]);
    },
  };
}

export type EventRepository = ReturnType<typeof createEventRepository>;
