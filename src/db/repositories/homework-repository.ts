import type { DbDriver } from '../driver';
import type { HomeworkRecord, SchoolSource } from '../types';

interface HomeworkRow {
  id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  done: number;
  source: SchoolSource;
}

function mapRow(row: HomeworkRow): HomeworkRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    done: row.done === 1,
    source: row.source,
  };
}

export function createHomeworkRepository(db: DbDriver) {
  return {
    async listAll(): Promise<HomeworkRecord[]> {
      const rows = await db.select<HomeworkRow>('SELECT * FROM homework');
      return rows.map(mapRow);
    },

    /** Homework not yet done with a due date in [fromDate, toDate]. */
    async listDueBetween(fromDate: string, toDate: string): Promise<HomeworkRecord[]> {
      const rows = await db.select<HomeworkRow>(
        `SELECT * FROM homework
         WHERE done = 0 AND due_date >= ? AND due_date <= ?
         ORDER BY due_date`,
        [fromDate, toDate],
      );
      return rows.map(mapRow);
    },

    async setDone(id: string, done: boolean): Promise<void> {
      await db.run('UPDATE homework SET done = ? WHERE id = ?', [done ? 1 : 0, id]);
    },
  };
}

export type HomeworkRepository = ReturnType<typeof createHomeworkRepository>;
