import { createRequire } from 'node:module';
import path from 'node:path';
import initSqlJs, { type SqlJsDatabase, type SqlJsStatic } from 'sql.js';
import type { DbDriver, SqlValue } from './driver';

/**
 * In-memory SQLite driver over sql.js for tests — same interface as the
 * @capacitor-community/sqlite driver, so repositories and the sync runner
 * can be exercised against a real database in Vitest.
 */

class SqlJsDriver implements DbDriver {
  constructor(private readonly db: SqlJsDatabase) {}

  async select<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params ?? []);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async run(sql: string, params?: SqlValue[]): Promise<void> {
    this.db.run(sql, params ?? []);
  }

  async executeScript(sql: string): Promise<void> {
    this.db.run(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.run('BEGIN');
    try {
      const result = await fn();
      this.db.run('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.run('ROLLBACK');
      } catch {
        // Nothing to roll back.
      }
      throw error;
    }
  }
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

/** Open a fresh in-memory database (real SQLite semantics via sql.js). */
export async function createTestDatabase(): Promise<{
  driver: DbDriver;
  database: SqlJsDatabase;
}> {
  if (!sqlJsPromise) {
    const require = createRequire(import.meta.url);
    const sqlJsMain = require.resolve('sql.js');
    const distDir = path.dirname(sqlJsMain);
    sqlJsPromise = initSqlJs({ locateFile: (file) => path.join(distDir, file) });
  }
  const SQL = await sqlJsPromise;
  const database = new SQL.Database();
  return { driver: new SqlJsDriver(database), database };
}
