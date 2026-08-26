import React from 'react';
import { render, screen } from '@testing-library/react';
import { Route, Routes, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { AuthContextType, MembershipSummary } from '@/contexts/AuthContextBase';
import { useAuth } from '@/contexts/useAuth';
import ProfileSetupPage from '@/pages/ProfileSetupPage';
import type { User } from '@supabase/supabase-js';

vi.mock('@/contexts/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/auth/onboarding/hooks', () => ({
  useExamOptions: () => ({ data: [{ id: 1, name: 'B2' }], isLoading: false }),
  useExamLevels: () => ({ data: [{ id: 10, code: 'B2', name: 'Upper B2' }], isLoading: false }),
}));

const createMembership = (overrides: Partial<MembershipSummary> = {}): MembershipSummary => ({
  membershipId: overrides.membershipId ?? 1,
  academyId: overrides.academyId ?? 1,
  academyName: overrides.academyName ?? 'Test Academy',
  role: overrides.role ?? 'student',
  status: overrides.status ?? 'active',
  subscriptionStartDate: null,
  subscriptionEndDate: null,
});

const createAuthContext = (overrides: Partial<AuthContextType> = {}): AuthContextType => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  platformRole: null,
  isPlatformAdmin: false,
  activeAcademyId: null,
  activeMembershipId: null,
  userPreferences: null,
  memberships: [],
  membershipsInactive: [],
  isInitialSetupCompleted: false,
  isProcessingAuth: false,
  finalizeStatus: 'success',
  lastFinalizeError: null,
  lastFinalizeRequestId: null,
  isLoading: false,
  error: null,
  isProfileComplete: true,
  isNameRequired: false,
  logout: vi.fn().mockResolvedValue({ error: null }),
  updateProfileCompletionStatus: vi.fn(),
  refreshUserProfile: vi.fn().mockResolvedValue(undefined),
  retryFinalize: vi.fn().mockResolvedValue(undefined),
  selectActiveAcademy: vi.fn().mockResolvedValue({ error: null }),
  ...overrides,
});

const useAuthMock = vi.mocked(useAuth);
const dummyUser = { id: 'user-1' } as User;

const renderPage = () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/profile-setup']}>
        <Routes>
          <Route path="/profile-setup" element={<ProfileSetupPage />} />
          <Route path="/dashboard" element={<p data-testid="dashboard" />} />
          <Route path="/platform" element={<p data-testid="platform-console" />} />
          <Route path="/auth" element={<p data-testid="auth-entry" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ProfileSetupPage', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('renders the onboarding card when a student lacks targets', () => {
    useAuthMock.mockReturnValue(
      createAuthContext({
        user: dummyUser,
        memberships: [createMembership()],
        activeAcademyId: 1,
        role: 'student',
        isProfileComplete: false,
        isNameRequired: false,
        userPreferences: {
          fullName: 'Ana',
          targetExamId: null,
          targetLevelId: null,
          activeAcademyId: 1,
          isInitialSetupCompleted: false,
          updatedAt: null,
        },
      }),
    );

    renderPage();

    expect(screen.getByText('Choose your goal')).toBeInTheDocument();
  });

  it('redirects ready users to the dashboard instead of /auth', () => {
    useAuthMock.mockReturnValue(
      createAuthContext({
        user: dummyUser,
        memberships: [createMembership()],
        activeAcademyId: 1,
        role: 'teacher',
        isProfileComplete: true,
        isNameRequired: false,
        userPreferences: {
          fullName: 'Teacher',
          targetExamId: null,
          targetLevelId: null,
          activeAcademyId: 1,
          isInitialSetupCompleted: true,
          updatedAt: null,
        },
      }),
    );

    renderPage();

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('redirects platform admins directly to the platform console', () => {
    useAuthMock.mockReturnValue(
      createAuthContext({
        user: dummyUser,
        isPlatformAdmin: true,
        memberships: [],
        membershipsInactive: [],
        isProfileComplete: true,
      }),
    );

    renderPage();

    expect(screen.getByTestId('platform-console')).toBeInTheDocument();
  });
});
