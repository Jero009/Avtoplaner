import { describe, expect, it } from 'vitest';
import {
  AUTH_ENDPOINT,
  GOOGLE_CALENDAR_SCOPE,
  TOKEN_ENDPOINT,
  buildAuthUrl,
  createOAuthState,
  createPkcePair,
  exchangeCode,
  parseRedirectUrl,
  redirectUriFor,
  refreshAccessToken,
  type PkceCrypto,
} from './oauth';
import { GoogleError } from './http';

/** Deterministic crypto stub: bytes are a counter, sha256 is a fake digest. */
const fakeCrypto: PkceCrypto = {
  randomBytes: (length) => {
    const bytes = new Uint8Array(length);
    bytes.fill(0xab);
    return bytes;
  },
  sha256Base64Url: async (input) =>
    `fake-${input.length}-${input.slice(0, 4)}`,
};

describe('createPkcePair', () => {
  it('derives a base64url challenge from the verifier', async () => {
    const pair = await createPkcePair(fakeCrypto);
    // 48 bytes → 64 base64url chars, no padding characters.
    expect(pair.verifier).toHaveLength(64);
    expect(pair.verifier).not.toMatch(/[+/=]/);
    expect(pair.challenge).toBe(`fake-${pair.verifier.length}-${pair.verifier.slice(0, 4)}`);
  });

  it('creates a fresh state value', () => {
    expect(createOAuthState(fakeCrypto)).toHaveLength(22); // 16 bytes base64url
  });
});

describe('buildAuthUrl', () => {
  it('contains every required OAuth parameter', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: 'client-123.apps.googleusercontent.com',
        redirectUri: 'com.googleusercontent.apps.client-123.apps.googleusercontent.com:/oauth2redirect',
        codeChallenge: 'challenge-xyz',
        state: 'state-abc',
      }),
    );
    expect(url.origin + url.pathname).toBe(AUTH_ENDPOINT);
    expect(url.searchParams.get('client_id')).toBe('client-123.apps.googleusercontent.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-abc');
    // Offline access + forced consent guarantee a refresh token.
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

describe('parseRedirectUrl', () => {
  it('parses the Android custom-scheme redirect', () => {
    const result = parseRedirectUrl(
      'com.googleusercontent.apps.client-123.apps.googleusercontent.com:/oauth2redirect?code=4%2F0Abc&state=state-abc&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar',
    );
    expect(result?.code).toBe('4/0Abc');
    expect(result?.state).toBe('state-abc');
    expect(result?.error).toBeUndefined();
  });

  it('parses a browser https redirect', () => {
    const result = parseRedirectUrl('https://example.com/oauth2redirect?code=xyz&state=s1');
    expect(result?.code).toBe('xyz');
    expect(result?.state).toBe('s1');
  });

  it('parses an error redirect', () => {
    const result = parseRedirectUrl('https://example.com/oauth2redirect?error=access_denied&state=s1');
    expect(result?.error).toBe('access_denied');
    expect(result?.code).toBeUndefined();
  });

  it('returns null without a query string or without code/error', () => {
    expect(parseRedirectUrl('com.googleusercontent.apps.x:/oauth2redirect')).toBeNull();
    expect(parseRedirectUrl('https://example.com/oauth2redirect?foo=bar')).toBeNull();
  });
});

describe('redirectUriFor', () => {
  it('strips the .apps.googleusercontent.com suffix in the reverse-client-id scheme', () => {
    expect(redirectUriFor('client-123.apps.googleusercontent.com')).toBe(
      'com.googleusercontent.apps.client-123:/oauth2redirect',
    );
  });

  it('passes bare client IDs through unchanged', () => {
    expect(redirectUriFor('client-123')).toBe(
      'com.googleusercontent.apps.client-123:/oauth2redirect',
    );
  });

  it('uses the web origin on the PWA', () => {
    expect(redirectUriFor('client-123', 'https://example.com')).toBe(
      'https://example.com/oauth2redirect',
    );
  });
});

describe('exchangeCode', () => {
  it('sends the PKCE token exchange form and returns the tokens', async () => {
    const calls: { method: string; url: string; form?: Record<string, string> }[] = [];
    const tokens = await exchangeCode({
      clientId: 'client-123',
      code: 'the-code',
      codeVerifier: 'the-verifier',
      redirectUri: 'com.googleusercontent.apps.client-123:/oauth2redirect',
      request: async (method, url, options) => {
        calls.push({ method, url, form: options.form });
        return { access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-1' };
      },
    });
    expect(tokens).toEqual({ accessToken: 'at-1', expiresIn: 3600, refreshToken: 'rt-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', url: TOKEN_ENDPOINT });
    expect(calls[0]!.form).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: 'com.googleusercontent.apps.client-123:/oauth2redirect',
      client_id: 'client-123',
    });
  });

  it('maps an OAuth error response to an auth error', async () => {
    await expect(
      exchangeCode({
        clientId: 'client-123',
        code: 'bad',
        codeVerifier: 'v',
        redirectUri: 'r',
        request: async () => ({ error: 'invalid_grant', error_description: 'Code was already redeemed.' }),
      }),
    ).rejects.toMatchObject({ name: 'GoogleError', kind: 'auth' });
  });
});

describe('refreshAccessToken', () => {
  it('sends the refresh grant and returns a token set', async () => {
    let form: Record<string, string> | undefined;
    const tokens = await refreshAccessToken({
      clientId: 'client-123',
      refreshToken: 'rt-1',
      request: async (_method, _url, options) => {
        form = options.form;
        return { access_token: 'at-2', expires_in: 3600 };
      },
    });
    expect(tokens.refreshToken).toBeUndefined();
    expect(form?.grant_type).toBe('refresh_token');
    expect(form?.refresh_token).toBe('rt-1');
    expect(form?.client_id).toBe('client-123');
  });

  it('rejects a malformed token response as a parse error', async () => {
    await expect(
      refreshAccessToken({
        clientId: 'client-123',
        refreshToken: 'rt-1',
        request: async () => ({ unexpected: true }),
      }),
    ).rejects.toBeInstanceOf(GoogleError);
  });
});
