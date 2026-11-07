import { useEffect, useState, type ReactNode } from 'react';
import { openDatabase } from '../db/connection';
import { runMigrations } from '../db/migration-runner';
import { createRepositories } from '../db/repositories';
import { DbContext, type DbState } from './db-context';

async function initializeDatabase() {
  const driver = await openDatabase();
  await runMigrations(driver);
  const repos = createRepositories(driver);
  await repos.calendars.ensureLocalCalendar();
  return { driver, repos };
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DbState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    initializeDatabase()
      .then((database) => {
        if (!cancelled) {
          setState({ status: 'ready', database });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DbContext.Provider value={state}>{children}</DbContext.Provider>;
}
