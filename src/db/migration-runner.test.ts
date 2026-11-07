import { describe, expect, it, vi } from 'vitest';
import { latestSchemaVersion, runMigrations } from './migration-runner';
import type { DbDriver } from '../db/driver';

function makeDriver(selectResult: { value: string }[] = []) {
  const scripts: string[] = [];
  const driver: DbDriver = {
    select: vi.fn().mockResolvedValue(selectResult),
    run: vi.fn().mockResolvedValue(undefined),
    executeScript: vi.fn().mockImplementation((sql: string) => {
      scripts.push(sql);
      return Promise.resolve();
    }),
    transaction: <T>(fn: () => Promise<T>) => fn(),
  };
  return { driver, scripts };
}

describe('runMigrations', () => {
  it('applies each pending migration as one atomic script with the version stamp appended', async () => {
    const { driver, scripts } = makeDriver();

    await runMigrations({
      ...driver,
      select: vi
        .fn()
        .mockImplementation((sql: string) =>
          Promise.reject(new Error(`no meta table: ${sql}`)),
        ),
    });

    // The runner applies the real bundled migrations (currently one file).
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts[0]).toContain('CREATE TABLE meta');
    expect(scripts[0]).toContain("'schema_version', '1'");
    // The version stamp travels with the script, never as a separate write.
    expect(driver.run).not.toHaveBeenCalled();
  });

  it('does nothing when the schema is already current', async () => {
    const { driver, scripts } = makeDriver([
      { value: String(latestSchemaVersion()) },
    ]);

    await runMigrations(driver);

    expect(scripts).toHaveLength(0);
    expect(driver.run).not.toHaveBeenCalled();
  });

  it('propagates the original migration failure instead of a rollback error', async () => {
    const driver: DbDriver = {
      select: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue(undefined),
      executeScript: vi
        .fn()
        .mockRejectedValue(new Error('no such table: nosuchtable')),
      transaction: <T>(fn: () => Promise<T>) => fn(),
    };

    await expect(runMigrations(driver)).rejects.toThrow('nosuchtable');
  });
});
