import { parseRedirectUrl } from './oauth';

/**
 * Registry for the in-flight OAuth consent. The actual redirect arrives in
 * two platform-dependent ways:
 *
 * - Android: a custom-scheme deep link (`appUrlOpen` from @capacitor/app,
 *   registered once in main.tsx) → `handleRedirectUrl(event.url)`.
 * - Browser/PWA: Google redirects back to `<origin>/oauth2redirect`, which
 *   reloads the SPA → main.tsx calls `handleRedirectUrl(location.href)` with
 *   the query string still present and cleans it afterwards.
 */

interface PendingAuthorization {
  state: string;
  resolve(code: string): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

let pending: PendingAuthorization | null = null;

const CONNECT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Wait for the authorization code of the consent flow identified by
 * `state`. Rejects on timeout (user never returned) or error redirect.
 */
export function awaitAuthorizationCode(
  state: string,
  timeoutMs = CONNECT_TIMEOUT_MS,
): Promise<string> {
  cancelPendingAuthorization('Connection cancelled.');
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error('Google consent timed out — try connecting again.'));
    }, timeoutMs);
    pending = { state, resolve, reject, timer };
  });
}

/** Drop any in-flight consent wait (e.g. user pressed connect twice). */
export function cancelPendingAuthorization(reason: string): void {
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    pending = null;
  }
}

/**
 * Feed a redirect URL into the pending consent. Returns true when the URL
 * belonged to the pending flow (caller may then clean the address bar).
 */
export function handleRedirectUrl(url: string): boolean {
  if (!pending) {
    return false;
  }
  const result = parseRedirectUrl(url);
  if (!result) {
    return false;
  }
  if (result.state !== pending.state) {
    // Not our flow (or a stale tab) — keep waiting.
    return false;
  }
  const current = pending;
  clearTimeout(current.timer);
  pending = null;
  if (result.error) {
    current.reject(new Error(`Google consent failed: ${result.error}`));
  } else if (result.code) {
    current.resolve(result.code);
  }
  return true;
}
