import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { TextInput } from '../TextInput';

describe('TextInput explanation copy affordance', () => {
  const onChange = vi.fn();
  let clipboardWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange.mockReset();
    clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: clipboardWrite },
      configurable: true,
    });
  });

  it('copies the trimmed explanation text when the copy button is pressed', async () => {
    render(
      <TextInput
        value=""
        onChange={onChange}
        isEvaluated
        userAnswer="answer"
        correctAnswers={['ANSWER']}
        wasCorrect={false}
        explanation="  Because the phrasal verb requires an object.  "
      />,
    );

    const copyButton = screen.getByLabelText('Copy explanation');

    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(clipboardWrite).toHaveBeenCalledWith('Because the phrasal verb requires an object.');
  });

  it('omits the copy button when no explanation text is provided', () => {
    render(
      <TextInput
        value=""
        onChange={onChange}
        isEvaluated
        userAnswer="answer"
        correctAnswers={['ANSWER']}
        wasCorrect={false}
        explanation={null}
      />,
    );

    expect(screen.queryByLabelText('Copy explanation')).toBeNull();
  });
});
