import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';

import { consumeTokenRefreshedSkip, refreshSessionSafely } from '@/lib/auth/refreshSessionSafely';

import {
  AuthContext,
  MembershipRole,
  MembershipStatus,
  MembershipSummary,
  PlatformRole,
  Profile,
  UserPreferencesState,
} from './AuthContextBase';
import {
  EdgeFunctionErrorPayload,
  EdgeMetadataCarrier,
  mergeMetadataPayload,
  normalizeEdgeFunctionError,
  readSessionClaims,
} from '@/lib/auth/edge';

const PLATFORM_ADMIN_ROLES: PlatformRole[] = ['super_admin', 'platform_owner'];
const EDGE_FUNCTION_SOURCE = 'auth-context';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type RawMembershipRow = {
  membership_id: number | string;
  academy_id: number | string;
  academy_name?: string | null;
  role: string | null;
  status: string | null;
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
};

type RawPreferencesRow = {
  full_name: string | null;
  target_exam_id: number | null;
  target_level_id: number | null;
  active_academy_id: number | null;
  is_initial_setup_completed: boolean | null;
  updated_at: string | null;
};

type FinalizeSignupResponse = EdgeMetadataCarrier & {
  memberships: unknown;
  memberships_inactive: unknown;
  memberships_claimed: unknown;
  auto_selected_academy_id: number | null;
  is_platform_admin: boolean;
  request_id: string | null;
};

type MembershipListResponse = {
  active_academies: RawMembershipRow[];
  inactive_academies: RawMembershipRow[];
};

type SetActiveAcademyResponse = EdgeMetadataCarrier & {
  membership: {
    id: number;
    academy_id: number;
    role: string;
    status: string;
  };
  request_id: string;
};

const isMembershipRole = (role: unknown): role is MembershipRole =>
  role === 'student' || role === 'teacher' || role === 'academy_admin';

const isMembershipStatus = (status: unknown): status is MembershipStatus =>
  status === 'awaiting_login' || status === 'active' || status === 'inactive';

const isPlatformRole = (role: unknown): role is PlatformRole =>
  role === 'super_admin' || role === 'platform_owner' || isMembershipRole(role);

const toPlatformRole = (value: unknown): PlatformRole | null =>
  isPlatformRole(value) ? value : null;

const isEdgeErrorPayload = (value: unknown): value is EdgeFunctionErrorPayload =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'message' in value &&
    'code' in value &&
    'requestId' in value,
  );

const toSafeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fallbackAcademyName = (academyId: number | string) => `Academy #${academyId}`;

const resolveAcademyName = (
  row: RawMembershipRow,
  academyId: number,
  fallbackName?: string,
): string => {
  if (typeof row.academy_name === 'string' && row.academy_name.trim().length > 0) {
    return row.academy_name;
  }
  if (typeof fallbackName === 'string' && fallbackName.trim().length > 0) {
    return fallbackName;
  }
  return fallbackAcademyName(academyId);
};

const mapMembershipRow = (
  row: RawMembershipRow,
  fallbackNames?: Map<number, string>,
): MembershipSummary | null => {
  const academyId = toSafeNumber(row.academy_id);
  const membershipId = toSafeNumber(row.membership_id);

  if (!Number.isFinite(academyId) || !Number.isFinite(membershipId)) {
    console.warn('[AuthContext] Skipping membership with invalid identifiers');
    return null;
  }

  if (!isMembershipRole(row.role)) {
    console.warn('[AuthContext] Skipping membership with unsupported role');
    return null;
  }

  if (!isMembershipStatus(row.status)) {
    console.warn('[AuthContext] Skipping membership with unsupported status');
    return null;
  }

  const fallbackName = fallbackNames?.get(academyId);

  return {
    membershipId,
    academyId,
    academyName: resolveAcademyName(row, academyId, fallbackName),
    role: row.role,
    status: row.status,
    subscriptionStartDate: row.subscription_start_date ?? null,
    subscriptionEndDate: row.subscription_end_date ?? null,
  };
};

const normalizePreferences = (
  row: RawPreferencesRow | null,
): UserPreferencesState | null => {
  if (!row) {
    return null;
  }
  return {
    fullName: row.full_name ?? null,
    targetExamId: row.target_exam_id ?? null,
    targetLevelId: row.target_level_id ?? null,
    activeAcademyId: row.active_academy_id ?? null,
    isInitialSetupCompleted: Boolean(row.is_initial_setup_completed),
    updatedAt: row.updated_at ?? null,
  };
};

const normalizePreferencesFromSession = (
  currentSession: Session | null,
): UserPreferencesState | null => {
  if (!currentSession?.user) {
    return null;
  }
  const metadata = isPlainRecord(currentSession.user.user_metadata)
    ? currentSession.user.user_metadata
    : {};
  const fullNameRaw = metadata.full_name;
  const fullName =
    typeof fullNameRaw === 'string' && fullNameRaw.trim().length > 0
      ? fullNameRaw.trim()
      : null;

  return {
    fullName,
    targetExamId: toSafeNumber(metadata.target_exam_id),
    targetLevelId: toSafeNumber(metadata.target_level_id),
    activeAcademyId: toSafeNumber(metadata.active_academy_id),
    isInitialSetupCompleted: Boolean(metadata.is_initial_setup_completed),
    updatedAt: null,
  };
};

const computeProfileCompletion = (
  isPlatformAdmin: boolean,
  membershipRole: MembershipRole | null,
  preferences: UserPreferencesState | null,
) => {
  if (isPlatformAdmin) {
    return { complete: true, needsName: false };
  }

  const hasName = Boolean(preferences?.fullName);
  const hasStudentTargets =
    membershipRole !== 'student' ||
    (preferences?.targetExamId != null && preferences?.targetLevelId != null);

  const complete = Boolean(
    hasName &&
    hasStudentTargets &&
    preferences?.isInitialSetupCompleted,
  );

  return { complete, needsName: !hasName };
};

const normalizeMembershipList = (
  payload: unknown,
  previousMemberships: MembershipSummary[] = [],
): MembershipSummary[] => {
  if (!Array.isArray(payload)) {
    return [];
  }
  const fallbackNames = new Map<number, string>(
    previousMemberships.map((membership) => [membership.academyId, membership.academyName]),
  );
  return payload
    .map((entry) => (entry && typeof entry === 'object' ? mapMembershipRow(entry as RawMembershipRow, fallbackNames) : null))
    .filter((entry): entry is MembershipSummary => entry !== null);
};

const buildErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  if (isEdgeErrorPayload(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred while loading user data.';
};

const buildSessionSignature = (currentSession: Session | null): string => {
  if (!currentSession) {
    return 'anonymous';
  }

  const userId = currentSession.user?.id ?? 'unknown';
  const updatedAt = typeof currentSession.user?.updated_at === 'string' ? currentSession.user.updated_at : 'unknown';
  const expiresAt = typeof currentSession.expires_at === 'number' ? String(currentSession.expires_at) : 'unknown';
  const accessToken = currentSession.access_token ?? '';
  const refreshToken = currentSession.refresh_token ?? '';

  return [userId, updatedAt, expiresAt, accessToken, refreshToken].join('|');
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [activeAcademyId, setActiveAcademyId] = useState<number | null>(null);
  const [activeMembershipId, setActiveMembershipId] = useState<number | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferencesState | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [membershipsInactive, setMembershipsInactive] = useState<MembershipSummary[]>([]);
  const [isInitialSetupCompleted, setIsInitialSetupCompleted] = useState(false);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [finalizeStatus, setFinalizeStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [lastFinalizeError, setLastFinalizeError] = useState<EdgeFunctionErrorPayload | null>(null);
  const [lastFinalizeRequestId, setLastFinalizeRequestId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [isNameRequired, setIsNameRequired] = useState(false);

  const userIdRef = useRef<string | null>(null);
  const sessionSignatureRef = useRef<string>(buildSessionSignature(null));
  const isProcessingAuthRef = useRef(false);
  const membershipsRef = useRef<MembershipSummary[]>([]);
  const membershipsInactiveRef = useRef<MembershipSummary[]>([]);

  const REFRESH_SESSION_TIMEOUT_MS = 10_000;

  const resetStateForNewUser = useCallback(() => {
    setProfile(null);
    setRole(null);
    setPlatformRole(null);
    setIsPlatformAdmin(false);
    setActiveAcademyId(null);
    setActiveMembershipId(null);
    setUserPreferences(null);
    setMemberships([]);
    setMembershipsInactive([]);
    setIsInitialSetupCompleted(false);
    setIsProfileComplete(null);
    setIsNameRequired(false);
    setFinalizeStatus('idle');
    setLastFinalizeError(null);
    setLastFinalizeRequestId(null);
  }, []);

  useEffect(() => {
    membershipsRef.current = memberships;
    membershipsInactiveRef.current = membershipsInactive;
  }, [memberships, membershipsInactive]);

  useEffect(() => {
    sessionSignatureRef.current = buildSessionSignature(session);
  }, [session]);

  const callFinalizeSignup = useCallback(async (): Promise<FinalizeSignupResponse> => {
    const { data, error: fnError } = await supabase.functions.invoke<FinalizeSignupResponse>(
      'auth-finalize-signup',
      { body: { source: EDGE_FUNCTION_SOURCE } },
    );

    if (fnError || !data) {
      const payload = normalizeEdgeFunctionError(fnError ?? null);
      throw payload;
    }

    return data;
  }, []);

  const processAuthState = useCallback(
    async (
      currentSession: Session | null,
      options?: { reason?: string; force?: boolean; silent?: boolean },
    ) => {
      if (isProcessingAuthRef.current && !options?.force) {
        return;
      }

      if (!currentSession || !currentSession.user) {
        resetStateForNewUser();
        if (!options?.silent) {
          setIsLoading(false);
          setIsProcessingAuth(false);
          setFinalizeStatus('idle');
        }
        return;
      }

      isProcessingAuthRef.current = true;
      if (!options?.silent) {
        setIsProcessingAuth(true);
        setIsLoading(true);
        setError(null);
        setFinalizeStatus('running');
        setLastFinalizeError(null);
        setLastFinalizeRequestId(null);
      }

      try {
        const finalizeResult = await callFinalizeSignup();
        if (!options?.silent) {
          setLastFinalizeRequestId(finalizeResult.request_id ?? null);
        }

        const mergedSession = mergeMetadataPayload(currentSession, finalizeResult.metadata_payload);
        setSession(mergedSession);
        setUser(mergedSession?.user ?? null);

        const userId = mergedSession?.user.id;
        userIdRef.current = userId ?? null;

        if (!userId) {
          throw new Error('Missing authenticated user id.');
        }

        const normalizedPreferences = normalizePreferencesFromSession(mergedSession);
        const activeMemberships = normalizeMembershipList(finalizeResult.memberships, membershipsRef.current);
        const inactiveMemberships = normalizeMembershipList(finalizeResult.memberships_inactive, membershipsInactiveRef.current);

        const claims = readSessionClaims(mergedSession);
        const hasMultipleActiveAcademies = activeMemberships.length > 1;

        let resolvedActiveAcademyId =
          normalizedPreferences?.activeAcademyId ??
          finalizeResult.auto_selected_academy_id ??
          claims.activeAcademyId ??
          null;

        let resolvedMembership = resolvedActiveAcademyId
          ? activeMemberships.find((membership) => membership.academyId === resolvedActiveAcademyId) ?? null
          : null;

        if (!resolvedMembership && activeMemberships.length === 1) {
          resolvedMembership = activeMemberships[0];
          resolvedActiveAcademyId = activeMemberships[0].academyId;
        } else if (!resolvedMembership && hasMultipleActiveAcademies) {
          resolvedActiveAcademyId = null;
        }

        let resolvedRole = resolvedMembership?.role ?? null;
        if (!resolvedRole && activeMemberships.length > 0) {
          const distinctRoles = new Set(activeMemberships.map((membership) => membership.role));
          if (distinctRoles.size === 1) {
            resolvedRole = activeMemberships[0].role;
          }
        }
        const platformRoleCandidate =
          toPlatformRole(claims.platformRole) ??
          toPlatformRole(claims.activeRole) ??
          resolvedRole ??
          null;

        const isPlatformAdminFlag = Boolean(
          finalizeResult.is_platform_admin ||
            (platformRoleCandidate && PLATFORM_ADMIN_ROLES.includes(platformRoleCandidate)),
        );

        const completion = computeProfileCompletion(
          isPlatformAdminFlag,
          resolvedRole,
          normalizedPreferences,
        );

        setProfile((current) => {
          if (current) {
            return {
              ...current,
              academy_id: resolvedActiveAcademyId,
              full_name: normalizedPreferences?.fullName ?? current.full_name,
              role: platformRoleCandidate ?? current.role,
            };
          }
          const now = new Date().toISOString();
          return {
            id: userId,
            email: mergedSession?.user.email ?? '',
            full_name: normalizedPreferences?.fullName ?? null,
            role: platformRoleCandidate,
            academy_id: resolvedActiveAcademyId,
            created_at: now,
            updated_at: now,
          };
        });
        setRole(resolvedRole);
        setPlatformRole(platformRoleCandidate ?? null);
        setIsPlatformAdmin(isPlatformAdminFlag);
        setActiveAcademyId(resolvedActiveAcademyId ?? null);
        setActiveMembershipId(resolvedMembership?.membershipId ?? null);
        setMemberships(activeMemberships);
        setMembershipsInactive(inactiveMemberships);
        setUserPreferences(normalizedPreferences);
        setIsInitialSetupCompleted(Boolean(normalizedPreferences?.isInitialSetupCompleted));
        setIsProfileComplete(completion.complete);
        setIsNameRequired(completion.needsName);
        if (!options?.silent) {
          setError(null);
          setFinalizeStatus('success');
        }

        if (finalizeResult.should_refresh_session) {
          void refreshSessionSafely({ timeoutMs: REFRESH_SESSION_TIMEOUT_MS, context: 'AuthContext/finalize' });
        }

        void Promise.allSettled([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle<Profile>()
            .then((result) => {
              if (!result.error && result.data) {
                setProfile((current) => ({
                  ...result.data,
                  academy_id: current?.academy_id ?? result.data.academy_id,
                  full_name: current?.full_name ?? result.data.full_name,
                  role: current?.role ?? result.data.role,
                }));
              }
            }),
          supabase
            .from('user_preferences')
            .select(
              'full_name, target_exam_id, target_level_id, active_academy_id, is_initial_setup_completed, updated_at',
            )
            .eq('user_id', userId)
            .maybeSingle<RawPreferencesRow>()
            .then((result) => {
              if (!result.error) {
                const refreshedPreferences = normalizePreferences(result.data ?? null);
                if (refreshedPreferences) {
                  setUserPreferences(refreshedPreferences);
                  setIsInitialSetupCompleted(Boolean(refreshedPreferences.isInitialSetupCompleted));
                  const refreshedCompletion = computeProfileCompletion(
                    isPlatformAdminFlag,
                    resolvedRole,
                    refreshedPreferences,
                  );
                  setIsProfileComplete(refreshedCompletion.complete);
                  setIsNameRequired(refreshedCompletion.needsName);
                }
              }
            }),
          supabase
            .rpc('list_user_academies')
            .single<MembershipListResponse>()
            .then((result) => {
              if (!result.error) {
                const namedActive = normalizeMembershipList(result.data?.active_academies ?? [], membershipsRef.current);
                const namedInactive = normalizeMembershipList(result.data?.inactive_academies ?? [], membershipsInactiveRef.current);
                if (namedActive.length > 0) {
                  setMemberships(namedActive);
                }
                setMembershipsInactive(namedInactive);
              }
            }),
        ]);
      } catch (processingError) {
        console.error('[AuthContext] processAuthState error:');
        if (!options?.silent) {
          setFinalizeStatus('error');
          const payload = isEdgeErrorPayload(processingError) ? processingError : null;
          setLastFinalizeError(payload);
          setLastFinalizeRequestId(payload?.requestId ?? null);
          setError(payload ? payload.message : buildErrorMessage(processingError));
          setIsProfileComplete(false);
        }
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
          setIsProcessingAuth(false);
        }
        isProcessingAuthRef.current = false;
      }
    },
    [callFinalizeSignup, resetStateForNewUser],
  );

  const refreshUserProfile = useCallback(async () => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return;
    }

    const [profileResult, preferencesResult, academiesResult] = await Promise.allSettled([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle<Profile>(),
      supabase
        .from('user_preferences')
        .select(
          'full_name, target_exam_id, target_level_id, active_academy_id, is_initial_setup_completed, updated_at',
        )
        .eq('user_id', userId)
        .maybeSingle<RawPreferencesRow>(),
      supabase.rpc('list_user_academies').single<MembershipListResponse>(),
    ]);

    if (profileResult.status === 'fulfilled') {
      const result = profileResult.value;
      if (!result.error && result.data) {
        setProfile((current) => ({
          ...result.data,
          academy_id: current?.academy_id ?? result.data.academy_id,
          full_name: current?.full_name ?? result.data.full_name,
          role: current?.role ?? result.data.role,
        }));
      }
    }

    if (preferencesResult.status === 'fulfilled') {
      const result = preferencesResult.value;
      if (!result.error) {
        const refreshedPreferences = normalizePreferences(result.data ?? null);
        if (refreshedPreferences) {
          setUserPreferences(refreshedPreferences);
          setIsInitialSetupCompleted(Boolean(refreshedPreferences.isInitialSetupCompleted));
          const completion = computeProfileCompletion(isPlatformAdmin, role, refreshedPreferences);
          setIsProfileComplete(completion.complete);
          setIsNameRequired(completion.needsName);
        }
      }
    }

    if (academiesResult.status === 'fulfilled') {
      const result = academiesResult.value;
      if (!result.error) {
        const namedActive = normalizeMembershipList(result.data?.active_academies ?? [], membershipsRef.current);
        const namedInactive = normalizeMembershipList(result.data?.inactive_academies ?? [], membershipsInactiveRef.current);
        if (namedActive.length > 0) {
          setMemberships(namedActive);
        }
        setMembershipsInactive(namedInactive);
      }
    }
  }, [isPlatformAdmin, role, session?.user?.id]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        userIdRef.current = initialSession?.user?.id ?? null;
        if (initialSession?.user) {
          await processAuthState(initialSession, { reason: 'initial', force: true });
        } else {
          resetStateForNewUser();
          setIsLoading(false);
        }
      })
      .catch((initialError) => {
        console.error('[AuthContext] useEffect: Error getting initial session:');
        setError('Failed to initialize session.');
        setIsLoading(false);
      });

    const { data: subscriptionWrapper } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        const nextUser = nextSession?.user ?? null;
        const previousUserId = userIdRef.current;
        const nextUserId = nextUser?.id ?? null;

        setSession(nextSession);
        setUser(nextUser);
        userIdRef.current = nextUserId;

        if (event === 'SIGNED_OUT' || !nextUser) {
          resetStateForNewUser();
          setIsLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED' && consumeTokenRefreshedSkip()) {
          if (import.meta.env.DEV) {
            console.warn('[AuthContext] Skipping TOKEN_REFRESHED processing after manual refreshSession to prevent loops.');
          }
          return;
        }

        const shouldProcess =
          !previousUserId ||
          previousUserId !== nextUserId ||
          event === 'USER_UPDATED' ||
          event === 'TOKEN_REFRESHED';

        if (shouldProcess && nextSession) {
          void processAuthState(nextSession, { reason: event, silent: event === 'TOKEN_REFRESHED' });
        }
      },
    );

    return () => {
      subscriptionWrapper.subscription.unsubscribe();
    };
  }, [processAuthState, resetStateForNewUser]);

  useEffect(() => {
    const syncSessionFromStorage = async () => {
      try {
        const { data: { session: nextSession } } = await supabase.auth.getSession();
        const nextUser = nextSession?.user ?? null;
        const previousUserId = userIdRef.current;
        const nextUserId = nextUser?.id ?? null;
        const previousSignature = sessionSignatureRef.current;
        const nextSignature = buildSessionSignature(nextSession);
        const userUnchanged = previousUserId === nextUserId;

        if (userUnchanged && previousSignature === nextSignature) {
          return;
        }

        sessionSignatureRef.current = nextSignature;
        setSession(nextSession);
        setUser(nextUser);
        userIdRef.current = nextUserId;

        if (!nextUser || !nextSession) {
          resetStateForNewUser();
          setIsLoading(false);
          setIsProcessingAuth(false);
          setFinalizeStatus('idle');
          return;
        }

        await processAuthState(nextSession, {
          reason: 'focus-sync',
          force: true,
          silent: userUnchanged,
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[AuthContext] Failed to sync session on focus');
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void syncSessionFromStorage();
    };

    window.addEventListener('focus', syncSessionFromStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncSessionFromStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [processAuthState, resetStateForNewUser]);

  const logout = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return { error: new Error(signOutError.message) };
    }
    setSession(null);
    setUser(null);
    resetStateForNewUser();
    userIdRef.current = null;
    isProcessingAuthRef.current = false;
    setIsProcessingAuth(false);
    return { error: null };
  }, [resetStateForNewUser]);

  const updateProfileCompletionStatus = useCallback((status: boolean) => {
    setIsProfileComplete(status);
    setIsInitialSetupCompleted(status);
  }, []);

  const retryFinalize = useCallback(async () => {
    if (!session) {
      return;
    }
    await processAuthState(session, { reason: 'manual-retry', force: true });
  }, [processAuthState, session]);

  const selectActiveAcademy = useCallback(
    async (academyId: number) => {
      if (!session?.user) {
        return { error: normalizeEdgeFunctionError({ message: 'No active session available.' }) };
      }
      try {
        const { data, error: fnError } = await supabase.functions.invoke<SetActiveAcademyResponse>('user-set-active-academy', {
          body: { academy_id: academyId, source: EDGE_FUNCTION_SOURCE },
        });

        if (fnError || !data) {
          return { error: normalizeEdgeFunctionError(fnError ?? null) };
        }

        const mergedSession = mergeMetadataPayload(session, data.metadata_payload);
        setSession(mergedSession);
        setUser(mergedSession?.user ?? null);

        const selectedAcademyId = data.membership?.academy_id ?? null;
        const selectedMembershipId = data.membership?.id ?? null;
        const selectedRole = isMembershipRole(data.membership?.role) ? data.membership.role : null;

        if (selectedAcademyId != null) {
          setActiveAcademyId(selectedAcademyId);
        }
        if (selectedMembershipId != null) {
          setActiveMembershipId(selectedMembershipId);
        }
        if (selectedRole) {
          setRole(selectedRole);
        }

        const preferencesFromSession = normalizePreferencesFromSession(mergedSession);
        if (preferencesFromSession) {
          setUserPreferences(preferencesFromSession);
          setIsInitialSetupCompleted(Boolean(preferencesFromSession.isInitialSetupCompleted));
          const completion = computeProfileCompletion(isPlatformAdmin, selectedRole ?? role, preferencesFromSession);
          setIsProfileComplete(completion.complete);
          setIsNameRequired(completion.needsName);
        }

        if (data.should_refresh_session) {
          void refreshSessionSafely({ timeoutMs: REFRESH_SESSION_TIMEOUT_MS, context: 'AuthContext/selectActiveAcademy' });
        }

        void refreshUserProfile();
        return { error: null };
      } catch (unknownError) {
        return { error: normalizeEdgeFunctionError(unknownError) };
      }
    },
    [isPlatformAdmin, refreshUserProfile, role, session],
  );

  const value = {
    session,
    user,
    profile,
    role,
    platformRole,
    isPlatformAdmin,
    activeAcademyId,
    activeMembershipId,
    userPreferences,
    memberships,
    membershipsInactive,
    isInitialSetupCompleted,
    isProcessingAuth,
    finalizeStatus,
    lastFinalizeError,
    lastFinalizeRequestId,
    isLoading,
    error,
    isProfileComplete,
    isNameRequired,
    logout,
    updateProfileCompletionStatus,
    refreshUserProfile,
    retryFinalize,
    selectActiveAcademy,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
