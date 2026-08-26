import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { OnboardingFlow } from '@/components/auth/onboarding/OnboardingFlow';
import { saveUserPreferences } from '@/lib/auth/saveUserPreferences';

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/auth/onboarding/hooks', () => ({
  useExamOptions: () => ({ data: [{ id: 1, name: 'B2' }], isLoading: false }),
  useExamLevels: () => ({ data: [{ id: 10, code: 'B2', name: 'Upper B2' }], isLoading: false }),
}));

vi.mock('@/lib/auth/saveUserPreferences', () => ({
  saveUserPreferences: vi.fn(),
}));

const saveUserPreferencesMock = vi.mocked(saveUserPreferences);

describe('OnboardingFlow', () => {
  beforeEach(() => {
    saveUserPreferencesMock.mockReset();
  });

  it('surfaces backend error metadata when name submission fails', async () => {
    saveUserPreferencesMock.mockRejectedValue({
      message: 'ROLE conflict detected',
      code: 'ROLE_CONFLICT',
      requestId: 'req-onboarding-name',
      status: 400,
      details: { current_role: 'student', requested_role: 'teacher' },
    });

    render(
      <OnboardingFlow
        requiresFullName
        requiresTargets={false}
        role="teacher"
        fullName=""
        targetExamId={null}
        targetLevelId={null}
        onPreferencesUpdated={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Teacher Name' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));

    await waitFor(() => expect(saveUserPreferencesMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/This account is already linked to a student profile\. Sign in with another account to access as teacher/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Error code: ROLE_CONFLICT/i)).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-onboarding-name/i)).toBeInTheDocument();
  });

  it('keeps request IDs visible when target preference submission fails without a code', async () => {
    saveUserPreferencesMock.mockRejectedValue({
      message: 'Validation failed',
      code: null,
      requestId: 'req-target-error',
      status: 400,
      details: null,
    });

    render(
      <OnboardingFlow
        requiresFullName={false}
        requiresTargets
        role="student"
        fullName="Ana"
        targetExamId={1}
        targetLevelId={10}
        onPreferencesUpdated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));

    await waitFor(() => expect(saveUserPreferencesMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/We couldn't save your onboarding details\. Try again or contact your academy administrator\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-target-error/)).toBeInTheDocument();
  });

  it('disables actions with static copy while preferences save is in progress', async () => {
    type SaveResponse = Awaited<ReturnType<typeof saveUserPreferences>>;

    let resolveSave!: (value: SaveResponse) => void;
    const deferredSave = new Promise<SaveResponse>((resolve) => {
      resolveSave = resolve;
    });
    saveUserPreferencesMock.mockImplementation(() => deferredSave);

    render(
      <OnboardingFlow
        requiresFullName
        requiresTargets={false}
        role="teacher"
        fullName=""
        targetExamId={null}
        targetLevelId={null}
        onPreferencesUpdated={vi.fn()}
      />,
    );

    const submitButton = screen.getByRole('button', { name: /Save and continue/i });
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Teacher Name' } });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(submitButton.textContent).toBe('Saving…');
    expect(submitButton.querySelector('svg')).toBeNull();

    await act(async () => {
      resolveSave({
        user_id: 'user-1',
        full_name: 'Teacher Name',
        target_exam_id: null,
        target_level_id: null,
        active_academy_id: null,
        is_initial_setup_completed: true,
        source: 'initial_setup',
        request_id: 'req-in-flight',
        duration_ms: 0,
        metadata_payload: null,
        should_refresh_session: false,
      });
      await deferredSave;
    });
  });

  it('shows the signed-in email and allows signing out', async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);

    render(
      <OnboardingFlow
        requiresFullName
        requiresTargets={false}
        role="student"
        fullName=""
        targetExamId={null}
        targetLevelId={null}
        userEmail="student@example.com"
        onSignOut={onSignOut}
        onPreferencesUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText(/Signed in as/i)).toHaveTextContent('student@example.com');

    const signOutButton = screen.getByRole('button', { name: /Sign out/i });
    fireEvent.click(signOutButton);

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
