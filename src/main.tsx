import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import { AppProviders } from './app/providers';
import { App } from './app/App';
import { initBackgroundSync } from './integrations/easistent/background';

// Register the daily background-fetch callback before anything else — the
// OS relaunches this same entry point headlessly when the fetch fires.
void initBackgroundSync();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
