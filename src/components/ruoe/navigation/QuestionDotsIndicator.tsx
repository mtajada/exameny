import React from 'react';

// Backward-compatible props: keep totalQuestions while allowing questionIds or questions
// so callers that haven't been updated (e.g., backup files) won't break.
interface QuestionDotsProps {
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: Record<number, string>;
  onQuestionSelect: (index: number) => void;
  isEvaluated: boolean;
  evaluationResults?: Record<number, boolean>;
  // New optional props for precise mapping by question id
  questionIds?: number[];
  questions?: { id: number }[];
}

export const QuestionDotsIndicator: React.FC<QuestionDotsProps> = ({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  onQuestionSelect,
  isEvaluated,
  evaluationResults = {},
  questionIds,
  questions,
}) => {
  const getQuestionIdForIndex = (index: number): number => {
    if (questions && questions[index]) return questions[index].id as number;
    if (questionIds && questionIds[index] !== undefined) return questionIds[index] as number;
    // Fallback: legacy assumption where id === index + 1
    return index + 1;
  };

  const getDotState = (index: number) => {
    const qId = getQuestionIdForIndex(index);
    const isCurrent = index === currentQuestionIndex;
    const hasAnswer = !!(answeredQuestions[qId]?.trim());
    const hasEvaluation = evaluationResults[qId] !== undefined;
    const isCorrect = evaluationResults[qId] === true;

    // Post-evaluation takes precedence over other states
    if (isEvaluated && hasEvaluation) {
      return { state: isCorrect ? 'correct' : 'incorrect', qId, isCurrent, hasAnswer } as const;
    }
    return { state: hasAnswer ? 'answered' : 'unanswered', qId, isCurrent, hasAnswer } as const;
  };

  const getDotClass = (index: number) => {
    const { state, isCurrent } = getDotState(index);
    const base = 'rounded-full transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-offset-1 hover:scale-105';
    const size = 'w-2.5 h-2.5 md:w-3 md:h-3'; // visual dot smaller; click area ensured via min size

    // Colors (Exameny design):
    // - answered/current pre-eval: blue #2563EB
    // - unanswered pre-eval: white with gray border
    // - post-eval: green/red fill
    let color = '';
    switch (state) {
      case 'correct':
        color = 'bg-[#10B981] border border-[#10B981]';
        break;
      case 'incorrect':
        color = 'bg-[#EF4444] border border-[#EF4444]';
        break;
      case 'answered':
        color = 'bg-[#2563EB] border border-[#2563EB]';
        break;
      default:
        color = 'bg-white border border-[#D1D5DB]';
    }

    const emphasis = isCurrent ? 'ring-1 ring-[#93C5FD]' : '';
    return `${base} ${size} ${color} ${emphasis}`;
  };

  const getDotAriaLabel = (index: number) => {
    const qNumber = index + 1;
    const { state, isCurrent } = getDotState(index);
    if (state === 'correct' || state === 'incorrect') {
      return `Question ${qNumber}, ${state}${isCurrent ? ', current' : ''}`;
    }
    const answeredLabel = state === 'answered' ? 'answered' : 'not answered';
    return `Question ${qNumber}${isCurrent ? ', current' : ''}, ${answeredLabel}`;
  };

  return (
    <div
      className="flex items-center justify-center gap-2 py-1"
      role="navigation"
      aria-label="Question navigation"
    >
      {Array.from({ length: totalQuestions }, (_, index) => (
        <button
          key={index}
          onClick={() => onQuestionSelect(index)}
          className={`${getDotClass(index)} touch-target`}
          style={{ minWidth: '24px', minHeight: '24px' }}
          aria-label={getDotAriaLabel(index)}
          aria-current={index === currentQuestionIndex ? 'step' : undefined}
          title={getDotAriaLabel(index)}
        />
      ))}

      {/* Screen reader status */}
      <div className="sr-only" aria-live="polite">
        Question {currentQuestionIndex + 1} of {totalQuestions}
        {isEvaluated && ', evaluation complete'}
      </div>
    </div>
  );
};
