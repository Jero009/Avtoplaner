import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useEasistentSync } from '../integrations/easistent/use-sync';

/**
 * "Sync now" button with inline feedback, shared by the homework and
 * timetable pages. The settings page builds its own richer section.
 */
export function EasistentSyncButton() {
  const { t } = useTranslation();
  const { syncing, feedback, sync } = useEasistentSync();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-secondary self-start"
        onClick={() => void sync()}
        disabled={syncing}
      >
        <RefreshCw className={`size-5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
        {syncing ? t('easistent.syncing') : t('easistent.syncNow')}
      </button>
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
  );
}
