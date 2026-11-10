/**
 * Guard for dynamic imports against stale-chunk failures.
 *
 * After an app update the WebView can briefly run old markup against new
 * assets (or a stale service worker serves a cached index.html): every
 * dynamic `import()` then rejects with "Failed to fetch dynamically imported
 * module" because the hashed chunk no longer exists on the server. That is
 * always a transient, self-inflicted state — one page reload fixes it.
 *
 * `safeDynamicImport` detects that failure shape, schedules exactly ONE
 * recovery reload per session (flagged in sessionStorage so it can never
 * loop), and rethrows as `StaleChunkError` so UI code can show a translated
 * "app updated, try again" message instead of the raw browser error.
 */

/** Raised when a dynamic import failed because the chunk no longer exists. */
export class StaleChunkError extends Error {
  constructor() {
    super('App assets changed on disk — a page reload is required.');
    this.name = 'StaleChunkError';
  }
}

const RELOAD_FLAG = 'autoplaner.staleChunkReloaded';

let reloadScheduled = false;

function looksLikeModuleFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    /failed to fetch dynamically imported module/i.test(error.message) ||
    /importing a module script failed/i.test(error.message) ||
    /error loading dynamically imported module/i.test(error.message)
  );
}

/**
 * Reload at most once per session (sessionStorage survives the reload, is
 * wiped when the app process/session ends). If storage is unavailable we
 * assume a reload already happened — never risk a reload loop.
 */
function scheduleRecoveryReload(): void {
  if (reloadScheduled) {
    return;
  }
  let alreadyReloaded: boolean;
  try {
    alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
    if (!alreadyReloaded) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
    }
  } catch {
    alreadyReloaded = true;
  }
  if (alreadyReloaded) {
    return;
  }
  reloadScheduled = true;
  // Small delay so the caller can render the friendly message first.
  globalThis.setTimeout(() => {
    try {
      globalThis.location.reload();
    } catch {
      // No location in this context — nothing more we can do.
    }
  }, 400);
}

/** Run a dynamic import, recovering from stale-chunk failures via one reload. */
export async function safeDynamicImport<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (looksLikeModuleFetchFailure(error)) {
      scheduleRecoveryReload();
      throw new StaleChunkError();
    }
    throw error;
  }
}
