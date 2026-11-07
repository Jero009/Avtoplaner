import type { DbDriver } from '../driver';
import type { SubjectRecord } from '../types';

interface SubjectRow {
  id: string;
  external_id: string | null;
  name: string;
  short_name: string | null;
  color: string | null;
}

function mapRow(row: SubjectRow): SubjectRecord {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    shortName: row.short_name,
    color: row.color,
  };
}

export function createSubjectRepository(db: DbDriver) {
  return {
    async listAll(): Promise<SubjectRecord[]> {
      const rows = await db.select<SubjectRow>('SELECT * FROM subjects ORDER BY name');
      return rows.map(mapRow);
    },
  };
}

export type SubjectRepository = ReturnType<typeof createSubjectRepository>;
