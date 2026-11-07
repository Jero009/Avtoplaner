export type BackupErrorCode =
  | 'notAnObject'
  | 'missingAppVersion'
  | 'invalidSchemaVersion'
  | 'schemaVersionMismatch'
  | 'missingExportedAt'
  | 'invalidExportedAt'
  | 'missingData'
  | 'invalidTable';

export interface BackupError {
  code: BackupErrorCode;
  table?: string;
}

export interface BackupFile {
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, Record<string, unknown>[]>;
}

export type ValidationResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; errors: BackupError[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the structure of a parsed backup file. The schema version must
 * exactly match the app's current schema version, because there is no
 * backup migration path yet. Unknown data keys are ignored for forward
 * compatibility.
 */
export function validateBackup(
  value: unknown,
  currentSchemaVersion: number,
): ValidationResult {
  const errors: BackupError[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: [{ code: 'notAnObject' }] };
  }

  if (typeof value.appVersion !== 'string' || value.appVersion.length === 0) {
    errors.push({ code: 'missingAppVersion' });
  }

  if (
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion) ||
    value.schemaVersion < 1
  ) {
    errors.push({ code: 'invalidSchemaVersion' });
  } else if (value.schemaVersion !== currentSchemaVersion) {
    errors.push({ code: 'schemaVersionMismatch' });
  }

  if (typeof value.exportedAt !== 'string' || value.exportedAt.length === 0) {
    errors.push({ code: 'missingExportedAt' });
  } else if (Number.isNaN(Date.parse(value.exportedAt))) {
    errors.push({ code: 'invalidExportedAt' });
  }

  let dataObject: Record<string, Record<string, unknown>[]> | null = null;

  if (!isPlainObject(value.data)) {
    errors.push({ code: 'missingData' });
  } else {
    dataObject = {};
    for (const [table, rows] of Object.entries(value.data)) {
      if (!Array.isArray(rows)) {
        errors.push({ code: 'invalidTable', table });
      } else if (!rows.every((row) => isPlainObject(row))) {
        errors.push({ code: 'invalidTable', table });
      } else {
        dataObject[table] = rows as Record<string, unknown>[];
      }
    }
  }

  if (errors.length > 0 || dataObject === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    backup: {
      appVersion: value.appVersion as string,
      schemaVersion: value.schemaVersion as number,
      exportedAt: value.exportedAt as string,
      data: dataObject,
    },
  };
}

/** Build the backup file structure from exported table data. */
export function buildBackup(
  appVersion: string,
  schemaVersion: number,
  data: Record<string, Record<string, unknown>[]>,
): BackupFile {
  return {
    appVersion,
    schemaVersion,
    exportedAt: new Date().toISOString(),
    data,
  };
}
