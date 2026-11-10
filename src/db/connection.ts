import { Capacitor } from '@capacitor/core';
import { safeDynamicImport } from '../utils/safe-dynamic-import';
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
    // transaction: false — the plugin otherwise wraps EVERY statement in its
    // own BEGIN/COMMIT (execute/run default to transaction=true), which
    // throws "Failed in beginTransactionAlready in transaction" on Android
    // when called inside our explicit driver.transaction(). A single
    // statement is atomic in SQLite regardless.
    if (params && params.length > 0) {
      await this.conn.run(sql, params, false);
    } else {
      await this.conn.execute(sql, false);
    }
  }

  async executeScript(sql: string): Promise<void> {
    // Keep the plugin's transaction wrapper here: migrations are
    // standalone multi-statement scripts, not nested in driver.transaction().
    await this.conn.execute(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // The plugin wraps every execute/run call in its own transaction on web
    // (verified: begin/commit bookkeeping fails with "no transaction is
    // active" because each statement auto-commits). Never let that
    // bookkeeping failure mask the real error from `fn`.
    let began = true;
    try {
      await this.conn.beginTransaction();
    } catch {
      began = false;
    }
    try {
      const result = await fn();
      if (began) {
        await this.conn.commitTransaction();
      }
      return result;
    } catch (error) {
      if (began) {
        try {
          await this.conn.rollbackTransaction();
        } catch {
          // The plugin already auto-committed or had no active transaction.
        }
      }
      throw error;
    }
  }
}

async function initializeWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElements } = await safeDynamicImport(() => import('jeep-sqlite/loader'));
  defineCustomElements(window);
  if (document.querySelector('jeep-sqlite') === null) {
    const element = document.createElement(
      'jeep-sqlite',
    ) as HTMLElement & { autoSave?: boolean };
    // Persist the in-memory sql.js database to IndexedDB after every write.
    // The Stencil prop must be set directly — the `auto-save` attribute
    // alone did not enable autoSave (verified: attribute set but
    // `element.autoSave` stayed false and nothing was persisted).
    element.autoSave = true;
    element.setAttribute('auto-save', 'true');
    document.body.appendChild(element);
  }
  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}

/** One shared SQLiteConnection for the whole app: the plugin tracks
 * connections per-instance, so a fresh instance per initialize() call breaks
 * isConnection/retrieveConnection ("Connection autoplaner already exists" /
 * "does not exist" errors, database sections rendering dead). */
let sharedSqlite: SQLiteConnection | null = null;

async function initialize(): Promise<DbDriver> {
  const sqlite = (sharedSqlite ??= new SQLiteConnection(CapacitorSQLite));
  if (Capacitor.getPlatform() === 'web') {
    await initializeWebStore(sqlite);
  }
  const existing = await sqlite.isConnection(DB_NAME, false);
  let conn: SQLiteDBConnection;
  if (existing.result) {
    conn = await sqlite.retrieveConnection(DB_NAME, false);
  } else {
    try {
      conn = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    } catch (error) {
      if (String(error).includes('already exists')) {
        // A WebView reload (PWA service-worker update) wipes this JS
        // instance's connection registry while the NATIVE plugin still holds
        // the connection from the previous page: createConnection then
        // rejects with "already exists" and retrieveConnection fails with
        // "does not exist" (registry is empty). Close the native connection
        // and create a fresh one.
        await CapacitorSQLite.closeConnection({ database: DB_NAME, readonly: false });
        conn = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      } else {
        throw error;
      }
    }
  }
  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;');
  return new SqliteDriver(conn);
}

let driverPromise: Promise<DbDriver> | null = null;
/** Serializes initialize() runs so only one create/retrieve race exists. */
let initChain: Promise<unknown> = Promise.resolve();

/** Open (and memoize) the application database connection. */
export function openDatabase(): Promise<DbDriver> {
  if (!driverPromise) {
    const run = initChain.then(() => initialize());
    initChain = run.catch(() => undefined);
    driverPromise = run.catch((error: unknown) => {
      driverPromise = null;
      throw error;
    });
  }
  return driverPromise;
}
