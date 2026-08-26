import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScoreModal } from './ScoreModal';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('ScoreModal', () => {
  it('shows the attempt label when attemptNumber is provided', () => {
    render(
      <ScoreModal
        isOpen
        onClose={vi.fn()}
        score={85}
        maxScore={100}
        scorePoints={30}
        maxScorePoints={40}
        pointsPerQuestion={1}
        questionsCorrect={15}
        totalQuestions={20}
        exerciseTitle="C1 Use of English Part 2"
        attemptNumber={2}
      />,
    );

    expect(screen.getByText(/Attempt #2/i)).toBeTruthy();
  });

  it('hides the retry button when no callback is provided', () => {
    render(
      <ScoreModal
        isOpen
        onClose={vi.fn()}
        score={60}
        maxScore={100}
        scorePoints={20}
        maxScorePoints={40}
        pointsPerQuestion={2}
        questionsCorrect={10}
        totalQuestions={20}
        exerciseTitle="B2 Reading Part 5"
      />,
    );

    expect(screen.queryByRole('button', { name: /retry exercise/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /repetir ejercicio/i })).toBeNull();
  });

  it('calls onRetry and closes the modal when retry succeeds', async () => {
    const onClose = vi.fn();
    const deferred = createDeferred<void>();
    const onRetry = vi.fn().mockReturnValue(deferred.promise);

    render(
      <ScoreModal
        isOpen
        onClose={onClose}
        score={75}
        maxScore={100}
        scorePoints={24}
        maxScorePoints={36}
        pointsPerQuestion={1}
        questionsCorrect={18}
        totalQuestions={24}
        exerciseTitle="C1 Reading Part 6"
        attemptNumber={3}
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByRole('button', { name: /retry exercise/i });
    fireEvent.click(retryButton);

    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    expect((retryButton as HTMLButtonElement).disabled).toBe(true);

    deferred.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('surfaces an error message when retry fails', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('Cannot restart attempt'));

    render(
      <ScoreModal
        isOpen
        onClose={vi.fn()}
        score={90}
        maxScore={100}
        scorePoints={30}
        maxScorePoints={30}
        pointsPerQuestion={1}
        questionsCorrect={30}
        totalQuestions={30}
        exerciseTitle="C1 Use of English Part 4"
        attemptNumber={1}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry exercise/i }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent ?? '').toContain('Cannot restart attempt');
  });
});
