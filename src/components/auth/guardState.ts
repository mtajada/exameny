import type { AuthContextType } from '@/contexts/AuthContextBase';
import type { OnboardingScenario } from '@/components/auth/onboarding/state';
import { determineOnboardingScenario } from '@/components/auth/onboarding/state';

type ScenarioSource = Pick<
  AuthContextType,
  | 'isPlatformAdmin'
  | 'memberships'
  | 'membershipsInactive'
  | 'activeAcademyId'
  | 'userPreferences'
  | 'role'
  | 'isProfileComplete'
  | 'isNameRequired'
>;

export const deriveGuardScenario = (source: ScenarioSource): OnboardingScenario =>
  determineOnboardingScenario({
    isPlatformAdmin: source.isPlatformAdmin,
    memberships: source.memberships,
    membershipsInactive: source.membershipsInactive,
    activeAcademyId: source.activeAcademyId,
    userPreferences: source.userPreferences,
    role: source.role,
    isProfileComplete: source.isProfileComplete,
    isNameRequired: source.isNameRequired,
  });

export const needsAuthFallback = (scenario: OnboardingScenario): boolean =>
  scenario.kind === 'waiting' || scenario.kind === 'selector';

export const needsProfileSetupRedirect = (scenario: OnboardingScenario): boolean =>
  scenario.kind === 'onboarding';
