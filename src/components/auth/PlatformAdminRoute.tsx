import { Navigate, useLocation } from 'react-router-dom';
import React from 'react';
import { useAuth } from '@/contexts/useAuth';
import { AuthGateLoadingCard } from '@/components/auth/AuthGateLoadingCard';

interface PlatformAdminRouteProps {
  children: React.ReactNode;
}

export const PlatformAdminRoute: React.FC<PlatformAdminRouteProps> = ({ children }) => {
  const { user, isLoading, isProcessingAuth, isPlatformAdmin } = useAuth();
  const location = useLocation();

  if (isLoading || isProcessingAuth) {
    return <AuthGateLoadingCard />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
