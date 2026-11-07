import type { DbDriver } from '../driver';

export function createSettingsRepository(db: DbDriver) {
  return {
    async get(key: string): Promise<string | null> {
      const rows = await db.select<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key],
      );
      return rows.length > 0 ? rows[0]!.value : null;
    },

    async set(key: string, value: string): Promise<void> {
      await db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    },

    async remove(key: string): Promise<void> {
      await db.run('DELETE FROM settings WHERE key = ?', [key]);
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
