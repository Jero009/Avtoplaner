import type { DbDriver } from '../driver';
import type { GradeRecord, SchoolSource } from '../types';

interface GradeRow {
  id: string;
  subject_id: string;
  value: string;
  weight: number;
  date: string;
  note: string | null;
  source: SchoolSource;
}

function mapRow(row: GradeRow): GradeRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    value: row.value,
    weight: row.weight,
    date: row.date,
    note: row.note,
    source: row.source,
  };
}

export function createGradeRepository(db: DbDriver) {
  return {
    async listAll(): Promise<GradeRecord[]> {
      const rows = await db.select<GradeRow>(
        'SELECT * FROM grades ORDER BY date',
      );
      return rows.map(mapRow);
    },
  };
}

export type GradeRepository = ReturnType<typeof createGradeRepository>;
