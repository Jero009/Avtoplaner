import { createContext, useContext } from 'react';
import type { DbDriver } from '../db/driver';
import type { Repositories } from '../db/repositories';

export interface Database {
  driver: DbDriver;
  repos: Repositories;
}

export type DbState =
  | { status: 'loading' }
  | { status: 'ready'; database: Database }
  | { status: 'error'; message: string };

export const DbContext = createContext<DbState | null>(null);

export function useDb(): DbState {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error('useDb must be used within DbProvider');
  }
  return context;
}
