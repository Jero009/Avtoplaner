import { describe, expect, it } from 'vitest';
import { validateBackup } from './backup';

const SCHEMA_VERSION = 1;

function validBackup() {
  return {
    appVersion: '0.1.0',
    schemaVersion: 1,
    exportedAt: '2026-11-06T18:00:00.000Z',
    data: {
      calendars: [{ id: 'local', source: 'local', name: 'Local', visible: 1 }],
      events: [] as Record<string, unknown>[],
    },
  };
}

describe('validateBackup', () => {
  it('accepts a well-formed backup', () => {
    const result = validateBackup(validBackup(), SCHEMA_VERSION);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.appVersion).toBe('0.1.0');
      expect(result.backup.data.calendars).toHaveLength(1);
    }
  });

  it('rejects values that are not objects', () => {
    for (const value of [null, 'text', 42, [], true]) {
      const result = validateBackup(value, SCHEMA_VERSION);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.code).toBe('notAnObject');
      }
    }
  });

  it('collects every missing field in one pass', () => {
    const result = validateBackup({}, SCHEMA_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toEqual([
        'missingAppVersion',
        'invalidSchemaVersion',
        'missingExportedAt',
        'missingData',
      ]);
    }
  });

  it('rejects a schema version from another schema generation', () => {
    const backup = {
      ...validBackup(),
      schemaVersion: 2,
    };
    const result = validateBackup(backup, SCHEMA_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([{ code: 'schemaVersionMismatch' }]);
    }
  });

  it('rejects a non-numeric schema version', () => {
    const backup = { ...validBackup(), schemaVersion: '1' };
    const result = validateBackup(backup, SCHEMA_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.code).toBe('invalidSchemaVersion');
    }
  });

  it('rejects an unparsable export timestamp', () => {
    const backup = {
      ...validBackup(),
      exportedAt: 'not a date',
    };
    const result = validateBackup(backup, SCHEMA_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.code).toBe('invalidExportedAt');
    }
  });

  it('rejects a table whose value is not an array of objects', () => {
    const backup = {
      ...validBackup(),
      data: { ...validBackup().data, events: 'nope' },
    };
    const result = validateBackup(backup, SCHEMA_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([{ code: 'invalidTable', table: 'events' }]);
    }
  });

  it('rejects tables containing non-object rows', () => {
    const backup = {
      ...validBackup(),
      data: {
        ...validBackup().data,
        homework: [{ id: '1' }, 'not an object'],
      },
    };
    const result = validateBackup(backup, SCHEMA_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.code).toBe('invalidTable');
      expect(result.errors[0]!.table).toBe('homework');
    }
  });

  it('ignores unknown data keys for forward compatibility', () => {
    const backup = {
      ...validBackup(),
      data: { ...validBackup().data, futureTable: [{ x: 1 }] },
    };
    const result = validateBackup(backup, SCHEMA_VERSION);
    expect(result.ok).toBe(true);
  });
});
