import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({ isNative: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativeMock.isNative,
    getPlatform: () => (nativeMock.isNative ? 'android' : 'web'),
  },
  CapacitorHttp: {
    request: vi.fn(),
  },
}));

import { CapacitorHttp } from '@capacitor/core';
import { defaultGoogleRequest } from './http';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

describe('defaultGoogleRequest native branch', () => {
  afterEach(() => {
    vi.clearAllMocks();
    nativeMock.isNative = false;
  });

  it('accepts a pre-parsed JSON object from CapacitorHttp (v1.4.6 regression)', async () => {
    nativeMock.isNative = true;
    vi.mocked(CapacitorHttp.request).mockResolvedValue({
      status: 200,
      // CapacitorHttp parses JSON bodies into objects even with
      // responseType 'text' — the object shape must not be mangled
      // through String() into "[object Object]".
      data: { access_token: 'at', expires_in: 3600 },
      headers: {},
    } as never);

    const result = await defaultGoogleRequest('POST', TOKEN_URL, {
      form: { grant_type: 'authorization_code' },
    });
    expect(result).toEqual({ access_token: 'at', expires_in: 3600 });
  });

  it('still parses raw string responses from CapacitorHttp', async () => {
    nativeMock.isNative = true;
    vi.mocked(CapacitorHttp.request).mockResolvedValue({
      status: 200,
      data: '{"access_token":"at","expires_in":3600}',
      headers: {},
    } as never);

    const result = await defaultGoogleRequest('POST', TOKEN_URL, {
      form: { grant_type: 'authorization_code' },
    });
    expect(result).toEqual({ access_token: 'at', expires_in: 3600 });
  });

  it('surfaces pre-parsed error bodies on HTTP >= 400', async () => {
    nativeMock.isNative = true;
    vi.mocked(CapacitorHttp.request).mockResolvedValue({
      status: 400,
      data: { error: 'invalid_grant', error_description: 'code expired' },
      headers: {},
    } as never);

    await expect(
      defaultGoogleRequest('POST', TOKEN_URL, { form: { code: 'x' } }),
    ).rejects.toThrow(/invalid_grant|expired/);
  });
});
