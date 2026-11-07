import type { DbDriver } from './driver';

export interface Migration {
  version: number;
  sql: string;
}

const migrationFiles = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Extract the numeric version from a migration file path like `001_initial.sql`. */
export function migrationVersionFromPath(path: string): number {
  const match = /(\d+)[^/]*\.sql$/.exec(path);
  if (!match) {
    throw new Error(`Migration file name must start with a number: ${path}`);
  }
  return Number(match[1]);
}

/** Collect and order the bundled migrations by version. */
export function collectMigrations(files: Record<string, string>): Migration[] {
  const migrations = Object.entries(files).map(([path, sql]) => ({
    version: migrationVersionFromPath(path),
    sql,
  }));
  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

/** The highest migration version bundled with the app. */
export function latestSchemaVersion(): number {
  const migrations = collectMigrations(migrationFiles);
  return migrations.length > 0 ? migrations[migrations.length - 1]!.version : 0;
}

async function readSchemaVersion(driver: DbDriver): Promise<number> {
  try {
    const rows = await driver.select<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    return rows.length > 0 ? Number(rows[0]!.value) : 0;
  } catch {
    // The meta table does not exist yet on a fresh database.
    return 0;
  }
}

/**
 * Apply every migration newer than the stored `meta.schema_version`.
 * Each migration runs in its own transaction and records its version.
 */
export async function runMigrations(driver: DbDriver): Promise<number> {
  const migrations = collectMigrations(migrationFiles);
  const current = await readSchemaVersion(driver);
  for (const migration of migrations) {
    if (migration.version <= current) {
      continue;
    }
    await driver.transaction(async () => {
      await driver.executeScript(migration.sql);
      await driver.run(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        [String(migration.version)],
      );
    });
  }
  return latestSchemaVersion();
}
