import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.ts';

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_DEMO_PUBLISHABLE_KEY = 'local-public-demo-key';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || LOCAL_DEMO_PUBLISHABLE_KEY;

export function isTrustedSupabaseAuthUrl(candidate: string): boolean {
  try {
    const candidateUrl = new URL(candidate);
    const configuredUrl = new URL(SUPABASE_URL);
    return candidateUrl.origin === configuredUrl.origin &&
      candidateUrl.pathname.startsWith('/auth/v1/');
  } catch {
    return false;
  }
}

const isSafari = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const hasSafari = ua.includes('Safari');
  const isChromeFamily = ua.includes('Chrome') || ua.includes('Chromium') || ua.includes('CriOS') || ua.includes('Edg');
  const isFirefoxIOS = ua.includes('FxiOS');
  return hasSafari && !isChromeFamily && !isFirefoxIOS;
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    ...(isSafari()
      ? {
          lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => await fn(),
        }
      : {}),
  },
});
