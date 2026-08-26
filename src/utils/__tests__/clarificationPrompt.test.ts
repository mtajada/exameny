import { describe, expect, it } from 'vitest';
import { buildClarificationPrompt } from '@/utils/ruoe-clarification-prompt';
import { ClarificationAnswerDetail, ClarificationRequestContext } from '@/types/ruoe';

const makeDetail = (detail: Partial<ClarificationAnswerDetail>): ClarificationAnswerDetail => ({
  raw: detail.raw ?? null,
  letter: detail.letter ?? null,
  text: detail.text ?? null,
});

const baseContext: ClarificationRequestContext = {
  taskCode: 'B2_READ_MULTIPLE_MATCHING',
  taskName: 'B2 Reading Part 7',
  taskTypeId: 42,
  levelId: 2,
  examTypeId: 8,
  exerciseTitle: 'Matching Statements to Texts',
  question: {
    questionId: 10,
    order: 3,
    displayOrder: 4,
    questionText: 'Which text mentions community fundraising?',
    originalSentence: null,
    transformationSentence: null,
  },
  studentAnswer: makeDetail({ raw: 'C', letter: 'C', text: 'Text C - The volunteers organised a fair.' }),
  correctAnswers: [makeDetail({ raw: 'B', letter: 'B', text: 'Text B - The school raised money for charity.' })],
  studentAnswerStatus: 'incorrect',
  correctAnswerExplanation: 'Text B explicitly describes the charity fundraiser.',
  correctAnswerAdditionalNotes: [],
  incorrectAnswerFeedback: 'Option C focuses on the volunteers, not the fundraising effort.',
  wasCorrect: false,
};

describe('buildClarificationPrompt', () => {
  it('includes metadata, rationales, and incorrect feedback', () => {
    const context: ClarificationRequestContext = {
      ...baseContext,
      correctAnswers: [
        makeDetail({ letter: 'B', text: 'Text B - The school raised money for charity.' }),
        makeDetail({ letter: 'D', text: 'Text D - The neighbourhood set up a donation drive.' }),
      ],
      correctAnswerAdditionalNotes: ['Text D highlights another community-led fundraiser.'],
    };

    const prompt = buildClarificationPrompt(context);

    expect(prompt).toContain('Task: B2 Reading Part 7 (Code B2_READ_MULTIPLE_MATCHING | Level 2 | Exam 8)');
    expect(prompt).toContain('Question 4');
    expect(prompt).toContain('Prompt: Which text mentions community fundraising?');
    expect(prompt).toContain('Accepted answer(s): B - Text B - The school raised money for charity., D - Text D - The neighbourhood set up a donation drive.');
    expect(prompt).toContain('Student answer: "C - Text C - The volunteers organised a fair."');
    expect(prompt).toContain('Correct answer insight:');
    expect(prompt).toContain('- Text B explicitly describes the charity fundraiser.');
    expect(prompt).toContain('- Text D highlights another community-led fundraiser.');
    expect(prompt).toContain('Why your answer may be incorrect:');
    expect(prompt).toContain('- Option C focuses on the volunteers, not the fundraising effort.');
    expect(prompt).toContain('Please explain why my answer is incorrect compared to the correct one and share additional guidance.');
  });

  it('notes when the learner leaves the answer blank', () => {
    const context: ClarificationRequestContext = {
      ...baseContext,
      studentAnswer: makeDetail({ raw: '', letter: null, text: null }),
      studentAnswerStatus: 'blank',
      incorrectAnswerFeedback: null,
    };

    const prompt = buildClarificationPrompt(context);

    expect(prompt).toContain('Student answer: "(blank response)"');
    expect(prompt).toContain('Your answer was left blank.');
    expect(prompt).toContain('Please explain the correct answer and outline how to approach this question.');
  });

  it('falls back to letter notes when no option text is available', () => {
    const context: ClarificationRequestContext = {
      ...baseContext,
      correctAnswers: [makeDetail({ letter: 'A', text: null, raw: 'A' })],
      correctAnswerExplanation: null,
      correctAnswerAdditionalNotes: [],
      incorrectAnswerFeedback: null,
    };

    const prompt = buildClarificationPrompt(context);

    expect(prompt).toContain('Accepted answer(s): A (no associated text)');
  });

  it('uses option feedback when explanation text is missing', () => {
    const context: ClarificationRequestContext = {
      ...baseContext,
      correctAnswerExplanation: null,
      correctAnswerAdditionalNotes: ['The correct option signals a reassessment of the policy.'],
      incorrectAnswerFeedback: null,
    };

    const prompt = buildClarificationPrompt(context);

    expect(prompt).toContain('Correct answer insight:');
    expect(prompt).toContain('- The correct option signals a reassessment of the policy.');
  });
});
