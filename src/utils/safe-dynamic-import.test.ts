import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaleChunkError, safeDynamicImport } from './safe-dynamic-import';

type SessionStorageStub = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function installWindow(sessionStorage: SessionStorageStub): {
  reload: ReturnType<typeof vi.fn>;
  timers: ReturnType<typeof vi.useFakeTimers>;
} {
  const reload = vi.fn();
  const timers = vi.useFakeTimers();
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('sessionStorage', sessionStorage);
  return { reload, timers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('safeDynamicImport', () => {
  it('passes successful imports through untouched', async () => {
    const { reload } = installWindow({
      getItem: () => null,
      setItem: () => undefined,
    });
    const value = await safeDynamicImport(async () => 42);
    expect(value).toBe(42);
    expect(reload).not.toHaveBeenCalled();
  });

  it('rethrows non-module-fetch errors as-is', async () => {
    installWindow({ getItem: () => null, setItem: () => undefined });
    const original = new Error('boom');
    await expect(safeDynamicImport(async () => Promise.reject(original))).rejects.toBe(original);
  });

  it('converts stale-chunk failures to StaleChunkError and reloads once', async () => {
    const store = new Map<string, string>();
    const { reload } = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
    });
    const failure = () =>
      Promise.reject(
        new TypeError(
          'Failed to fetch dynamically imported module: https://localhost/assets/esm-deadbeef.js',
        ),
      );

    await expect(safeDynamicImport(failure)).rejects.toBeInstanceOf(StaleChunkError);
    expect(reload).not.toHaveBeenCalled(); // delayed so the message can render
    await vi.advanceTimersByTimeAsync(500);
    expect(reload).toHaveBeenCalledTimes(1);

    // Second failure in the same session: message, but NO second reload.
    await expect(safeDynamicImport(failure)).rejects.toBeInstanceOf(StaleChunkError);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never schedules a reload when storage says one already happened', async () => {
    const { reload } = installWindow({
      getItem: () => '1',
      setItem: () => undefined,
    });
    await expect(
      safeDynamicImport(() =>
        Promise.reject(new TypeError('Importing a module script failed.')),
      ),
    ).rejects.toBeInstanceOf(StaleChunkError);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });

  it('treats missing storage as already-reloaded (no loop risk)', async () => {
    const { reload } = installWindow({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    });
    await expect(
      safeDynamicImport(() =>
        Promise.reject(new TypeError('Error loading dynamically imported module.')),
      ),
    ).rejects.toBeInstanceOf(StaleChunkError);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });
});
