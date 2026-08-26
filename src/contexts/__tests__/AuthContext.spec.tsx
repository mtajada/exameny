import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';

import type { Profile } from '../AuthContextBase';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../useAuth';
import { useActiveAcademy } from '../useActiveAcademy';

const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'student@example.com',
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  role: 'authenticated',
  ...overrides,
});

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  access_token: 'token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'refresh-token',
  user: createMockUser(),
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type MockScenario = {
  session: Session | null;
  finalize: {
    memberships: unknown;
    memberships_inactive: unknown;
    memberships_claimed: unknown;
    auto_selected_academy_id: number | null;
    metadata_payload: Record<string, unknown> | null;
    should_refresh_session: boolean;
    is_platform_admin: boolean;
    request_id: string | null;
  };
  profile: Profile;
  preferences: {
    full_name: string | null;
    target_exam_id: number | null;
    target_level_id: number | null;
    active_academy_id: number | null;
    is_initial_setup_completed: boolean | null;
    updated_at: string | null;
  } | null;
  memberships: {
    active: Array<Record<string, unknown>>;
    inactive: Array<Record<string, unknown>>;
  };
  finalizeError?: unknown;
};

const defaultScenario: MockScenario = {
  session: createMockSession(),
  finalize: {
    memberships: [],
    memberships_inactive: [],
    memberships_claimed: [],
    auto_selected_academy_id: null,
    metadata_payload: { app_metadata: {}, user_metadata: {} },
    should_refresh_session: false,
    is_platform_admin: false,
    request_id: 'req-default',
  },
  profile: {
    academy_id: null,
    created_at: new Date().toISOString(),
    email: 'student@example.com',
    full_name: 'Test User',
    id: 'user-1',
    role: 'student',
    updated_at: new Date().toISOString(),
  },
  preferences: {
    full_name: 'Test User',
    target_exam_id: null,
    target_level_id: null,
    active_academy_id: null,
    is_initial_setup_completed: false,
    updated_at: new Date().toISOString(),
  },
  memberships: {
    active: [],
    inactive: [],
  },
  finalizeError: null,
};

const unsubscribe = vi.hoisted(() => vi.fn());
type SupabaseMock = {
  auth: {
    getSession: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  functions: {
    invoke: ReturnType<typeof vi.fn>;
  };
};

const supabaseMock = vi.hoisted<SupabaseMock>(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
    refreshSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  from: vi.fn(),
  rpc: vi.fn(),
  functions: {
    invoke: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock,
}));

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
let consoleErrorMessages: string[] = [];

const configureScenario = (scenarioOverrides: Partial<MockScenario> = {}) => {
  const scenario: MockScenario = {
    ...defaultScenario,
    ...scenarioOverrides,
  };

  const finalizeError = scenario.finalizeError ?? null;
  const activeMemberships = scenario.memberships.active ?? [];
  const inactiveMemberships = scenario.memberships.inactive ?? [];
  const preferredAcademyId = scenario.preferences?.active_academy_id ?? null;
  const resolvedActiveAcademyId =
    preferredAcademyId ??
    (activeMemberships.length === 1 ? (activeMemberships[0].academy_id as number) : null);

  const platformRole =
    scenario.profile.role === 'platform_owner' || scenario.profile.role === 'super_admin'
      ? scenario.profile.role
      : null;
  const resolvedMembership =
    resolvedActiveAcademyId != null
      ? activeMemberships.find((membership) => membership.academy_id === resolvedActiveAcademyId) ?? null
      : null;
  const resolvedRole =
    resolvedMembership && typeof resolvedMembership.role === 'string'
      ? resolvedMembership.role
      : platformRole;

  const baseMetadataPayload = isPlainRecord(scenario.finalize.metadata_payload)
    ? scenario.finalize.metadata_payload
    : { app_metadata: {}, user_metadata: {} };
  const baseAppMetadata =
    isPlainRecord(baseMetadataPayload.app_metadata) ? baseMetadataPayload.app_metadata : {};
  const baseUserMetadata =
    isPlainRecord(baseMetadataPayload.user_metadata) ? baseMetadataPayload.user_metadata : {};

  const derivedFinalize = {
    ...scenario.finalize,
    memberships: activeMemberships,
    memberships_inactive: inactiveMemberships,
    metadata_payload: {
      app_metadata: {
        ...baseAppMetadata,
        active_academy_id: resolvedActiveAcademyId,
        active_role: resolvedRole,
        ...(platformRole ? { platform_role: platformRole } : {}),
        memberships: activeMemberships,
        memberships_inactive: inactiveMemberships,
      },
      user_metadata: {
        ...baseUserMetadata,
        profile_email: scenario.profile.email,
        active_academy_id: resolvedActiveAcademyId,
        full_name: scenario.preferences?.full_name ?? null,
        target_exam_id: scenario.preferences?.target_exam_id ?? null,
        target_level_id: scenario.preferences?.target_level_id ?? null,
        is_initial_setup_completed: Boolean(scenario.preferences?.is_initial_setup_completed),
      },
    },
  };

  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: scenario.session } });
  supabaseMock.functions.invoke.mockImplementation(async (name: string) => {
    if (name === 'auth-finalize-signup') {
      if (finalizeError) {
        return { data: null, error: finalizeError };
      }
      return { data: derivedFinalize, error: null };
    }
    return { data: null, error: null };
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: scenario.profile, error: null, status: 200 }),
          }),
        }),
      };
    }
    if (table === 'user_preferences') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: scenario.preferences,
              error: null,
              status: 200,
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  supabaseMock.rpc.mockImplementation((fnName: string) => {
    if (fnName === 'list_user_academies') {
      return {
        single: () =>
          Promise.resolve({
            data: {
              active_academies: scenario.memberships.active,
              inactive_academies: scenario.memberships.inactive,
            },
            error: null,
          }),
      };
    }
    throw new Error(`Unexpected RPC ${fnName}`);
  });
  return scenario;
};

const renderAuthProvider = async (scenarioOverrides: Partial<MockScenario> = {}) => {
  configureScenario(scenarioOverrides);
  const result: { current: ReturnType<typeof useAuth> | null } = { current: null };

  const Consumer = () => {
    const auth = useAuth();
    useEffect(() => {
      if (!auth.isLoading) {
        result.current = auth;
      }
    }, [auth]);
    return null;
  };

  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );

  await waitFor(() => expect(result.current?.isLoading).toBe(false));
  return result.current!;
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorMessages = [];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrorMessages.push(args.map((arg) => String(arg)).join(' '));
    });
  });

  afterEach(() => {
    unsubscribe.mockClear();
     const actWarnings = consoleErrorMessages.filter((message) => message.includes('not wrapped in act'));
     consoleErrorSpy?.mockRestore();
     expect(actWarnings).toHaveLength(0);
  });

  test('handles users without memberships', async () => {
    const auth = await renderAuthProvider({
      memberships: { active: [], inactive: [] },
    });

    expect(auth.memberships).toHaveLength(0);
    expect(auth.membershipsInactive).toHaveLength(0);
    expect(auth.activeAcademyId).toBeNull();
    expect(auth.role).toBeNull();
    expect(auth.isPlatformAdmin).toBe(false);
    expect(auth.finalizeStatus).toBe('success');
  });

  test('preserves finalize error state when auth-finalize-signup fails', async () => {
    const finalizeError = {
      message: 'Role conflict detected',
      code: 'P0001',
      requestId: 'req-role-conflict',
      context: {
        code: 'ROLE_CONFLICT',
        request_id: 'req-role-conflict',
        error: 'This email is tied to a different role',
        details: { current_role: 'student', requested_role: 'teacher' },
      },
    };

    const auth = await renderAuthProvider({ finalizeError });

    expect(auth.finalizeStatus).toBe('error');
    expect(auth.lastFinalizeRequestId).toBe('req-role-conflict');
    expect(auth.lastFinalizeError?.code).toBe('ROLE_CONFLICT');
    expect(auth.lastFinalizeError?.details).toEqual({
      current_role: 'student',
      requested_role: 'teacher',
    });
  });

  test('resolves active academy and membership role for multi-academy users', async () => {
    const auth = await renderAuthProvider({
      preferences: {
        full_name: 'Teacher',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: 202,
        is_initial_setup_completed: true,
        updated_at: new Date().toISOString(),
      },
      memberships: {
        active: [
          { membership_id: 101, academy_id: 201, academy_name: 'North Academy', role: 'teacher', status: 'active' },
          { membership_id: 102, academy_id: 202, academy_name: 'South Academy', role: 'teacher', status: 'active' },
        ],
        inactive: [],
      },
    });

    expect(auth.memberships).toHaveLength(2);
    expect(auth.activeAcademyId).toBe(202);
    expect(auth.activeMembershipId).toBe(102);
    expect(auth.role).toBe('teacher');
    expect(auth.isProfileComplete).toBe(true);
  });

  test('preserves academy name when refreshed memberships omit the academy name', async () => {
    const academyId = 3;
    configureScenario({
      profile: {
        ...defaultScenario.profile,
        role: 'academy_admin',
      },
      preferences: {
        full_name: 'Admin',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: academyId,
        is_initial_setup_completed: true,
        updated_at: new Date().toISOString(),
      },
      memberships: {
        active: [
          {
            membership_id: 301,
            academy_id: academyId,
            academy_name: 'Academia de prueba',
            role: 'academy_admin',
            status: 'active',
          },
        ],
        inactive: [],
      },
    });

    let latestAuth: ReturnType<typeof useAuth> | null = null;

    const Consumer = () => {
      const auth = useAuth();
      useEffect(() => {
        if (!auth.isLoading) {
          latestAuth = auth;
        }
      }, [auth]);
      return null;
    };

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(latestAuth?.isLoading).toBe(false));
    expect(latestAuth?.memberships[0]?.academyName).toBe('Academia de prueba');

    const refreshedMemberships = [
      {
        membership_id: 301,
        academy_id: academyId,
        role: 'academy_admin',
        status: 'active',
      },
    ];

    const finalizeResponse = {
      memberships: refreshedMemberships,
      memberships_inactive: [],
      memberships_claimed: [],
      auto_selected_academy_id: null,
      metadata_payload: { app_metadata: {}, user_metadata: {} },
      should_refresh_session: false,
      is_platform_admin: false,
      request_id: 'req-refresh',
    };

    supabaseMock.functions.invoke.mockImplementation((fnName: string) => {
      if (fnName === 'auth-finalize-signup') {
        return Promise.resolve({ data: finalizeResponse, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    supabaseMock.rpc.mockImplementation((fnName: string) => {
      if (fnName === 'list_user_academies') {
        return {
          single: () =>
            Promise.resolve({
              data: {
                active_academies: refreshedMemberships,
                inactive_academies: [],
              },
              error: null,
            }),
        };
      }
      throw new Error(`Unexpected RPC ${fnName}`);
    });

    await act(async () => {
      await latestAuth?.retryFinalize();
    });

    await waitFor(() => expect(latestAuth?.memberships[0]?.academyName).toBe('Academia de prueba'));
  });

  test('surface inactive-only memberships without assigning an active academy', async () => {
    const inactiveMemberships = [
      { membership_id: 201, academy_id: 301, academy_name: 'Dormant Academy', role: 'student', status: 'inactive' },
    ];

    const auth = await renderAuthProvider({
      memberships: { active: [], inactive: inactiveMemberships },
      preferences: {
        full_name: 'Waiting Student',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: null,
        is_initial_setup_completed: false,
        updated_at: new Date().toISOString(),
      },
    });

    expect(auth.memberships).toHaveLength(0);
    expect(auth.membershipsInactive).toHaveLength(1);
    expect(auth.activeAcademyId).toBeNull();
    expect(auth.finalizeStatus).toBe('success');
  });

  test('refreshes the session when finalize response requests it and claims lack an active academy', async () => {
    await renderAuthProvider({
      finalize: {
        ...defaultScenario.finalize,
        should_refresh_session: true,
      },
    });

    expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  test('skips session refresh when finalize response does not require it', async () => {
    await renderAuthProvider({
      finalize: {
        ...defaultScenario.finalize,
        should_refresh_session: false,
      },
    });

    expect(supabaseMock.auth.refreshSession).not.toHaveBeenCalled();
  });

  test('skips session refresh when finalize requests it but the JWT already has the selected academy', async () => {
    const alignedAcademyId = 987;
    await renderAuthProvider({
      session: createMockSession({
        user: createMockUser({
          app_metadata: { active_academy_id: alignedAcademyId },
        }),
      }),
      finalize: {
        ...defaultScenario.finalize,
        should_refresh_session: true,
      },
      memberships: {
        active: [
          {
            membership_id: 4001,
            academy_id: alignedAcademyId,
            academy_name: 'Aligned Academy',
            role: 'teacher',
            status: 'active',
          },
        ],
        inactive: [],
      },
      preferences: {
        full_name: 'Teacher',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: alignedAcademyId,
        is_initial_setup_completed: true,
        updated_at: new Date().toISOString(),
      },
    });

    expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  test('syncs focus session updates even when the user id is unchanged', async () => {
    const initialSession = createMockSession({ access_token: 'token-initial', refresh_token: 'refresh-initial' });
    const refreshedSession = createMockSession({ access_token: 'token-refreshed', refresh_token: 'refresh-refreshed' });

    configureScenario({ session: initialSession });

    const observed: { current: ReturnType<typeof useAuth> | null } = { current: null };

    const Consumer = () => {
      const auth = useAuth();
      useEffect(() => {
        observed.current = auth;
      }, [auth]);
      return null;
    };

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(observed.current?.isLoading).toBe(false));
    expect(observed.current?.session?.access_token).toBe('token-initial');

    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: refreshedSession } });

    const invokeCountBeforeFocus = supabaseMock.functions.invoke.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(observed.current?.session?.access_token).toBe('token-refreshed'));
    await waitFor(() =>
      expect(supabaseMock.functions.invoke.mock.calls.length).toBeGreaterThan(invokeCountBeforeFocus),
    );
  });

  test('selectActiveAcademy refreshes the session only when the JWT lacks the new academy', async () => {
    const targetAcademyId = 55;
    const auth = await renderAuthProvider({
      memberships: {
        active: [
          {
            membership_id: 401,
            academy_id: targetAcademyId,
            academy_name: 'Central Academy',
            role: 'teacher',
            status: 'active',
          },
        ],
        inactive: [],
      },
      preferences: {
        full_name: 'Teacher',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: null,
        is_initial_setup_completed: true,
        updated_at: new Date().toISOString(),
      },
    });

    const userSetResponse = {
      membership: {
        id: 401,
        academy_id: targetAcademyId,
        role: 'teacher',
        status: 'active',
      },
      metadata_payload: {
        app_metadata: {
          active_academy_id: targetAcademyId,
        },
        user_metadata: {},
      },
      should_refresh_session: true,
      request_id: 'req-set-academy',
    };

    const finalizeResponse = {
      ...defaultScenario.finalize,
      should_refresh_session: false,
    };

    supabaseMock.functions.invoke.mockImplementation((fnName: string) => {
      if (fnName === 'auth-finalize-signup') {
        return Promise.resolve({ data: finalizeResponse, error: null });
      }
      if (fnName === 'user-set-active-academy') {
        return Promise.resolve({ data: userSetResponse, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    supabaseMock.auth.refreshSession.mockClear();

    await act(async () => {
      await auth.selectActiveAcademy(targetAcademyId);
    });

    expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  test('selectActiveAcademy skips the refresh when the JWT already references the selected academy', async () => {
    const targetAcademyId = 77;
    const auth = await renderAuthProvider({
      session: createMockSession({
        user: createMockUser({
          app_metadata: {
            active_academy_id: targetAcademyId,
          },
        }),
      }),
      memberships: {
        active: [
          {
            membership_id: 701,
            academy_id: targetAcademyId,
            academy_name: 'Aligned Academy',
            role: 'teacher',
            status: 'active',
          },
        ],
        inactive: [],
      },
      preferences: {
        full_name: 'Teacher',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: targetAcademyId,
        is_initial_setup_completed: true,
        updated_at: new Date().toISOString(),
      },
    });

    const userSetResponse = {
      membership: {
        id: 701,
        academy_id: targetAcademyId,
        role: 'teacher',
        status: 'active',
      },
      metadata_payload: {
        app_metadata: {
          active_academy_id: targetAcademyId,
        },
        user_metadata: {},
      },
      should_refresh_session: false,
      request_id: 'req-set-aligned',
    };

    const finalizeResponse = {
      ...defaultScenario.finalize,
      should_refresh_session: false,
    };

    supabaseMock.functions.invoke.mockImplementation((fnName: string) => {
      if (fnName === 'auth-finalize-signup') {
        return Promise.resolve({ data: finalizeResponse, error: null });
      }
      if (fnName === 'user-set-active-academy') {
        return Promise.resolve({ data: userSetResponse, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    supabaseMock.auth.refreshSession.mockClear();

    await act(async () => {
      await auth.selectActiveAcademy(targetAcademyId);
    });

    expect(supabaseMock.auth.refreshSession).not.toHaveBeenCalled();
  });

  test('marks platform admins coming from finalize metadata', async () => {
    const auth = await renderAuthProvider({
      finalize: {
        ...defaultScenario.finalize,
        is_platform_admin: true,
      },
      profile: {
        ...defaultScenario.profile,
        role: 'platform_owner',
      },
    });

    expect(auth.isPlatformAdmin).toBe(true);
    expect(auth.platformRole).toBe('platform_owner');
    expect(auth.finalizeStatus).toBe('success');
  });

  test('useActiveAcademy exposes membership metadata', async () => {
    configureScenario({
      preferences: {
        full_name: 'Teacher',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: 202,
        is_initial_setup_completed: true,
        updated_at: new Date().toISOString(),
      },
      memberships: {
        active: [
          { membership_id: 101, academy_id: 201, academy_name: 'North Academy', role: 'teacher', status: 'active' },
          { membership_id: 102, academy_id: 202, academy_name: 'South Academy', role: 'teacher', status: 'active' },
        ],
        inactive: [],
      },
    });

    const hookState: { academyId: number | null; name: string | null; multi: boolean | null } = {
      academyId: null,
      name: null,
      multi: null,
    };

    const Consumer = () => {
      const auth = useAuth();
      const activeAcademy = useActiveAcademy();
      useEffect(() => {
        if (!auth.isLoading) {
          hookState.academyId = activeAcademy.activeAcademyId;
          hookState.name = activeAcademy.activeMembership?.academyName ?? null;
          hookState.multi = activeAcademy.hasMultipleActiveAcademies;
        }
      }, [auth.isLoading, activeAcademy]);
      return null;
    };

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(hookState.academyId).toBe(202));
    expect(hookState.name).toBe('South Academy');
    expect(hookState.multi).toBe(true);
  });
});
