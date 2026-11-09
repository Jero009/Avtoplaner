import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Download, KeyRound, Link2, LogOut, RefreshCw, Upload } from 'lucide-react';
import { useDb } from '../app/db-context';
import { useTheme } from '../app/theme-context';
import type { Theme, Language } from '../utils/preferences';
import { saveLanguage } from '../utils/preferences';
import { formatUtcInZone } from '../utils/dates';
import type { SyncStateRecord } from '../db/types';
import { CalendarToggleList } from '../components/CalendarToggleList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadingState } from '../components/LoadingState';
import { MyHoursSection } from '../components/MyHoursSection';
import { buildBackup, validateBackup } from '../utils/backup';
import {
  exportAllTables,
  replaceAllTables,
} from '../db/backup-service';
import { latestSchemaVersion } from '../db/migration-runner';
import type { BackupFile } from '../utils/backup';
import type { CalendarRecord } from '../db/types';
import { DbInitError } from '../components/DbInitError';
import {
  EASISTENT_PASSWORD_KEY,
  EASISTENT_USERNAME_KEY,
} from '../integrations/easistent/sync';
import { useEasistentSync } from '../integrations/easistent/use-sync';
import {
  GOOGLE_CLIENT_ID_KEY,
  loadGoogleConnection,
} from '../integrations/google/sync';
import { EMBEDDED_CLIENT_ID } from '../integrations/google/embedded-client-id';
import { useGoogleSync } from '../integrations/google/use-sync';
import {
  BACKGROUND_SYNC_KEY,
  backgroundSyncEnabled,
  setBackgroundSyncSchedule,
} from '../integrations/easistent/background';
import { DeviceCalendarSection } from '../components/DeviceCalendarSection';

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

  // eAsistent credentials + sync state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [syncState, setSyncState] = useState<SyncStateRecord | null>(null);
  const [backgroundSync, setBackgroundSync] = useState<boolean | null>(null);
  const { syncing, testing, feedback, sync, testConnection } = useEasistentSync();
  const isAndroid = Capacitor.getPlatform() === 'android';

  // Google connection + sync state
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncState, setGoogleSyncState] = useState<SyncStateRecord | null>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const google = useGoogleSync();

  const loadCalendars = useCallback(async () => {
    if (!db) {
      return;
    }
    setCalendars(await db.repos.calendars.list());
  }, [db]);

  const loadEasistentState = useCallback(async () => {
    if (!db) {
      return;
    }
    const [storedUsername, storedPassword, state, backgroundRaw] = await Promise.all([
      db.repos.settings.get(EASISTENT_USERNAME_KEY),
      db.repos.settings.get(EASISTENT_PASSWORD_KEY),
      db.repos.syncState.get('easistent'),
      db.repos.settings.get(BACKGROUND_SYNC_KEY),
    ]);
    setUsername(storedUsername ?? '');
    setPasswordSet(Boolean(storedPassword));
    setSyncState(state);
    setBackgroundSync(backgroundSyncEnabled(backgroundRaw, Boolean(storedPassword)));
  }, [db]);

  const loadGoogleState = useCallback(async () => {
    if (!db) {
      return;
    }
    const [storedClientId, connection, state] = await Promise.all([
      db.repos.settings.get(GOOGLE_CLIENT_ID_KEY),
      loadGoogleConnection(db.repos),
      db.repos.syncState.get('google'),
    ]);
    setGoogleClientId(storedClientId ?? EMBEDDED_CLIENT_ID);
    setGoogleConnected(connection !== null);
    setGoogleSyncState(state);
  }, [db]);

  useEffect(() => {
    void loadCalendars();
    void loadEasistentState();
    void loadGoogleState();
  }, [loadCalendars, loadEasistentState, loadGoogleState]);

  const saveCredentials = async () => {
    if (!db || username.trim().length === 0) {
      setStatus({ kind: 'error', text: t('easistent.errors.missingCredentials') });
      return;
    }
    await db.repos.settings.set(EASISTENT_USERNAME_KEY, username.trim());
    // Only overwrite the stored password when the user typed a new one —
    // the field is left empty to keep the existing secret.
    if (password.length > 0) {
      await db.repos.settings.set(EASISTENT_PASSWORD_KEY, password);
    }
    setPassword('');
    setPasswordSet(true);
    setStatus({ kind: 'info', text: t('easistent.credentialsSaved') });
  };

  const runSync = async () => {
    const ok = await sync();
    if (ok) {
      await loadEasistentState();
      await loadCalendars();
    }
  };

  const toggleBackgroundSync = async () => {
    if (!db || backgroundSync === null) {
      return;
    }
    const next = !backgroundSync;
    setBackgroundSync(next);
    await db.repos.settings.set(BACKGROUND_SYNC_KEY, next ? '1' : '0');
    await setBackgroundSyncSchedule(next);
  };

  const runConnect = async () => {
    const ok = await google.connect(googleClientId);
    if (ok) {
      await loadGoogleState();
      await loadCalendars();
    }
  };

  const runGoogleSync = async () => {
    const ok = await google.sync();
    if (ok) {
      await loadGoogleState();
      await loadCalendars();
    }
  };

  const confirmGoogleDisconnect = async () => {
    await google.disconnect();
    setDisconnectConfirm(false);
    await loadGoogleState();
    await loadCalendars();
  };

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
        {dbState.status === 'error' && <DbInitError />}
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

      <MyHoursSection />

      <section className="card" aria-labelledby="easistent-heading">
        <h2 id="easistent-heading" className="section-title mb-1">
          {t('easistent.title')}
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          {t('easistent.description')}
        </p>
        {dbState.status === 'error' ? (
          <DbInitError />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="easistent-username">
                  {t('easistent.username')}
                </label>
                <input
                  id="easistent-username"
                  type="text"
                  autoComplete="username"
                  className="input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="easistent-password">
                  {t('easistent.password')}
                </label>
                <input
                  id="easistent-password"
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  value={password}
                  placeholder={passwordSet ? '••••••••' : ''}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {passwordSet && password.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t('easistent.passwordKeep')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void saveCredentials()}
                disabled={!db}
              >
                <KeyRound className="size-5" aria-hidden="true" />
                {t('easistent.saveCredentials')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void testConnection()}
                disabled={!db || testing || syncing}
              >
                <Link2 className="size-5" aria-hidden="true" />
                {testing ? t('easistent.testing') : t('easistent.testConnection')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runSync()}
                disabled={!db || syncing || testing}
              >
                <RefreshCw
                  className={`size-5 ${syncing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {syncing ? t('easistent.syncing') : t('easistent.syncNow')}
              </button>
            </div>
            {isAndroid && backgroundSync !== null && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-blue-600"
                    checked={backgroundSync}
                    disabled={!db || !passwordSet}
                    onChange={() => void toggleBackgroundSync()}
                  />
                  <span>{t('easistent.backgroundSync')}</span>
                </label>
                <p className="text-xs text-slate-400">
                  {t('easistent.backgroundSyncHint')}
                </p>
              </div>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('easistent.lastSync', {
                time: syncState?.lastSuccessUtc
                  ? formatUtcInZone(syncState.lastSuccessUtc, 'd.M.yyyy HH:mm')
                  : t('easistent.never'),
              })}
            </p>
            {feedback && (
              <p
                role="status"
                className={`text-sm ${
                  feedback.kind === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-700 dark:text-green-400'
                }`}
              >
                {feedback.text}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="google-heading">
        <h2 id="google-heading" className="section-title mb-1">
          {t('google.title')}
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          {t('google.description')}
        </p>
        {dbState.status === 'error' ? (
          <DbInitError />
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className="label" htmlFor="google-client-id">
                {t('google.clientId')}
              </label>
              <input
                id="google-client-id"
                type="text"
                className="input"
                value={googleClientId}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setGoogleClientId(event.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                {t('google.clientIdHint')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!googleConnected && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void runConnect()}
                  disabled={!db || google.connecting || google.syncing}
                >
                  <Link2 className="size-5" aria-hidden="true" />
                  {google.connecting ? t('google.connecting') : t('google.connect')}
                </button>
              )}
              {googleConnected && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void runGoogleSync()}
                    disabled={!db || google.syncing || google.connecting}
                  >
                    <RefreshCw
                      className={`size-5 ${google.syncing ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    {google.syncing ? t('google.syncing') : t('google.syncNow')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDisconnectConfirm(true)}
                    disabled={!db || google.connecting || google.syncing}
                  >
                    <LogOut className="size-5" aria-hidden="true" />
                    {t('google.disconnect')}
                  </button>
                </>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('google.lastSync', {
                time: googleSyncState?.lastSuccessUtc
                  ? formatUtcInZone(googleSyncState.lastSuccessUtc, 'd.M.yyyy HH:mm')
                  : t('google.never'),
              })}
            </p>
            {google.feedback && (
              <p
                role="status"
                className={`text-sm ${
                  google.feedback.kind === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-700 dark:text-green-400'
                }`}
              >
                {google.feedback.text}
              </p>
            )}
          </div>
        )}
      </section>

      <DeviceCalendarSection />

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

      {disconnectConfirm && (
        <ConfirmDialog
          title={t('google.disconnectConfirmTitle')}
          message={t('google.disconnectConfirmMessage')}
          confirmLabel={t('google.disconnect')}
          danger
          onCancel={() => setDisconnectConfirm(false)}
          onConfirm={() => void confirmGoogleDisconnect()}
        />
      )}
    </div>
  );
}
