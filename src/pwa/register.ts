import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker bootstrap, split by platform.
 *
 * - Browser/PWA: normal vite-plugin-pwa autoUpdate registration. Explicitly
 *   importing `virtual:pwa-register` here also stops the plugin from
 *   auto-injecting its own registration script into index.html.
 * - Android (native APK): NO service worker at all. The APK ships every asset
 *   in the app package, so a SW adds nothing on native — but it CAN wedge the
 *   WebView in a version-mixed state after an APK update: the SW from the
 *   previous version keeps controlling the page, serves a stale index.html
 *   and its precache, and dynamic imports then 404 against the new build
 *   ("Failed to fetch dynamically imported module: …/esm-*.js", v1.4.x bug
 *   report). So on native we never register, and we proactively unregister
 *   any registration left behind by an older build and wipe its caches,
 *   which heals already-poisoned installs on the first launch after update.
 */
export function initPwaRegistration(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  if (Capacitor.isNativePlatform()) {
    void purgeServiceWorker();
    return;
  }
  registerSW({ immediate: true });
}

/**
 * Remove every service-worker registration and Cache Storage entry. Runs on
 * every native launch — cheap when clean (zero registrations), and it is the
 * self-heal path for phones updated from an SW-enabled build.
 */
async function purgeServiceWorker(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (registrations.length > 0) {
      console.info('[pwa] native build: removed legacy service worker registration(s)');
    }
  } catch {
    // SW API unavailable — nothing to unregister.
  }
  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  } catch {
    // Cache API unavailable — nothing to clear.
  }
}
