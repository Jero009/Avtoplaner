import { useDb } from '../app/db-context';
import { ErrorState } from './ErrorState';
import { useTranslation } from 'react-i18next';

/**
 * Error view for database initialization failures. Shows the generic
 * translated message plus the raw error text so failures are diagnosable
 * on-device without a debugger attached.
 */
export function DbInitError() {
  const dbState = useDb();
  const { t } = useTranslation();

  if (dbState.status !== 'error') {
    return null;
  }
  const message = dbState.message;

  return (
    <div>
      <ErrorState message={t('db.initError')} />
      {message && (
        <p className="mx-auto max-w-md px-4 pb-8 text-center text-xs text-neutral-500 break-words">
          {message}
        </p>
      )}
    </div>
  );
}
