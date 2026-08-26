import type { Page } from '@playwright/test';

import type { SupabaseE2ESeeder } from './supabaseAdmin.ts';

interface SignInParams {
  email: string;
  seeder: SupabaseE2ESeeder;
  redirectPath?: string;
}

export async function signInUser(page: Page, params: SignInParams) {
  const redirectPath = params.redirectPath ?? '/auth';
  const { emailOtp } = await params.seeder.generateMagicLink(params.email, redirectPath);
  await page.goto(redirectPath);
  await page.evaluate(
    async ({ email, token, modulePath }: { email: string; token: string; modulePath: string }) => {
      // Import Supabase client straight from the Vite dev server module graph.
      const { supabase } = await import(/* @vite-ignore */ modulePath);
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' });
      if (error) {
        throw new Error(error.message);
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(sessionError.message);
      }
      if (!data.session) {
        throw new Error('Supabase did not create a session after verifyOtp.');
      }
    },
    {
      email: params.email,
      token: emailOtp,
      modulePath: '/src/integrations/supabase/client.ts',
    },
  );
}
