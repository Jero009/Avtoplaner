import type { DbDriver } from '../driver';
import type { LessonRecord, LessonStatus } from '../types';

interface LessonRow {
  id: string;
  subject_id: string;
  teacher: string | null;
  classroom: string | null;
  start_utc: string;
  end_utc: string;
  status: LessonStatus;
  note: string | null;
}

function mapRow(row: LessonRow): LessonRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    teacher: row.teacher,
    classroom: row.classroom,
    startUtc: row.start_utc,
    endUtc: row.end_utc,
    status: row.status,
    note: row.note,
  };
}

export function createLessonRepository(db: DbDriver) {
  return {
    /** Lessons that overlap the half-open UTC interval [fromUtc, toUtc). */
    async listBetween(fromUtc: string, toUtc: string): Promise<LessonRecord[]> {
      const rows = await db.select<LessonRow>(
        `SELECT * FROM lessons
         WHERE start_utc < ? AND end_utc > ?
         ORDER BY start_utc`,
        [toUtc, fromUtc],
      );
      return rows.map(mapRow);
    },

    async listAll(): Promise<LessonRecord[]> {
      const rows = await db.select<LessonRow>('SELECT * FROM lessons');
      return rows.map(mapRow);
    },
  };
}

export type LessonRepository = ReturnType<typeof createLessonRepository>;
