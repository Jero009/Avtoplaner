import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, backgroundSyncEnabled, isStale } from './background';

describe('isStale (app-open auto-sync)', () => {
  const now = new Date('2026-11-08T12:00:00Z');

  it('is stale when never synced', () => {
    expect(isStale(null, now)).toBe(true);
  });

  it('is stale on an unparsable timestamp', () => {
    expect(isStale('not-a-date', now)).toBe(true);
  });

  it('is fresh within ~6 hours', () => {
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS + 60_000).toISOString(), now)).toBe(
      false,
    );
  });

  it('is stale after ~6 hours', () => {
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS - 1).toISOString(), now)).toBe(true);
  });
});

describe('backgroundSyncEnabled (opt-out toggle)', () => {
  it('defaults to ON when credentials exist, OFF otherwise', () => {
    expect(backgroundSyncEnabled(null, true)).toBe(true);
    expect(backgroundSyncEnabled(null, false)).toBe(false);
  });

  it('honors explicit opt-in and opt-out', () => {
    expect(backgroundSyncEnabled('1', false)).toBe(true);
    expect(backgroundSyncEnabled('0', true)).toBe(false);
  });
});
