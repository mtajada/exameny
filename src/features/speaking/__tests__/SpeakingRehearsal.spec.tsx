import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpeakingRehearsal } from '../SpeakingRehearsal';
import { DEMO_SPEAKING_PERSONAS, DEMO_SPEAKING_SCENARIOS } from '../demoCatalog';
import type { SpeakingSelection } from '../types';

const selection: SpeakingSelection = {
  persona: DEMO_SPEAKING_PERSONAS[0],
  scenario: DEMO_SPEAKING_SCENARIOS[0],
  useProfile: false,
  nuances: '',
};

describe('SpeakingRehearsal', () => {
  it('collects three typed answers and completes the local transcript', async () => {
    const onComplete = vi.fn().mockResolvedValue(true);
    let clock = 1_000;
    const now = () => {
      clock += 1_000;
      return clock;
    };

    render(
      <SpeakingRehearsal
        demoMode
        now={now}
        onComplete={onComplete}
        selection={selection}
      />,
    );

    for (const answer of [
      'We could organise a neighbourhood book exchange.',
      'Another option is a repair workshop because it is practical.',
      'I prefer the workshop, and the next step is to find volunteers.',
    ]) {
      fireEvent.change(screen.getByLabelText(/Speak aloud, then type/i), {
        target: { value: answer },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add answer' }));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Finish and save transcript' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const transcript = onComplete.mock.calls[0]?.[0];
    expect(transcript.source).toBe('typed-rehearsal');
    expect(transcript.turns).toHaveLength(7);
    expect(screen.getByText('Local demo completed')).toBeInTheDocument();
  });
});
