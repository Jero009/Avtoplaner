import type { ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';
import { DbProvider } from './db-provider';
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <DbProvider>{children}</DbProvider>
    </ThemeProvider>
  );
}
