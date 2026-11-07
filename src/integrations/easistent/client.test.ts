import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RANGE_DAYS,
  chunkRange,
  createEasistentClient,
  easistentLogin,
  fetchTimetableRange,
} from './client';
import { EasistentError, type RequestFn } from './http';
import {
  lessonBlock,
  loginResponse,
  timetableChunkResponse,
} from './fixtures';

describe('chunkRange', () => {
  it('keeps a short range as a single window', () => {
    expect(chunkRange('2026-11-07', '2026-11-08')).toEqual([
      ['2026-11-07', '2026-11-08'],
    ]);
  });

  it('returns exactly one 14-day window for the maximum allowed range', () => {
    expect(chunkRange('2026-11-01', '2026-11-14')).toEqual([
      ['2026-11-01', '2026-11-14'],
    ]);
  });

  it('splits a month into contiguous windows of at most 14 days', () => {
    const windows = chunkRange('2026-11-01', '2026-11-30');
    expect(windows).toEqual([
      ['2026-11-01', '2026-11-14'],
      ['2026-11-15', '2026-11-28'],
      ['2026-11-29', '2026-11-30'],
    ]);
    for (const [from, to] of windows) {
      expect(daysBetween(from, to)).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    }
    // Contiguous, no gaps or overlaps beyond the shared boundary day.
    expect(windows[1]![0]).toBe(nextDay(windows[0]![1]));
  });

  it('covers a 42-day sync range with no day lost', () => {
    const windows = chunkRange('2026-10-25', '2026-12-05');
    expect(windows[0]![0]).toBe('2026-10-25');
    expect(windows[windows.length - 1]![1]).toBe('2026-12-05');
    let covered = 0;
    for (const [from, to] of windows) {
      covered += daysBetween(from, to) + 1;
    }
    expect(covered).toBe(daysBetween('2026-10-25', '2026-12-05') + 1);
  });

  it('rejects malformed dates', () => {
    expect(() => chunkRange('2026-11-7', '2026-11-30')).toThrow();
    expect(() => chunkRange('2026-11-01', 'not-a-date')).toThrow();
  });
});

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00Z`) - Date.parse(`${a}T00:00Z`)) / 86_400_000,
  );
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe('easistentLogin', () => {
  it('sends the documented login shape and extracts token + child id', async () => {
    const request = vi.fn<(RequestFn)>().mockResolvedValue(loginResponse());

    const session = await easistentLogin(
      { username: 'user', password: 'secret' },
      request,
    );

    expect(session).toEqual({ token: 'test-jwt-token', childId: '1234567' });
    expect(request).toHaveBeenCalledTimes(1);
    const [method, url, options] = request.mock.calls[0]!;
    expect(method).toBe('POST');
    expect(url).toBe('https://www.easistent.com/m/login');
    expect(options.headers).toMatchObject({
      'x-client-platform': 'web',
      'x-client-version': '13',
    });
    expect(options.body).toEqual({
      username: 'user',
      password: 'secret',
      supported_user_types: ['parent', 'child', 'parent_of_pre_enrolled'],
    });
  });

  it('throws a parse error when the token is missing', async () => {
    const request = vi.fn<(RequestFn)>().mockResolvedValue({ user: { id: 1 } });
    await expect(
      easistentLogin({ username: 'u', password: 'p' }, request),
    ).rejects.toThrow(EasistentError);
  });
});

describe('fetchTimetableRange', () => {
  it('chunks long ranges, sends the child-id header and dedupes overlaps', async () => {
    const lesson = lessonBlock();
    const request = vi.fn<(RequestFn)>().mockImplementation(
      async (_method, url) => {
        // Both windows return the same lesson (overlap at the boundary).
        expect(url).toMatch(/^https:\/\/www\.easistent\.com\/m\/timetable\/events\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
        return timetableChunkResponse([lesson]);
      },
    );

    const events = await fetchTimetableRange(
      { token: 'tok', childId: '42' },
      '2026-11-01',
      '2026-11-20',
      request,
    );

    expect(request).toHaveBeenCalledTimes(2);
    const [, firstUrl] = request.mock.calls[0]!;
    expect(firstUrl).toContain('from=2026-11-01');
    expect(firstUrl).toContain('to=2026-11-14');
    const headers = request.mock.calls[0]![2].headers;
    expect(headers).toMatchObject({
      authorization: 'Bearer tok',
      'x-child-id': '42',
    });
    expect(events).toHaveLength(1);
  });
});

describe('createEasistentClient', () => {
  it('re-logs in on every fetch (24 h token expiry)', async () => {
    const request = vi.fn<(RequestFn)>().mockImplementation(async (_method, url) =>
      url.endsWith('/login')
        ? loginResponse()
        : timetableChunkResponse([lessonBlock()]),
    );
    const client = createEasistentClient(
      { username: 'u', password: 'p' },
      request,
    );

    await client.fetchTimetable('2026-11-01', '2026-11-01');
    await client.fetchTimetable('2026-11-02', '2026-11-02');

    const logins = request.mock.calls.filter(([, url]) =>
      url.endsWith('/login'),
    );
    expect(logins).toHaveLength(2);
  });
});
