/**
 * Minimal type declarations for sql.js (the package ships none). Only the
 * surface used by the test driver is declared.
 */
declare module 'sql.js' {
  export interface SqlJsStatement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(params?: unknown[]): Record<string, unknown>;
    free(): boolean;
  }

  export interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): SqlJsStatement;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => SqlJsDatabase;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
