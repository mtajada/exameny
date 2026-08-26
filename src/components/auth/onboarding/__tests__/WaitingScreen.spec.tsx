import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import type { MembershipSummary } from '@/contexts/AuthContextBase';

import { WaitingScreen } from '../WaitingScreen';

const inactiveMemberships: MembershipSummary[] = [
  {
    membershipId: 1,
    academyId: 101,
    academyName: 'Oxford Academy',
    role: 'student',
    status: 'inactive',
    subscriptionStartDate: null,
    subscriptionEndDate: null,
  },
];

describe('WaitingScreen', () => {
  test('renders English copy for the no-academy variant', () => {
    render(<WaitingScreen variant="no-academy" membershipsInactive={[]} onRetry={vi.fn()} />);

    expect(screen.getByText("You don't have any active academies yet.")).toBeInTheDocument();
    expect(screen.getByText('Your academy has not granted access yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('renders English copy for the inactive-only variant and exposes logout', () => {
    render(
      <WaitingScreen
        variant="inactive-only"
        membershipsInactive={inactiveMemberships}
        onRetry={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByText('Your access is temporarily paused.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByText('Oxford Academy')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});

test('keeps CTA labels stable with disabled loading states and no spinners', () => {
  render(
    <WaitingScreen
      variant="inactive-only"
      membershipsInactive={inactiveMemberships}
      onRetry={vi.fn()}
      onLogout={vi.fn()}
      isRetrying
      isLoggingOut
    />,
  );

  const retryButton = screen.getByRole('button', { name: 'Retry' });
  expect(retryButton).toBeDisabled();
  expect(retryButton.textContent).toBe('Retry');
  expect(retryButton.querySelector('svg')).toBeNull();

  const logoutButton = screen.getByRole('button', { name: 'Sign out' });
  expect(logoutButton).toBeDisabled();
  expect(logoutButton.textContent).toBe('Sign out');
  expect(logoutButton.querySelector('svg')).toBeNull();
});
