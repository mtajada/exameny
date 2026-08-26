import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type {
  AuthContextType,
  MembershipRole,
  MembershipSummary,
  UserPreferencesState,
} from '../../../contexts/AuthContextBase.ts';
import { ProtectedRoute } from '../ProtectedRoute.tsx';
import { AcademyAdminRoute } from '../AcademyAdminRoute.tsx';
import { PlatformAdminRoute } from '../PlatformAdminRoute.tsx';
import { AcademyLayout } from '../../layout/AcademyLayout.tsx';

vi.mock('../../../contexts/useAuth.ts', () => ({
  useAuth: () => mockAuthContext,
}));

let mockAuthContext: AuthContextType;

const buildUser = (overrides: Partial<AuthContextType['user']> = {}): AuthContextType['user'] => ({
  id: 'user-1',
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  ...overrides,
});

const createMembership = (overrides: Partial<MembershipSummary> = {}): MembershipSummary => ({
  membershipId: overrides.membershipId ?? 100,
  academyId: overrides.academyId ?? 1,
  academyName: overrides.academyName ?? 'Academy One',
  role: overrides.role ?? 'teacher',
  status: overrides.status ?? 'active',
  subscriptionStartDate: overrides.subscriptionStartDate ?? null,
  subscriptionEndDate: overrides.subscriptionEndDate ?? null,
});

const createPreferences = (overrides: Partial<UserPreferencesState> = {}): UserPreferencesState => ({
  fullName: overrides.fullName ?? 'Anna Greene',
  targetExamId: overrides.targetExamId ?? 10,
  targetLevelId: overrides.targetLevelId ?? 20,
  activeAcademyId: overrides.activeAcademyId ?? 1,
  isInitialSetupCompleted: overrides.isInitialSetupCompleted ?? true,
  updatedAt: overrides.updatedAt ?? null,
});

const createAuthContext = (): AuthContextType => ({
  session: null,
  user: buildUser(),
  profile: null,
  role: 'teacher',
  platformRole: 'teacher',
  isPlatformAdmin: false,
  activeAcademyId: 1,
  activeMembershipId: 100,
  userPreferences: createPreferences(),
  memberships: [createMembership()],
  membershipsInactive: [],
  isInitialSetupCompleted: true,
  isProcessingAuth: false,
  finalizeStatus: 'success',
  lastFinalizeError: null,
  lastFinalizeRequestId: null,
  isLoading: false,
  error: null,
  isProfileComplete: true,
  isNameRequired: false,
  logout: async () => ({ error: null }),
  updateProfileCompletionStatus: () => {},
  refreshUserProfile: async () => {},
  retryFinalize: async () => {},
  selectActiveAcademy: async () => ({ error: null }),
});

const renderProtectedRoute = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/auth" element={<p data-testid="auth-screen">auth</p>} />
        <Route path="/profile-setup" element={<p data-testid="profile-setup-screen">profile-setup</p>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <p data-testid="protected-content">protected</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const renderAcademyRoute = () =>
  render(
    <MemoryRouter initialEntries={['/academy']}>
      <Routes>
        <Route path="/auth" element={<p data-testid="auth-screen">auth</p>} />
        <Route path="/platform" element={<p data-testid="platform-screen">platform</p>} />
        <Route
          path="/profile-setup"
          element={<p data-testid="profile-setup-screen">profile-setup</p>}
        />
        <Route path="/dashboard" element={<p data-testid="dashboard-screen">dashboard</p>} />
        <Route
          path="/academy"
          element={
            <AcademyAdminRoute>
              <p data-testid="academy-content">academy</p>
            </AcademyAdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const renderPlatformRoute = () =>
  render(
    <MemoryRouter initialEntries={['/platform']}>
      <Routes>
        <Route path="/auth" element={<p data-testid="auth-screen">auth</p>} />
        <Route path="/dashboard" element={<p data-testid="dashboard-screen">dashboard</p>} />
        <Route
          path="/platform"
          element={
            <PlatformAdminRoute>
              <p data-testid="platform-content">platform</p>
            </PlatformAdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const renderAcademyLayout = () =>
  render(
    <MemoryRouter initialEntries={['/academy/dashboard']}>
      <Routes>
        <Route path="/auth" element={<p data-testid="auth-screen">auth</p>} />
        <Route path="/platform" element={<p data-testid="platform-screen">platform</p>} />
        <Route path="/academy/dashboard" element={<AcademyLayout />}>
          <Route index element={<p data-testid="academy-layout-content">academy layout</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockAuthContext = createAuthContext();
  });

  it('renders the branded loading shell while auth state is initializing', () => {
    mockAuthContext.isLoading = true;

    renderProtectedRoute();

    expect(screen.getByText('Syncing your access')).toBeInTheDocument();
    expect(screen.getByText('We are preparing your academies.')).toBeInTheDocument();
  });

  it('redirects to auth when no active academies are available', () => {
    mockAuthContext.memberships = [];
    mockAuthContext.membershipsInactive = [createMembership({ status: 'inactive' })];

    renderProtectedRoute();
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  it('redirects to profile setup when onboarding is still required', () => {
    mockAuthContext.isProfileComplete = false;
    mockAuthContext.isNameRequired = true;
    mockAuthContext.userPreferences = createPreferences({ fullName: null });

    renderProtectedRoute();
    expect(screen.getByTestId('profile-setup-screen')).toBeInTheDocument();
  });

  it('redirects to auth when multi-academy selection has not been made', () => {
    mockAuthContext.memberships = [
      createMembership({ membershipId: 100, academyId: 1 }),
      createMembership({ membershipId: 200, academyId: 2 }),
    ];
    mockAuthContext.userPreferences = createPreferences({ activeAcademyId: null });
    mockAuthContext.activeAcademyId = null;

    renderProtectedRoute();
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  it.each<MembershipRole>(['student', 'teacher', 'academy_admin'])(
    'allows %s with completed onboarding to proceed',
    (role) => {
      mockAuthContext.role = role;
      mockAuthContext.platformRole = role;
      mockAuthContext.memberships = [createMembership({ role, academyId: 5 })];
      mockAuthContext.activeAcademyId = 5;
      mockAuthContext.userPreferences = createPreferences({
        activeAcademyId: 5,
        targetExamId: role === 'student' ? 10 : null,
        targetLevelId: role === 'student' ? 20 : null,
        isInitialSetupCompleted: role === 'student',
      });
      mockAuthContext.isProfileComplete = true;
      mockAuthContext.isNameRequired = false;

      if (role !== 'student') {
        mockAuthContext.userPreferences = createPreferences({ activeAcademyId: 5 });
      }

      renderProtectedRoute();
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    },
  );

  it('allows platform admins even without academy context', () => {
    mockAuthContext.isPlatformAdmin = true;
    mockAuthContext.role = null;
    mockAuthContext.platformRole = 'super_admin';
    mockAuthContext.memberships = [];
    mockAuthContext.activeAcademyId = null;

    renderProtectedRoute();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});

describe('PlatformAdminRoute', () => {
  beforeEach(() => {
    mockAuthContext = createAuthContext();
  });

  it('renders the shared loading shell while auth resolves', () => {
    mockAuthContext.isLoading = true;

    renderPlatformRoute();
    expect(screen.getByText('Syncing your access')).toBeInTheDocument();
    expect(screen.getByText('We are preparing your academies.')).toBeInTheDocument();
  });

  it('redirects to auth when the user is missing', () => {
    mockAuthContext.user = null;

    renderPlatformRoute();
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  it('redirects non platform admins to the dashboard', () => {
    mockAuthContext.isPlatformAdmin = false;

    renderPlatformRoute();
    expect(screen.getByTestId('dashboard-screen')).toBeInTheDocument();
  });

  it('renders platform content for platform admins', () => {
    mockAuthContext.isPlatformAdmin = true;
    mockAuthContext.platformRole = 'super_admin';

    renderPlatformRoute();
    expect(screen.getByTestId('platform-content')).toBeInTheDocument();
  });
});

describe('AcademyAdminRoute', () => {
  beforeEach(() => {
    mockAuthContext = createAuthContext();
  });

  it('renders the shared loading shell while auth resolves', () => {
    mockAuthContext.isProcessingAuth = true;

    renderAcademyRoute();
    expect(screen.getByText('Syncing your access')).toBeInTheDocument();
    expect(screen.getByText('We are preparing your academies.')).toBeInTheDocument();
  });

  it('redirects to auth if academy context is missing', () => {
    mockAuthContext.memberships = [];
    mockAuthContext.activeAcademyId = null;
    mockAuthContext.role = 'academy_admin';
    mockAuthContext.userPreferences = createPreferences({ activeAcademyId: null });

    renderAcademyRoute();
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  it('redirects non-admins to the main dashboard', () => {
    mockAuthContext.role = 'teacher';

    renderAcademyRoute();
    expect(screen.getByTestId('dashboard-screen')).toBeInTheDocument();
  });

  it('allows academy admins with valid membership', () => {
    mockAuthContext.role = 'academy_admin';
    mockAuthContext.platformRole = 'academy_admin';
    mockAuthContext.memberships = [createMembership({ role: 'academy_admin', academyId: 9 })];
    mockAuthContext.activeAcademyId = 9;
    mockAuthContext.userPreferences = createPreferences({ activeAcademyId: 9 });

    renderAcademyRoute();
    expect(screen.getByTestId('academy-content')).toBeInTheDocument();
  });

  it('redirects academy admins without an active academy selection to auth', () => {
    mockAuthContext.role = 'academy_admin';
    mockAuthContext.platformRole = 'academy_admin';
    mockAuthContext.memberships = [
      createMembership({ role: 'academy_admin', academyId: 5, membershipId: 101 }),
      createMembership({ role: 'academy_admin', academyId: 6, membershipId: 202 }),
    ];
    mockAuthContext.activeAcademyId = null;
    mockAuthContext.userPreferences = createPreferences({ activeAcademyId: null });

    renderAcademyRoute();
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  it('redirects academy admins who still owe onboarding data to profile setup', () => {
    mockAuthContext.role = 'academy_admin';
    mockAuthContext.platformRole = 'academy_admin';
    mockAuthContext.memberships = [createMembership({ role: 'academy_admin', academyId: 12 })];
    mockAuthContext.activeAcademyId = 12;
    mockAuthContext.userPreferences = createPreferences({ fullName: null, activeAcademyId: 12 });
    mockAuthContext.isProfileComplete = false;
    mockAuthContext.isNameRequired = true;

    renderAcademyRoute();
    expect(screen.getByTestId('profile-setup-screen')).toBeInTheDocument();
  });

  it('redirects platform admins to the platform console', () => {
    mockAuthContext.isPlatformAdmin = true;
    mockAuthContext.role = null;
    mockAuthContext.platformRole = 'super_admin';
    mockAuthContext.memberships = [];
    mockAuthContext.activeAcademyId = null;

    renderAcademyRoute();
    expect(screen.getByTestId('platform-screen')).toBeInTheDocument();
  });
});

describe('AcademyLayout', () => {
  beforeEach(() => {
    mockAuthContext = createAuthContext();
  });

  it('redirects platform admins without an active membership to the platform console', () => {
    mockAuthContext.isPlatformAdmin = true;
    mockAuthContext.role = null;
    mockAuthContext.platformRole = 'super_admin';
    mockAuthContext.memberships = [];
    mockAuthContext.activeAcademyId = null;
    mockAuthContext.userPreferences = createPreferences({ activeAcademyId: null });

    renderAcademyLayout();
    expect(screen.getByTestId('platform-screen')).toBeInTheDocument();
  });

  it('redirects non platform users without an active membership to auth', () => {
    mockAuthContext.isPlatformAdmin = false;
    mockAuthContext.memberships = [];
    mockAuthContext.activeAcademyId = null;
    mockAuthContext.userPreferences = createPreferences({ activeAcademyId: null });

    renderAcademyLayout();
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });
});
