/**
 * Values that can be bound to a parameterized SQLite statement.
 */
export type SqlValue = string | number | null;

/**
 * Minimal database interface used by the migration runner and repositories.
 * Implemented by the @capacitor-community/sqlite connection wrapper.
 */
export interface DbDriver {
  /** Run a SELECT statement and return all rows. */
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run a single statement (or a parameterless statement) that changes rows. */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Execute a raw SQL script that may contain multiple statements. */
  executeScript(sql: string): Promise<void>;
  /** Run `fn` inside one transaction; rolls back on error. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
