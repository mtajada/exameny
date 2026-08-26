import { Navigate, useLocation } from 'react-router-dom';
import React from 'react';

import { useAuth } from '@/contexts/useAuth';
import {
  deriveGuardScenario,
  needsAuthFallback,
  needsProfileSetupRedirect,
} from '@/components/auth/guardState';
import { AuthGateLoadingCard } from '@/components/auth/AuthGateLoadingCard';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const {
    user,
    isLoading,
    isProcessingAuth,
    isPlatformAdmin,
    memberships,
    membershipsInactive,
    activeAcademyId,
    userPreferences,
    role,
    isProfileComplete,
    isNameRequired,
  } = useAuth();
  const location = useLocation();

  if (isLoading || isProcessingAuth) {
    return <AuthGateLoadingCard />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

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

  if (needsProfileSetupRedirect(scenario) && location.pathname !== '/profile-setup') {
    return <Navigate to="/profile-setup" state={{ from: location }} replace />;
  }

  if (needsAuthFallback(scenario) && location.pathname !== '/auth') {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
