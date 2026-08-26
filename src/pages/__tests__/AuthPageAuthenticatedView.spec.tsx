import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import type { MembershipSummary, MembershipRole, UserPreferencesState } from '@/contexts/AuthContextBase';
import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge';
import { AuthenticatedAuthView } from '@/pages/AuthPage';

vi.mock('@/components/auth/onboarding/hooks', () => ({
  useExamOptions: () => ({ data: [{ id: 1, name: 'B2' }], isLoading: false }),
  useExamLevels: () => ({ data: [{ id: 10, code: 'B2', name: 'Upper B2' }], isLoading: false }),
}));

let membershipCounter = 1000;

const createMembership = (overrides: Partial<MembershipSummary> = {}): MembershipSummary => ({
  membershipId: overrides.membershipId ?? membershipCounter++,
  academyId: overrides.academyId ?? 1,
  academyName: overrides.academyName ?? 'Academy One',
  role: overrides.role ?? 'student',
  status: overrides.status ?? 'active',
  subscriptionStartDate: null,
  subscriptionEndDate: null,
});

const createPreferences = (overrides: Partial<UserPreferencesState> = {}): UserPreferencesState => ({
  fullName: overrides.fullName ?? 'Ana',
  targetExamId: overrides.targetExamId ?? null,
  targetLevelId: overrides.targetLevelId ?? null,
  activeAcademyId: overrides.activeAcademyId ?? null,
  isInitialSetupCompleted: overrides.isInitialSetupCompleted ?? false,
  updatedAt: overrides.updatedAt ?? null,
});

const renderView = (overrideProps: Partial<React.ComponentProps<typeof AuthenticatedAuthView>> = {}) => {
  const baseProps: React.ComponentProps<typeof AuthenticatedAuthView> = {
    finalizeStatus: 'success',
    isProcessingAuth: false,
    lastFinalizeError: null,
    lastFinalizeRequestId: null,
    isPlatformAdmin: false,
    memberships: [],
    membershipsInactive: [],
    activeAcademyId: null,
    userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
    role: null,
    isProfileComplete: true,
    isNameRequired: false,
    onRetryFinalize: vi.fn(),
    onSelectAcademy: vi.fn().mockResolvedValue({ error: null }),
    refreshUserProfile: vi.fn(),
    onSignOut: vi.fn().mockResolvedValue(undefined),
    isSigningOut: false,
  };

  const props = { ...baseProps, ...overrideProps };

  const queryClient = new QueryClient();

  render(
      <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<AuthenticatedAuthView {...props} />} />
          <Route path="/dashboard" element={<p data-testid="dashboard">dashboard</p>} />
          <Route path="/platform" element={<p data-testid="platform-console">platform console</p>} />
          <Route path="/profile-setup" element={<p data-testid="profile-setup-screen">profile-setup</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return props;
};

describe('AuthenticatedAuthView', () => {
  it('renders waiting screen when no memberships exist', () => {
    renderView({
      memberships: [],
      membershipsInactive: [],
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
    });

    expect(
      screen.getByRole('heading', {
        name: /You don't have any active academies yet/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText((content) => content?.includes('Your academy has not granted access yet.') ?? false)).toBeInTheDocument();
  });

  it('uses inactive variant copy when only inactive memberships exist', () => {
    renderView({
      memberships: [],
      membershipsInactive: [createMembership({ status: 'inactive' })],
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
    });

    expect(screen.getByText((content) => content?.includes('Your access is temporarily paused.') ?? false)).toBeInTheDocument();
  });

  it('renders the mandated role conflict copy when finalize fails', () => {
    const props = renderView({
      finalizeStatus: 'error',
      lastFinalizeError: {
        code: 'ROLE_CONFLICT',
        message:
          'This account is tied to a student profile. Sign in with another account to access as teacher or ask your academy to invite a separate email.',
        requestId: 'req-123',
        details: { current_role: 'student', requested_role: 'teacher' },
      } as EdgeFunctionErrorPayload,
      lastFinalizeRequestId: 'req-123',
    });

    expect(
      screen.getByText(
        /This account is already linked to a student profile\. Sign in with another account to access as teacher/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-123/i)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetryFinalize).toHaveBeenCalled();
  });

  it('renders fixed copy for already claimed invitations', () => {
    renderView({
      finalizeStatus: 'error',
      lastFinalizeError: {
        code: 'INVITATION_ALREADY_CLAIMED',
        message: 'Legacy backend text',
        requestId: 'req-claimed',
      } as EdgeFunctionErrorPayload,
      lastFinalizeRequestId: 'req-claimed',
    });

    expect(
      screen.getByText(/It looks like this invitation was already used\. Try another account or ask your academy/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-claimed/)).toBeInTheDocument();
  });

  it('uses the finalize fallback copy when the backend omitted an error code', () => {
    renderView({
      finalizeStatus: 'error',
      lastFinalizeError: {
        code: null,
        message: 'Unexpected backend error',
        requestId: 'req-generic',
      } as EdgeFunctionErrorPayload,
      lastFinalizeRequestId: 'req-generic',
    });

    expect(screen.getByText(/We could not sync your account\. Try again in a moment\./i)).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-generic/)).toBeInTheDocument();
  });

  it('redirects to profile-setup when students still need targets', () => {
    renderView({
      memberships: [createMembership({ role: 'student', academyId: 1 })],
      activeAcademyId: 1,
      role: 'student',
      userPreferences: createPreferences({
        fullName: 'Ana',
        targetExamId: null,
        targetLevelId: null,
        isInitialSetupCompleted: false,
      }),
      isProfileComplete: false,
    });

    expect(screen.getByTestId('profile-setup-screen')).toBeInTheDocument();
  });

  it('redirects to profile-setup when teachers must confirm their name', () => {
    renderView({
      memberships: [createMembership({ role: 'teacher', academyId: 2 })],
      role: 'teacher',
      userPreferences: createPreferences({ fullName: null }),
      isProfileComplete: false,
      isNameRequired: true,
    });

    expect(screen.getByTestId('profile-setup-screen')).toBeInTheDocument();
  });

  it('redirects to profile-setup when academy admins must confirm their name', () => {
    renderView({
      memberships: [createMembership({ role: 'academy_admin', academyId: 5 })],
      role: 'academy_admin' as MembershipRole,
      userPreferences: createPreferences({ fullName: null }),
      isProfileComplete: false,
      isNameRequired: true,
    });

    expect(screen.getByTestId('profile-setup-screen')).toBeInTheDocument();
  });

  it('renders multi-academy selector when multiple active memberships lack selection', () => {
    renderView({
      memberships: [
        createMembership({ membershipId: 1, academyId: 10, academyName: 'Academy A', role: 'teacher' }),
        createMembership({ membershipId: 2, academyId: 20, academyName: 'Academy B', role: 'teacher' }),
      ],
      activeAcademyId: null,
      role: 'teacher',
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
    });

    expect(screen.getByText('Choose your academy')).toBeInTheDocument();
    expect(screen.getByText('Academy A')).toBeInTheDocument();
    expect(screen.getByText('Academy B')).toBeInTheDocument();
  });

  it('redirects platform admins directly to the platform console', () => {
    renderView({
      isPlatformAdmin: true,
    });

    expect(screen.getByTestId('platform-console')).toBeInTheDocument();
  });

  it('redirects fully onboarded users to the dashboard', () => {
    renderView({
      memberships: [createMembership({ academyId: 33 })],
      activeAcademyId: 33,
      role: 'teacher',
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
    });

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('invokes retry callback from waiting screen', () => {
    const props = renderView({
      memberships: [],
      membershipsInactive: [],
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetryFinalize).toHaveBeenCalled();
  });

  it('uses the curated fallback when selection fails with an unknown backend error', async () => {
    const onSelectAcademy = vi.fn().mockResolvedValue({
      error: {
        code: 'EDGE_ERROR',
        message: 'Sensitive backend details',
        requestId: 'req-error-123',
      } as EdgeFunctionErrorPayload,
    });

    renderView({
      memberships: [
        createMembership({ membershipId: 1, academyId: 10, academyName: 'Academia Uno', role: 'teacher' }),
        createMembership({ membershipId: 2, academyId: 20, academyName: 'Academia Dos', role: 'teacher' }),
      ],
      activeAcademyId: null,
      role: 'teacher',
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
      onSelectAcademy,
    });

    fireEvent.click(screen.getByRole('button', { name: /Academia Uno/i }));

    await waitFor(() => {
      expect(screen.getByText("We couldn't update your academy. Try again.")).toBeInTheDocument();
    });
    expect(screen.getByText(/Error code: EDGE_ERROR · Request ID: req-error-123/i)).toBeInTheDocument();
  });

  it('renders the access-specific copy when the backend reports academy_not_owned', async () => {
    const onSelectAcademy = vi.fn().mockResolvedValue({
      error: {
        code: 'ACADEMY_NOT_OWNED',
        message: '',
        requestId: null,
      } as EdgeFunctionErrorPayload,
    });

    renderView({
      memberships: [
        createMembership({ membershipId: 1, academyId: 10, academyName: 'Academia Uno', role: 'teacher' }),
        createMembership({ membershipId: 2, academyId: 20, academyName: 'Academia Dos', role: 'teacher' }),
      ],
      activeAcademyId: null,
      role: 'teacher',
      userPreferences: createPreferences({ fullName: 'Ana', isInitialSetupCompleted: true }),
      isProfileComplete: true,
      onSelectAcademy,
    });

    fireEvent.click(screen.getByRole('button', { name: /Academia Uno/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/You no longer have access to that academy\. Pick a different option or ask your administrator for help\./i),
      ).toBeInTheDocument();
    });
  });
});
