import type { MembershipRole, MembershipSummary, UserPreferencesState } from '@/contexts/AuthContextBase';

export type WaitingVariant = 'no-academy' | 'inactive-only';

export type OnboardingScenario =
  | { kind: 'platform-admin' }
  | { kind: 'waiting'; variant: WaitingVariant; membershipsInactive: MembershipSummary[] }
  | { kind: 'selector' }
  | {
    kind: 'onboarding';
    requiresFullName: boolean;
    requiresTargets: boolean;
    role: MembershipRole | null;
  }
  | { kind: 'ready' };

export interface OnboardingSnapshot {
  isPlatformAdmin: boolean;
  memberships: MembershipSummary[];
  membershipsInactive: MembershipSummary[];
  activeAcademyId: number | null;
  userPreferences: UserPreferencesState | null;
  role: MembershipRole | null;
  isProfileComplete: boolean | null;
  isNameRequired: boolean;
}

export const needsStudentTargets = (
  role: MembershipRole | null,
  preferences: UserPreferencesState | null,
): boolean => {
  if (role !== 'student') {
    return false;
  }
  const hasExam = preferences?.targetExamId != null;
  const hasLevel = preferences?.targetLevelId != null;
  const setupComplete = preferences?.isInitialSetupCompleted ?? false;
  return !hasExam || !hasLevel || !setupComplete;
};

const hasValidActiveSelection = (snapshot: OnboardingSnapshot) => {
  if (!snapshot.activeAcademyId) {
    return false;
  }
  return snapshot.memberships.some((membership) => membership.academyId === snapshot.activeAcademyId);
};

export const determineOnboardingScenario = (snapshot: OnboardingSnapshot): OnboardingScenario => {
  if (snapshot.isPlatformAdmin) {
    return { kind: 'platform-admin' };
  }

  const requiresFullName = snapshot.isNameRequired;
  const requiresTargets = needsStudentTargets(snapshot.role, snapshot.userPreferences);

  if (requiresFullName || requiresTargets || snapshot.isProfileComplete === false) {
    return {
      kind: 'onboarding',
      requiresFullName,
      requiresTargets,
      role: snapshot.role,
    };
  }

  if (snapshot.memberships.length === 0) {
    const variant: WaitingVariant = snapshot.membershipsInactive.length > 0 ? 'inactive-only' : 'no-academy';
    return { kind: 'waiting', variant, membershipsInactive: snapshot.membershipsInactive };
  }

  if (snapshot.memberships.length > 1 && !hasValidActiveSelection(snapshot)) {
    return { kind: 'selector' };
  }

  return { kind: 'ready' };
};
