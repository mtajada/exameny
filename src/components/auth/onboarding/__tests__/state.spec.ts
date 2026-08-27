import { describe, expect, it } from 'vitest';

import type { MembershipSummary } from '@/contexts/AuthContextBase';
import { determineOnboardingScenario } from '@/components/auth/onboarding/state';

const membership = (academyId: number): MembershipSummary => ({
  membershipId: academyId * 10,
  academyId,
  academyName: `Academy ${academyId}`,
  role: 'student',
  status: 'active',
  subscriptionStartDate: null,
  subscriptionEndDate: null,
});

describe('determineOnboardingScenario', () => {
  it('asks for a missing name before any academy decision', () => {
    const scenario = determineOnboardingScenario({
      isPlatformAdmin: false,
      memberships: [membership(1), membership(2)],
      membershipsInactive: [],
      activeAcademyId: null,
      userPreferences: null,
      role: 'student',
      isProfileComplete: false,
      isNameRequired: true,
    });

    expect(scenario.kind).toBe('onboarding');
    if (scenario.kind === 'onboarding') {
      expect(scenario.requiresFullName).toBe(true);
    }
  });

  it('requires an academy choice before student learning goals', () => {
    const scenario = determineOnboardingScenario({
      isPlatformAdmin: false,
      memberships: [membership(1), membership(2)],
      membershipsInactive: [],
      activeAcademyId: null,
      userPreferences: {
        fullName: 'Student',
        targetExamId: null,
        targetLevelId: null,
        activeAcademyId: null,
        isInitialSetupCompleted: false,
        updatedAt: null,
      },
      role: 'student',
      isProfileComplete: false,
      isNameRequired: false,
    });

    expect(scenario.kind).toBe('selector');
  });

  it('shows the waiting state before goals when there is no active membership', () => {
    const scenario = determineOnboardingScenario({
      isPlatformAdmin: false,
      memberships: [],
      membershipsInactive: [],
      activeAcademyId: null,
      userPreferences: {
        fullName: 'Student',
        targetExamId: null,
        targetLevelId: null,
        activeAcademyId: null,
        isInitialSetupCompleted: false,
        updatedAt: null,
      },
      role: 'student',
      isProfileComplete: false,
      isNameRequired: false,
    });

    expect(scenario.kind).toBe('waiting');
  });
});
