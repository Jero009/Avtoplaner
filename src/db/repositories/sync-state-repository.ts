import type { DbDriver } from '../driver';
import type { SyncSource, SyncStateRecord, SyncStatus } from '../types';

interface SyncStateRow {
  source: SyncSource;
  last_success_utc: string | null;
  last_error: string | null;
  status: SyncStatus;
}

function mapRow(row: SyncStateRow): SyncStateRecord {
  return {
    source: row.source,
    lastSuccessUtc: row.last_success_utc,
    lastError: row.last_error,
    status: row.status,
  };
}

const UPSERT_SQL = `INSERT INTO sync_state (source, last_success_utc, last_error, status)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (source) DO UPDATE SET
    last_success_utc = excluded.last_success_utc,
    last_error = excluded.last_error,
    status = excluded.status`;

export function createSyncStateRepository(db: DbDriver) {
  return {
    async list(): Promise<SyncStateRecord[]> {
      const rows = await db.select<SyncStateRow>(
        'SELECT * FROM sync_state ORDER BY source',
      );
      return rows.map(mapRow);
    },

    async get(source: SyncSource): Promise<SyncStateRecord | null> {
      const rows = await db.select<SyncStateRow>(
        'SELECT * FROM sync_state WHERE source = ?',
        [source],
      );
      return rows.length > 0 ? mapRow(rows[0]!) : null;
    },

    async recordSuccess(source: SyncSource, successUtc: string): Promise<void> {
      await db.run(UPSERT_SQL, [source, successUtc, null, 'success']);
    },

    async recordError(source: SyncSource, message: string): Promise<void> {
      await db.run(UPSERT_SQL, [source, null, message, 'error']);
    },

    async setStatus(source: SyncSource, status: SyncStatus): Promise<void> {
      await db.run('UPDATE sync_state SET status = ? WHERE source = ?', [
        status,
        source,
      ]);
    },
  };
}

export type SyncStateRepository = ReturnType<typeof createSyncStateRepository>;
