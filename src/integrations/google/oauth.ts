import { GoogleError, defaultGoogleRequest, type GoogleRequestFn } from './http';
import type { GoogleTokenSet } from './types';

/**
 * OAuth 2.0 Authorization Code flow with PKCE for Google Calendar — the only
 * flow that works for an installed app with no backend: no client secret is
 * embedded, the code verifier never leaves the device until the token
 * exchange, and Google returns a long-lived refresh token we store locally.
 *
 * Reference: https://developers.google.com/identity/protocols/oauth2/native-app
 */

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export interface PkcePair {
  /** Code verifier: 64 base64url characters (48 random bytes). */
  verifier: string;
  /** S256 code challenge derived from the verifier. */
  challenge: string;
}

/** Minimal injectable crypto surface for tests. */
export interface PkceCrypto {
  randomBytes(length: number): Uint8Array;
  sha256Base64Url(input: string): Promise<string>;
}

function defaultCrypto(): PkceCrypto {
  return {
    randomBytes: (length) => {
      const bytes = new Uint8Array(length);
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    },
    sha256Base64Url: async (input) => {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input),
      );
      return bytesToBase64Url(new Uint8Array(digest));
    },
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Create a fresh PKCE verifier/challenge pair. */
export async function createPkcePair(crypto?: PkceCrypto): Promise<PkcePair> {
  const impl = crypto ?? defaultCrypto();
  const verifier = bytesToBase64Url(impl.randomBytes(48));
  const challenge = await impl.sha256Base64Url(verifier);
  return { verifier, challenge };
}

/** Random opaque state value for CSRF protection of the redirect. */
export function createOAuthState(crypto?: PkceCrypto): string {
  const impl = crypto ?? defaultCrypto();
  return bytesToBase64Url(impl.randomBytes(16));
}

export interface AuthUrlOptions {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
}

/**
 * Build the consent-screen URL. `access_type=offline` + `prompt=consent`
 * guarantee a refresh token on every connect (Google otherwise only issues
 * one on the very first consent).
 */
export function buildAuthUrl(options: AuthUrlOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scope ?? GOOGLE_CALENDAR_SCOPE,
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
    state: options.state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface RedirectResult {
  code?: string;
  error?: string;
  state?: string;
}

/**
 * Parse the OAuth redirect. Accepts both the Android custom-scheme form
 * (`com.googleusercontent.apps.<id>:/oauth2redirect?code=…`) and a normal
 * https URL (browser/PWA), because WHATWG URL cannot always parse
 * non-special schemes we fall back to a plain `?` split.
 */
export function parseRedirectUrl(url: string): RedirectResult | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) {
    return null;
  }
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const result: RedirectResult = {
    code: params.get('code') ?? undefined,
    error: params.get('error') ?? undefined,
    state: params.get('state') ?? undefined,
  };
  if (!result.code && !result.error) {
    return null;
  }
  return result;
}

/**
 * The redirect URI for a client ID. Google auto-registers the reverse-client
 * ID custom scheme for installed-app clients, so the same client works on
 * Android without any redirect configuration on Google's side.
 */
export function redirectUriFor(clientId: string, origin?: string): string {
  if (origin) {
    return `${origin}/oauth2redirect`;
  }
  return `com.googleusercontent.apps.${clientId}:/oauth2redirect`;
}

export interface ExchangeOptions {
  clientId: string;
  /** Only needed for web-type clients; Android clients use PKCE alone. */
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  request?: GoogleRequestFn;
}

/** Exchange the authorization code for the first token set. */
export async function exchangeCode(options: ExchangeOptions): Promise<GoogleTokenSet> {
  return tokenRequest(
    {
      grant_type: 'authorization_code',
      code: options.code,
      code_verifier: options.codeVerifier,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
    },
    options.request,
  );
}

export interface RefreshOptions {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  request?: GoogleRequestFn;
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshAccessToken(options: RefreshOptions): Promise<GoogleTokenSet> {
  return tokenRequest(
    {
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      client_id: options.clientId,
      ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
    },
    options.request,
  );
}

async function tokenRequest(
  form: Record<string, string>,
  request?: GoogleRequestFn,
): Promise<GoogleTokenSet> {
  const response = (await (request ?? defaultGoogleRequest)(
    'POST',
    TOKEN_ENDPOINT,
    { form },
  )) as Record<string, unknown>;

  if (typeof response?.error === 'string') {
    const description =
      typeof response.error_description === 'string'
        ? response.error_description
        : response.error;
    throw new GoogleError('auth', `Google OAuth error: ${description}`);
  }

  const accessToken = response?.access_token;
  const expiresIn = response?.expires_in;
  if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
    throw new GoogleError('parse', 'Google token response is missing fields.');
  }
  const refreshToken =
    typeof response.refresh_token === 'string' ? response.refresh_token : undefined;
  return { accessToken, expiresIn, refreshToken };
}
