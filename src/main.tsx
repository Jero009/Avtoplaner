import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import { AppProviders } from './app/providers';
import { App } from './app/App';
import { initBackgroundSync } from './integrations/easistent/background';
import { Capacitor } from '@capacitor/core';
import { handleRedirectUrl } from './integrations/google/oauth-callback';
import { initPwaRegistration } from './pwa/register';
import { safeDynamicImport } from './utils/safe-dynamic-import';

// Register the daily background-fetch callback before anything else — the
// OS relaunches this same entry point headlessly when the fetch fires.
void initBackgroundSync();

// No service worker on native Android (the APK ships all assets; a stale SW
// after an APK update is what broke the Google connect flow in v1.4.x).
// Browser/PWA keeps the normal autoUpdate registration.
initPwaRegistration();

/**
 * Google OAuth redirect handling. Android: the consent screen redirects to
 * the `com.googleusercontent.apps.<id>:/oauth2redirect` deep link, delivered
 * here via `appUrlOpen`. Browser/PWA: Google redirects to
 * `<origin>/oauth2redirect`, which reloads the SPA — pick the code out of
 * the query string once and clean the address bar.
 */
async function initOAuthRedirectHandling(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await safeDynamicImport(() => import('@capacitor/app'));
      void App.addListener('appUrlOpen', (event) => {
        handleRedirectUrl(event.url);
      });
    } catch (error) {
      // Never let a failed plugin import break app startup.
      console.warn('[oauth] appUrlOpen listener unavailable', error);
    }
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
