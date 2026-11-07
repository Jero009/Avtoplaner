import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Error kinds the eAsistent client can produce. `network` covers the
 * browser/PWA CORS limitation: on the web platform the API cannot be called
 * from the WebView (no CORS headers), which surfaces as an opaque fetch
 * failure — the user gets a clear message instead of a stack trace.
 */
export type EasistentErrorKind = 'network' | 'auth' | 'http' | 'parse';

export class EasistentError extends Error {
  readonly kind: EasistentErrorKind;
  readonly status?: number;

  constructor(kind: EasistentErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'EasistentError';
    this.kind = kind;
    this.status = status;
  }
}

export type RequestFn = (
  method: 'GET' | 'POST',
  url: string,
  options: { headers: Record<string, string>; body?: unknown },
) => Promise<unknown>;

const CORS_HINT =
  'Request failed before reaching eAsistent. In a browser/PWA the eAsistent ' +
  'API is blocked by CORS — use the Android app to sync.';

/**
 * Perform one JSON request. On Android it goes through CapacitorHttp (the
 * native HTTP layer, no CORS); on web it uses fetch, where CORS may block.
 */
export const defaultRequest: RequestFn = async (method, url, options) => {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      method,
      url,
      headers: options.headers,
      data: options.body as Record<string, unknown> | undefined,
    });
    if (response.status >= 400) {
      throw new EasistentError(
        response.status === 401 || response.status === 403 ? 'auth' : 'http',
        `eAsistent request failed with HTTP ${response.status}`,
        response.status,
      );
    }
    return response.data;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: options.headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // Opaque TypeError from fetch — CORS or no connectivity.
    throw new EasistentError('network', CORS_HINT);
  }
  if (!response.ok) {
    throw new EasistentError(
      response.status === 401 || response.status === 403 ? 'auth' : 'http',
      `eAsistent request failed with HTTP ${response.status}`,
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new EasistentError('parse', 'eAsistent returned a non-JSON response');
  }
};
