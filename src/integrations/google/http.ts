import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Error kinds the Google integration can produce. Same contract as the
 * eAsistent client so the UI can map every failure to a translated message.
 * Google Calendar API responses carry CORS headers, so unlike eAsistent the
 * browser/PWA path is fully supported once the OAuth client is configured.
 */
export type GoogleErrorKind = 'network' | 'auth' | 'http' | 'parse';

export class GoogleError extends Error {
  readonly kind: GoogleErrorKind;
  readonly status?: number;

  constructor(kind: GoogleErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'GoogleError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * One HTTP request for the Google integration. `form` is urlencoded and sent
 * as the request body (the OAuth token endpoint is form-encoded; the Calendar
 * API is GET-only for our read path). Tests inject their own request fn.
 */
export type GoogleRequestFn = (
  method: 'GET' | 'POST',
  url: string,
  options: { headers?: Record<string, string>; form?: Record<string, string> },
) => Promise<unknown>;

/** RFC 3986-safe urlencoding of a form body. */
export function encodeForm(form: Record<string, string>): string {
  return Object.entries(form)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

function formHeaders(form?: Record<string, string>): Record<string, string> {
  return form
    ? { 'Content-Type': 'application/x-www-form-urlencoded' }
    : {};
}

function throwHttpError(status: number, bodyText: string): never {
  const detail = bodyText.trim().slice(0, 200);
  throw new GoogleError(
    status === 400 || status === 401 || status === 403 ? 'auth' : 'http',
    `Google request failed with HTTP ${status}${detail ? `: ${detail}` : ''}`,
    status,
  );
}

/**
 * Perform one JSON request. On Android it goes through CapacitorHttp (the
 * native HTTP layer); on web it uses fetch. Google's APIs are CORS-enabled,
 * so the web path works like the native one.
 */
export const defaultGoogleRequest: GoogleRequestFn = async (
  method,
  url,
  options,
) => {
  const headers = { ...formHeaders(options.form), ...options.headers };
  const body = options.form === undefined ? undefined : encodeForm(options.form);

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      method,
      url,
      headers,
      data: body,
      // Keep the raw text so error bodies stay inspectable.
      responseType: 'text' as never,
    });
    if (response.status >= 400) {
      throwHttpError(response.status, String(response.data ?? ''));
    }
    return parseJsonBody(String(response.data ?? ''), url);
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch {
    throw new GoogleError('network', 'Google request failed before reaching the server.');
  }
  const text = await response.text();
  if (!response.ok) {
    throwHttpError(response.status, text);
  }
  return parseJsonBody(text, url);
};

function parseJsonBody(text: string, url: string): unknown {
  try {
    return text.length > 0 ? JSON.parse(text) : null;
  } catch {
    throw new GoogleError('parse', `Google returned a non-JSON response from ${url}`);
  }
}
