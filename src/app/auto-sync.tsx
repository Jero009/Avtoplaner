import { useEffect } from 'react';
import { useDb } from './db-context';
import { maybeSyncOnOpen } from '../integrations/easistent/background';

/**
 * Silent auto-sync when the app opens: runs when credentials exist and the
 * last successful eAsistent sync is older than ~6 h. Renders nothing; any
 * failure is recorded in sync_state and surfaced by the existing UI.
 */
export function AutoSyncOnOpen() {
  const dbState = useDb();

  useEffect(() => {
    if (dbState.status !== 'ready') {
      return;
    }
    void maybeSyncOnOpen(dbState.database.driver, dbState.database.repos);
  }, [dbState]);

  return null;
}
