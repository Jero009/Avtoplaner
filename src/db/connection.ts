import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type { DbDriver, SqlValue } from './driver';

export const DB_NAME = 'autoplaner';

/**
 * Driver over a single @capacitor-community/sqlite connection.
 * On Android it uses native SQLite; on web the plugin backs the
 * database with sql.js WASM persisted to IndexedDB (jeep-sqlite).
 */
class SqliteDriver implements DbDriver {
  constructor(private readonly conn: SQLiteDBConnection) {}

  async select<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
    const result = await this.conn.query(sql, params ?? []);
    return (result.values ?? []) as T[];
  }

  async run(sql: string, params?: SqlValue[]): Promise<void> {
    if (params && params.length > 0) {
      await this.conn.run(sql, params);
    } else {
      await this.conn.execute(sql);
    }
  }

  async executeScript(sql: string): Promise<void> {
    await this.conn.execute(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.conn.beginTransaction();
    try {
      const result = await fn();
      await this.conn.commitTransaction();
      return result;
    } catch (error) {
      await this.conn.rollbackTransaction();
      throw error;
    }
  }
}

async function initializeWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  defineCustomElements(window);
  if (document.querySelector('jeep-sqlite') === null) {
    const element = document.createElement('jeep-sqlite');
    // Persist the in-memory sql.js database to IndexedDB after every write.
    element.setAttribute('auto-save', 'true');
    document.body.appendChild(element);
  }
  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}

async function initialize(): Promise<DbDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  if (Capacitor.getPlatform() === 'web') {
    await initializeWebStore(sqlite);
  }
  const existing = await sqlite.isConnection(DB_NAME, false);
  const conn = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;');
  return new SqliteDriver(conn);
}

let driverPromise: Promise<DbDriver> | null = null;

/** Open (and memoize) the application database connection. */
export function openDatabase(): Promise<DbDriver> {
  if (!driverPromise) {
    driverPromise = initialize().catch((error: unknown) => {
      driverPromise = null;
      throw error;
    });
  }
  return driverPromise;
}
