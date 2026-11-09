import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import { AppProviders } from './app/providers';
import { App } from './app/App';
import { initBackgroundSync } from './integrations/easistent/background';
import { Capacitor } from '@capacitor/core';
import { handleRedirectUrl } from './integrations/google/oauth-callback';

// Register the daily background-fetch callback before anything else — the
// OS relaunches this same entry point headlessly when the fetch fires.
void initBackgroundSync();

/**
 * Google OAuth redirect handling. Android: the consent screen redirects to
 * the `com.googleusercontent.apps.<id>:/oauth2redirect` deep link, delivered
 * here via `appUrlOpen`. Browser/PWA: Google redirects to
 * `<origin>/oauth2redirect`, which reloads the SPA — pick the code out of
 * the query string once and clean the address bar.
 */
async function initOAuthRedirectHandling(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    void App.addListener('appUrlOpen', (event) => {
      handleRedirectUrl(event.url);
    });
  } else if (window.location.search.length > 0) {
    const handled = handleRedirectUrl(window.location.href);
    if (handled) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
}
void initOAuthRedirectHandling();

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
