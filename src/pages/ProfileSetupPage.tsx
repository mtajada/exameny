import React from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/contexts/useAuth';
import { deriveGuardScenario } from '@/components/auth/guardState';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthGateLoadingCard } from '@/components/auth/AuthGateLoadingCard';
import { OnboardingFlow } from '@/components/auth/onboarding/OnboardingFlow';

const AUTH_SHELL_WIDTH = 'lg';

export default function ProfileSetupPage() {
  const {
    user,
    logout,
    isLoading,
    isProcessingAuth,
    memberships,
    membershipsInactive,
    activeAcademyId,
    userPreferences,
    role,
    isProfileComplete,
    isNameRequired,
    isPlatformAdmin,
    refreshUserProfile,
  } = useAuth();

  const scenario = deriveGuardScenario({
    isPlatformAdmin,
    memberships,
    membershipsInactive,
    activeAcademyId,
    userPreferences,
    role,
    isProfileComplete,
    isNameRequired,
  });

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isLoading || isProcessingAuth) {
    return (
      <AuthGateLoadingCard
        title="Preparing your workspace"
        description="We are syncing your memberships so you land in the right academy."
        message="Hang tight—your onboarding data is loading."
      />
    );
  }

  if (scenario.kind === 'platform-admin') {
    return <Navigate to="/platform" replace />;
  }

  if (scenario.kind === 'ready') {
    return <Navigate to="/dashboard" replace />;
  }

  if (scenario.kind !== 'onboarding') {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AuthShell contentWidth={AUTH_SHELL_WIDTH}>
      <OnboardingFlow
        requiresFullName={scenario.requiresFullName}
        requiresTargets={scenario.requiresTargets}
        role={scenario.role}
        fullName={userPreferences?.fullName ?? null}
        targetExamId={userPreferences?.targetExamId ?? null}
        targetLevelId={userPreferences?.targetLevelId ?? null}
        userEmail={user.email ?? null}
        onSignOut={async () => {
          const { error } = await logout();
          if (error) {
            throw error;
          }
        }}
        onPreferencesUpdated={() => refreshUserProfile()}
      />
    </AuthShell>
  );
}
