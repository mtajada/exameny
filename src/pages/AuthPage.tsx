import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';

import { useAuth } from '@/contexts/useAuth';
import { isTrustedSupabaseAuthUrl, supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthGateLoadingCard } from '@/components/auth/AuthGateLoadingCard';
import { AuthCard } from '@/components/auth/AuthCard';
import type { MembershipRole, MembershipSummary, UserPreferencesState } from '@/contexts/AuthContextBase';
import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge';
import { WaitingScreen } from '@/components/auth/onboarding/WaitingScreen';
import { AcademySelector } from '@/components/auth/onboarding/AcademySelector';
import { determineOnboardingScenario } from '@/components/auth/onboarding/state';
import { mapFinalizeErrorToCopy } from '@/lib/auth/errorCopy';
import { resolveAuthMethodFlags, type AuthMethodFlags } from '@/lib/auth/authFlags';
import { trackProductEvent } from '@/lib/analytics';
import { resolvePostAuthPath } from '@/lib/auth/redirect';

const AUTH_REDIRECT_PATH = '/auth';
const MAGIC_LINK_COOLDOWN_MS = 60_000;
const OAUTH_REDIRECT_TIMEOUT_MS = 8_000;

type OAuthProvider = 'google' | 'azure';

const oauthConfigs: Array<{
  provider: OAuthProvider;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
    {
      provider: 'google',
      label: 'Google',
      description: 'Workspace & Gmail',
      icon: <GoogleIcon />,
    },
    {
      provider: 'azure',
      label: 'Microsoft',
      description: 'Microsoft 365',
      icon: <MicrosoftIcon />,
    },
  ];

const isOAuthProviderEnabled = (provider: OAuthProvider, flags: AuthMethodFlags): boolean => {
  if (provider === 'google') {
    return flags.google;
  }
  return flags.microsoft;
};

export default function AuthPage() {
  const location = useLocation();
  const {
    user,
    logout,
    finalizeStatus,
    lastFinalizeError,
    lastFinalizeRequestId,
    isProcessingAuth,
    retryFinalize,
    memberships,
    membershipsInactive,
    activeAcademyId,
    userPreferences,
    role,
    isProfileComplete,
    isNameRequired,
    isPlatformAdmin,
    selectActiveAcademy,
    refreshUserProfile,
  } = useAuth();
  const authFlags = useMemo(() => resolveAuthMethodFlags(), []);
  const enabledOAuthConfigs = useMemo(
    () => oauthConfigs.filter((config) => isOAuthProviderEnabled(config.provider, authFlags)),
    [authFlags],
  );
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const oauthAttemptInFlight = useRef(false);
  const oauthFallbackTimerRef = useRef<number | null>(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkStatus, setMagicLinkStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const postAuthPath = useMemo(() => resolvePostAuthPath(location.state), [location.state]);

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return `${window.location.origin}${AUTH_REDIRECT_PATH}`;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (!error && !errorDescription) {
      return;
    }

    const decodedDescription = (() => {
      if (!errorDescription) {
        return null;
      }
      try {
        return decodeURIComponent(errorDescription);
      } catch {
        return errorDescription;
      }
    })();

    toast({
      title: 'Sign in was not completed',
      description: decodedDescription ?? error ?? 'The sign-in request was cancelled or failed. Please try again.',
      variant: 'destructive',
    });

    trackProductEvent('auth_error', {
      type: 'oauth_callback',
    });

    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  useEffect(() => {
    if (!magicLinkCooldownUntil) {
      return;
    }

    const remaining = magicLinkCooldownUntil - Date.now();
    if (remaining <= 0) {
      setMagicLinkCooldownUntil(null);
      setMagicLinkStatus('idle');
      return;
    }

    const timer = setTimeout(() => {
      setMagicLinkCooldownUntil(null);
      setMagicLinkStatus('idle');
    }, remaining);

    return () => clearTimeout(timer);
  }, [magicLinkCooldownUntil]);

  const startMagicLinkCooldown = useCallback(() => {
    setMagicLinkCooldownUntil(Date.now() + MAGIC_LINK_COOLDOWN_MS);
  }, []);

  const clearOAuthFallbackTimer = useCallback(() => {
    if (oauthFallbackTimerRef.current !== null) {
      window.clearTimeout(oauthFallbackTimerRef.current);
      oauthFallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearOAuthFallbackTimer();
  }, [clearOAuthFallbackTimer]);

  useEffect(() => {
    const handleReturnFromOAuth = async () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (user) {
        return;
      }
      if (!oauthAttemptInFlight.current) {
        return;
      }

      clearOAuthFallbackTimer();
      oauthAttemptInFlight.current = false;
      setOauthLoading(null);

      try {
        const { data: sessionResult } = await supabase.auth.getSession();
        if (!sessionResult.session) {
          toast({
            title: 'Sign in was not completed',
            description: 'The login window closed before finishing. Please try again.',
          });
        }
      } catch {
        toast({
          title: 'Sign in was not completed',
          description: 'Please try again.',
        });
      }
    };

    window.addEventListener('focus', handleReturnFromOAuth);
    document.addEventListener('visibilitychange', handleReturnFromOAuth);

    return () => {
      window.removeEventListener('focus', handleReturnFromOAuth);
      document.removeEventListener('visibilitychange', handleReturnFromOAuth);
    };
  }, [clearOAuthFallbackTimer, user]);

  const isMagicLinkThrottled = Boolean(magicLinkCooldownUntil);
  const showMagicLink = authFlags.magicLink;
  const showOAuth = enabledOAuthConfigs.length > 0;

  const handleOAuthSignIn = useCallback(
    async (provider: OAuthProvider) => {
      if (!isOAuthProviderEnabled(provider, authFlags)) {
        toast({
          title: 'This sign-in method is temporarily disabled.',
        });
        return;
      }
      if (oauthAttemptInFlight.current) {
        return;
      }
      clearOAuthFallbackTimer();
      oauthAttemptInFlight.current = true;
      trackProductEvent('auth_provider_clicked', { provider });
      setOauthLoading(provider);
      try {
        oauthFallbackTimerRef.current = window.setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            return;
          }
          oauthAttemptInFlight.current = false;
          setOauthLoading(null);
          toast({
            title: 'Still waiting on sign-in',
            description: 'The redirect is taking longer than expected. Please try again.',
          });
        }, OAUTH_REDIRECT_TIMEOUT_MS);

        const { data: sessionResult } = await supabase.auth.getSession();
        if (typeof window !== 'undefined' && !sessionResult.session) {
          const url = new URL(window.location.href);
          if (url.searchParams.has('code')) {
            url.searchParams.delete('code');
            window.history.replaceState(window.history.state, '', url.toString());
          }
        }

        const options = {
          ...(redirectTo ? { redirectTo } : {}),
          skipBrowserRedirect: true,
          ...(provider === 'azure' ? { scopes: 'email' } : {}),
        };
        const { data, error } = await supabase.auth.signInWithOAuth({ provider, options });
        if (error) {
          throw error;
        }
        if (data?.url && isTrustedSupabaseAuthUrl(data.url)) {
          window.location.assign(data.url);
          return;
        }
        throw new Error('The authentication service returned an invalid redirect.');
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error(`[AuthPage]  login failed.`);
        }
        trackProductEvent('auth_error', {
          type: 'oauth',
          provider,
        });
        clearOAuthFallbackTimer();
        oauthAttemptInFlight.current = false;
        setOauthLoading(null);
        toast({
          title: 'Unable to start sign in',
          description: extractErrorMessage(err),
          variant: 'destructive',
        });
      }
    },
    [authFlags, clearOAuthFallbackTimer, redirectTo],
  );

  const handleMagicLink = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!authFlags.magicLink) {
        toast({
          title: 'This sign-in method is temporarily disabled.',
        });
        return;
      }
      if (isMagicLinkThrottled) {
        toast({
          title: 'Magic Link cooldown',
          description: 'Please wait 60 seconds before requesting another Magic Link.',
          variant: 'destructive',
        });
        return;
      }

      const trimmedEmail = magicLinkEmail.trim();
      if (!trimmedEmail) {
        toast({
          title: 'Email required',
          description: 'Enter your invited email address to receive the link.',
          variant: 'destructive',
        });
        return;
      }

      const normalizedEmail = trimmedEmail.toLowerCase();
      trackProductEvent('auth_magic_link_requested');
      setMagicLinkStatus('sending');
      try {
        const options = redirectTo ? { emailRedirectTo: redirectTo } : undefined;
        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options,
        });
        if (error) {
          throw error;
        }

        setMagicLinkStatus('sent');
        toast({
          title: 'Magic Link sent',
          description: 'Check your inbox and open the link on this device.',
        });
        trackProductEvent('auth_magic_link_success');
        startMagicLinkCooldown();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[AuthPage] Magic Link request failed.');
        }
        trackProductEvent('auth_error', {
          type: 'magic_link',
        });
        setMagicLinkStatus('idle');
        toast({
          title: 'Magic Link failed',
          description: extractErrorMessage(err),
          variant: 'destructive',
        });
        startMagicLinkCooldown();
      }
    },
    [authFlags.magicLink, magicLinkEmail, redirectTo, isMagicLinkThrottled, startMagicLinkCooldown],
  );

  const handleRetryFinalize = useCallback(() => {
    void retryFinalize();
  }, [retryFinalize]);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      const { error } = await logout();
      if (error) {
        toast({
          title: 'Could not sign out',
          description: extractErrorMessage(error),
          variant: 'destructive',
        });
      }
    } finally {
      setIsSigningOut(false);
    }
  }, [logout]);

  if (user) {
    return (
      <AuthenticatedAuthView
        finalizeStatus={finalizeStatus}
        isProcessingAuth={isProcessingAuth}
        lastFinalizeError={lastFinalizeError}
        lastFinalizeRequestId={lastFinalizeRequestId}
        isPlatformAdmin={isPlatformAdmin}
        memberships={memberships}
        membershipsInactive={membershipsInactive}
        activeAcademyId={activeAcademyId}
        userPreferences={userPreferences}
        role={role}
        isProfileComplete={isProfileComplete}
        isNameRequired={isNameRequired}
        onRetryFinalize={handleRetryFinalize}
        onSelectAcademy={selectActiveAcademy}
        refreshUserProfile={refreshUserProfile}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        postAuthPath={postAuthPath}
      />
    );
  }

  return (
    <AuthShell contentWidth="lg">
      <AuthCard
        title="Sign in"
        description="Access your Exameny workspace."
        className="w-full"
      >
        {showOAuth ? (
          <div className="grid gap-4">
            {enabledOAuthConfigs.map((config) => (
              <OAuthButton
                key={config.provider}
                label={config.label}
                description={config.description}
                icon={config.icon}
                loading={oauthLoading === config.provider}
                onClick={() => handleOAuthSignIn(config.provider)}
              />
            ))}
          </div>
        ) : null}

        {showMagicLink ? (
          <>
            {showOAuth ? (
              <div className="relative flex items-center gap-4 py-2 text-xs text-muted-foreground/60">
                <span className="h-px flex-1 bg-border/40" aria-hidden="true" />
                <span className="font-medium uppercase tracking-widest text-[10px]">Or continue with</span>
                <span className="h-px flex-1 bg-border/40" aria-hidden="true" />
              </div>
            ) : null}

            <form onSubmit={handleMagicLink} className="grid gap-4">
              <div className="space-y-2 text-left">
                <Label className="text-sm font-medium" htmlFor="magic-link-email">
                  Invited email address
                </Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="magic-link-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={magicLinkEmail}
                    onChange={(event) => setMagicLinkEmail(event.target.value)}
                    className="h-11 rounded-lg border-border/40 bg-background/50 pl-10 transition-colors focus:border-primary/40 focus:bg-background"
                    placeholder="Ex: alice@example.test"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-11 w-full rounded-lg text-sm font-medium shadow-sm transition-all hover:bg-primary/90"
                disabled={magicLinkStatus === 'sending' || isMagicLinkThrottled}
              >
                {magicLinkStatus === 'sending' ? 'Sending Magic Link…' : 'Email me a Magic Link'}
              </Button>
              {magicLinkStatus === 'sent' ? (
                <p className="text-center text-xs text-emerald-600">Magic Link sent. Check your inbox.</p>
              ) : null}
              {isMagicLinkThrottled ? (
                <p className="text-center text-xs text-amber-600">Wait 60 seconds before requesting another link.</p>
              ) : null}
            </form>
          </>
        ) : null}

        <p className="rounded-lg border border-dashed border-border/40 bg-muted/30 p-4 text-center text-xs text-muted-foreground/80">
          Need access? Ask your administrator to invite you.
        </p>
      </AuthCard>
    </AuthShell >
  );
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Unexpected error.');
  }
  return 'Unexpected error. Please try again.';
}

interface OAuthButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  loading: boolean;
  onClick: () => void;
}

function OAuthButton({ icon, label, description, loading, onClick }: OAuthButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="group relative h-16 w-full justify-start gap-4 rounded-xl border-border/40 bg-background/50 px-4 transition-all hover:border-primary/20 hover:bg-background hover:shadow-sm"
      onClick={onClick}
      disabled={loading}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-105">
        {icon}
      </span>
      <span className="flex flex-col items-start gap-0.5 text-left">
        <span className="text-sm font-medium text-foreground/90 transition-colors group-hover:text-foreground">
          {loading ? 'Connecting…' : label}
        </span>
        <span className="text-xs text-muted-foreground/80">{description}</span>
      </span>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

interface AuthenticatedAuthViewProps {
  finalizeStatus: 'idle' | 'running' | 'success' | 'error';
  isProcessingAuth: boolean;
  lastFinalizeError: EdgeFunctionErrorPayload | null;
  lastFinalizeRequestId: string | null;
  isPlatformAdmin: boolean;
  memberships: MembershipSummary[];
  membershipsInactive: MembershipSummary[];
  activeAcademyId: number | null;
  userPreferences: UserPreferencesState | null;
  role: MembershipRole | null;
  isProfileComplete: boolean | null;
  isNameRequired: boolean;
  onRetryFinalize: () => Promise<void> | void;
  onSelectAcademy: (academyId: number) => Promise<{ error: EdgeFunctionErrorPayload | null }>;
  refreshUserProfile: () => Promise<void>;
  onSignOut: () => Promise<void>;
  isSigningOut: boolean;
  postAuthPath?: string | null;
}

export const AuthenticatedAuthView: React.FC<AuthenticatedAuthViewProps> = ({
  finalizeStatus,
  isProcessingAuth,
  lastFinalizeError,
  lastFinalizeRequestId,
  isPlatformAdmin,
  memberships,
  membershipsInactive,
  activeAcademyId,
  userPreferences,
  role,
  isProfileComplete,
  isNameRequired,
  onRetryFinalize,
  onSelectAcademy,
  refreshUserProfile,
  onSignOut,
  isSigningOut,
  postAuthPath = null,
}) => {
  const [selectorState, setSelectorState] = useState<{ pendingAcademyId: number | null; error: EdgeFunctionErrorPayload | null }>({
    pendingAcademyId: null,
    error: null,
  });

  const snapshot = {
    isPlatformAdmin,
    memberships,
    membershipsInactive,
    activeAcademyId,
    userPreferences,
    role,
    isProfileComplete,
    isNameRequired,
  };

  const scenario = determineOnboardingScenario(snapshot);
  const isFinalizeRunning = finalizeStatus === 'running';

  const handleSelectAcademy = async (academyId: number) => {
    setSelectorState({ pendingAcademyId: academyId, error: null });
    const result = await onSelectAcademy(academyId);
    if (result.error) {
      if (import.meta.env.DEV) {
        console.error('[AuthPage] Failed to set active academy.');
      }
      setSelectorState({
        pendingAcademyId: null,
        error: result.error,
      });
      return;
    }
    setSelectorState({ pendingAcademyId: null, error: null });
  };

  if (isProcessingAuth) {
    return <AuthGateLoadingCard />;
  }

  if (finalizeStatus === 'error') {
    const errorMessage = mapFinalizeErrorToCopy(lastFinalizeError);
    const errorCode = lastFinalizeError?.code ?? null;
    const hasErrorMetadata = Boolean(errorCode || lastFinalizeRequestId);
    return (
      <AuthShell contentWidth="lg">
        <AuthCard
          className="w-full"
          title="We couldn’t finish setup"
          description="Review the message and try again."
        >
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
            {hasErrorMetadata ? (
              <span className="mt-2 block text-xs text-red-600/80">
                {errorCode ? `Error code: ${errorCode}` : null}
                {errorCode && lastFinalizeRequestId ? ' · ' : null}
                {lastFinalizeRequestId ? `Request ID: ${lastFinalizeRequestId}` : null}
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="h-11 rounded-lg px-6 text-sm font-semibold"
              onClick={() => void onRetryFinalize()}
            >
              {isFinalizeRunning ? 'Retrying…' : 'Retry'}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-lg px-6 text-sm font-semibold"
              onClick={() => void onSignOut()}
              disabled={isSigningOut}
            >
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (scenario.kind === 'platform-admin') {
    return <Navigate to="/platform" replace />;
  }

  if (scenario.kind === 'waiting') {
    return (
      <AuthShell contentWidth="lg">
        <WaitingScreen
          variant={scenario.variant}
          membershipsInactive={scenario.membershipsInactive}
          onRetry={() => onRetryFinalize()}
          onLogout={() => onSignOut()}
          isRetrying={isFinalizeRunning}
          isLoggingOut={isSigningOut}
        />
      </AuthShell>
    );
  }

  if (scenario.kind === 'onboarding') {
    return (
      <Navigate
        to="/profile-setup"
        replace
        state={postAuthPath ? { from: postAuthPath } : undefined}
      />
    );
  }

  if (scenario.kind === 'selector') {
    return (
      <AuthShell contentWidth="lg">
        <AcademySelector
          memberships={memberships}
          activeAcademyId={activeAcademyId}
          pendingAcademyId={selectorState.pendingAcademyId}
          error={selectorState.error}
          onSelect={handleSelectAcademy}
        />
      </AuthShell>
    );
  }

  return <Navigate to={postAuthPath ?? '/dashboard'} replace />;
};
