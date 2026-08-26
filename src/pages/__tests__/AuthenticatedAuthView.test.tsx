import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AuthenticatedAuthView } from '../AuthPage';
import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge';

describe('AuthenticatedAuthView', () => {
  test('shows the role conflict error card with request id', () => {
  const finalizeError: EdgeFunctionErrorPayload = {
    message:
      'This account is tied to a student profile. Sign in with another account to access as teacher or ask your academy to invite a different email.',
    code: 'ROLE_CONFLICT',
    requestId: 'req-456',
    status: 409,
    details: { current_role: 'student', requested_role: 'teacher' },
  };

    render(
      <AuthenticatedAuthView
        finalizeStatus="error"
        isProcessingAuth={false}
        lastFinalizeError={finalizeError}
        lastFinalizeRequestId="req-456"
        isPlatformAdmin={false}
        memberships={[]}
        membershipsInactive={[]}
        activeAcademyId={null}
        userPreferences={null}
        role="student"
        isProfileComplete={false}
        isNameRequired={false}
        onRetryFinalize={async () => {}}
        onSelectAcademy={async () => ({ error: null })}
        refreshUserProfile={async () => {}}
        onSignOut={async () => {}}
        isSigningOut={false}
      />,
    );

  expect(screen.getByText(/This account is tied to a student profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-456/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
