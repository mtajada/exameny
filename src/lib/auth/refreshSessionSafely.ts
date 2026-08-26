import { supabase } from '@/integrations/supabase/client';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SKIP_EXPIRY_MS = 30_000;

let refreshInFlight: Promise<{ error: unknown }> | null = null;
let pendingTokenRefreshedSkips = 0;
let pendingTokenRefreshedSkipsExpiresAt: number | null = null;

function clearExpiredSkips(now: number) {
  if (pendingTokenRefreshedSkipsExpiresAt !== null && now > pendingTokenRefreshedSkipsExpiresAt) {
    pendingTokenRefreshedSkips = 0;
    pendingTokenRefreshedSkipsExpiresAt = null;
  }
}

export function consumeTokenRefreshedSkip(): boolean {
  const now = Date.now();
  clearExpiredSkips(now);

  if (pendingTokenRefreshedSkips <= 0) {
    return false;
  }

  pendingTokenRefreshedSkips = Math.max(0, pendingTokenRefreshedSkips - 1);
  if (pendingTokenRefreshedSkips === 0) {
    pendingTokenRefreshedSkipsExpiresAt = null;
  }
  return true;
}

export async function refreshSessionSafely(options?: { timeoutMs?: number; context?: string }): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const context = options?.context ?? 'unknown';

  let currentPromise = refreshInFlight;
  if (!currentPromise) {
    const now = Date.now();
    clearExpiredSkips(now);
    pendingTokenRefreshedSkips += 1;
    pendingTokenRefreshedSkipsExpiresAt = now + Math.max(DEFAULT_SKIP_EXPIRY_MS, timeoutMs * 2);

    currentPromise = (async () => {
      try {
        const { error } = await supabase.auth.refreshSession();
        return { error };
      } catch (error) {
        return { error };
      }
    })();

    void currentPromise.then(({ error }) => {
      if (!error) {
        return;
      }
      if (pendingTokenRefreshedSkips > 0) {
        pendingTokenRefreshedSkips = Math.max(0, pendingTokenRefreshedSkips - 1);
        if (pendingTokenRefreshedSkips === 0) {
          pendingTokenRefreshedSkipsExpiresAt = null;
        }
      }
    });

    refreshInFlight = currentPromise;
    void currentPromise.finally(() => {
      if (refreshInFlight === currentPromise) {
        refreshInFlight = null;
      }
    });
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timeoutHandle = globalThis.setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const raceResult = await Promise.race([currentPromise.then(() => 'done' as const), timeoutPromise]);
  if (timeoutHandle !== undefined) {
    globalThis.clearTimeout(timeoutHandle);
  }

  if (raceResult === 'timeout') {
    console.warn('[refreshSessionSafely] refreshSession timed out.', { timeout_ms: timeoutMs });
    void currentPromise.then(({ error }) => {
      if (error) {
        console.warn(`[refreshSessionSafely] refreshSession failed ().`);
      }
    });
    return;
  }

  const { error } = await currentPromise;
  if (error) {
    console.warn(`[refreshSessionSafely] refreshSession failed ().`);
  }
}
