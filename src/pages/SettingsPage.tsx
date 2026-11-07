import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';
import { useDb } from '../app/db-context';
import { useTheme } from '../app/theme-context';
import type { Theme, Language } from '../utils/preferences';
import { saveLanguage } from '../utils/preferences';
import { CalendarToggleList } from '../components/CalendarToggleList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { buildBackup, validateBackup } from '../utils/backup';
import {
  exportAllTables,
  replaceAllTables,
} from '../db/backup-service';
import { latestSchemaVersion } from '../db/migration-runner';
import type { BackupFile } from '../utils/backup';
import type { CalendarRecord } from '../db/types';

const THEME_OPTIONS: readonly { value: Theme; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
  { value: 'system', labelKey: 'settings.themeSystem' },
];

const LANGUAGE_OPTIONS: readonly { value: Language; labelKey: string }[] = [
  { value: 'sl', labelKey: 'settings.languageSl' },
  { value: 'en', labelKey: 'settings.languageEn' },
];

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const dbState = useDb();
  const { theme, setTheme } = useTheme();
  const db = dbState.status === 'ready' ? dbState.database : null;
  const [calendars, setCalendars] = useState<CalendarRecord[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCalendars = useCallback(async () => {
    if (!db) {
      return;
    }
    setCalendars(await db.repos.calendars.list());
  }, [db]);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  const setLanguage = (language: Language) => {
    void i18n.changeLanguage(language);
    saveLanguage(language);
  };

  const handleExport = async () => {
    if (!db) {
      return;
    }
    try {
      const data = await exportAllTables(db.driver);
      const backup = buildBackup(__APP_VERSION__, latestSchemaVersion(), data);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `autoplaner-backup-${backup.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: 'info', text: t('settings.exportSuccess') });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleFileSelected = async (file: File) => {
    if (!db) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setStatus({ kind: 'error', text: t('settings.backupErrors.invalidJson') });
      return;
    }
    const result = validateBackup(parsed, latestSchemaVersion());
    if (!result.ok) {
      const first = result.errors[0]!;
      setStatus({
        kind: 'error',
        text:
          first.code === 'invalidTable'
            ? t(`settings.backupErrors.invalidTable`, { table: first.table })
            : t(`settings.backupErrors.${first.code}`),
      });
      return;
    }
    setStatus(null);
    setPendingImport(result.backup);
  };

  const confirmImport = async () => {
    if (!db || !pendingImport) {
      return;
    }
    try {
      await replaceAllTables(db.driver, pendingImport.data, latestSchemaVersion());
      await loadCalendars();
      setStatus({ kind: 'info', text: t('settings.importSuccess') });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingImport(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

      <section className="card" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="section-title mb-3">
          {t('settings.appearance')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="label" id="theme-label">
              {t('settings.theme')}
            </p>
            <div role="radiogroup" aria-labelledby="theme-label" className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.value}
                  onClick={() => setTheme(option.value)}
                  className={`btn ${theme === option.value ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label" id="language-label">
              {t('settings.language')}
            </p>
            <div role="radiogroup" aria-labelledby="language-label" className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={i18n.language === option.value}
                  onClick={() => setLanguage(option.value)}
                  className={`btn ${i18n.language === option.value ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="calendars-heading">
        <h2 id="calendars-heading" className="section-title mb-3">
          {t('settings.calendarVisibility')}
        </h2>
        {dbState.status === 'error' && <ErrorState message={t('db.initError')} />}
        {calendars === null && dbState.status !== 'error' && <LoadingState />}
        {calendars !== null && (
          <CalendarToggleList
            calendars={calendars}
            onToggle={async (id, visible) => {
              if (!db) {
                return;
              }
              await db.repos.calendars.setVisible(id, visible);
              await loadCalendars();
            }}
          />
        )}
      </section>

      <section className="card" aria-labelledby="backup-heading">
        <h2 id="backup-heading" className="section-title mb-1">
          {t('settings.backupSection')}
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          {t('settings.backupDescription')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleExport()}
            disabled={!db}
          >
            <Download className="size-5" aria-hidden="true" />
            {t('settings.export')}
          </button>
          <label className="btn btn-secondary cursor-pointer">
            <Upload className="size-5" aria-hidden="true" />
            {t('settings.import')}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleFileSelected(file);
                }
              }}
            />
          </label>
        </div>
        {status && (
          <p
            role="status"
            className={`mt-3 text-sm ${
              status.kind === 'error'
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-700 dark:text-green-400'
            }`}
          >
            {status.text}
          </p>
        )}
      </section>

      <p className="text-center text-xs text-slate-400">
        {t('common.version', { version: __APP_VERSION__ })}
      </p>

      {pendingImport && (
        <ConfirmDialog
          title={t('settings.importConfirmTitle')}
          message={t('settings.importConfirmMessage')}
          confirmLabel={t('common.confirm')}
          danger
          onCancel={() => {
            setPendingImport(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
          onConfirm={() => void confirmImport()}
        />
      )}
    </div>
  );
}
