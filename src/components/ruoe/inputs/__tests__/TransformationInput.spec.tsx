import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { TransformationInput } from '../TransformationInput';
import type { KeywordTransformationWindow } from '@/types/ruoe';

const renderKeywordInput = (windowSpec: KeywordTransformationWindow) => {
  const handleChange = vi.fn();
  render(
    <TransformationInput
      keyword="FORWARD"
      value=""
      onChange={handleChange}
      isEvaluated={false}
      wordWindow={windowSpec}
      explanation={null}
      correctAnswers={[]}
    />,
  );
  return { handleChange };
};

describe('TransformationInput keyword transformation warnings', () => {
  const b2Window = { level: 'B2' as const, min: 2, max: 5 };

  it('warns when the answer exceeds the maximum word count', () => {
    renderKeywordInput(b2Window);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'look forward to seeing you tomorrow' } }); // 7 words

    expect(screen.getByText('Use no more than 5 words, including the key word.')).toBeTruthy();
  });

  it('warns when the answer is shorter than the minimum word count', () => {
    renderKeywordInput(b2Window);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'looking' } });

    expect(screen.getByText('Use at least 2 words, including the key word.')).toBeTruthy();
  });
});

describe('TransformationInput word formation fallback', () => {
  const handleChange = vi.fn();

  beforeEach(() => {
    handleChange.mockClear();
  });

  it('warns when the derived word matches the root word', () => {
    render(
      <TransformationInput
        rootWord="INSPIRE"
        value="inspire"
        onChange={handleChange}
        isEvaluated={false}
        explanation={null}
        correctAnswers={[]}
      />,
    );

    expect(screen.getByText('Use a different form from the root word.')).toBeTruthy();
  });
});
