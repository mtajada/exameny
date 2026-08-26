import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SpeakingPracticePage from '../SpeakingPracticePage';

describe('SpeakingPracticePage public demo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with synthetic fixtures without making a remote request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(
      <MemoryRouter>
        <SpeakingPracticePage demoMode />
      </MemoryRouter>,
    );

    expect(screen.getByText('Local synthetic demo')).toBeInTheDocument();
    expect(screen.getByLabelText('Scenario')).toHaveValue('1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start speaking rehearsal' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking rehearsal' }));

    expect(await screen.findByText('How this rehearsal works')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
