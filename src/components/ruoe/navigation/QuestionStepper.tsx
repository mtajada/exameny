import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { QuestionDotsIndicator } from '@/components/ruoe/navigation/QuestionDotsIndicator';
import { RuoEQuestion } from '@/types/ruoe';
import { Button } from '@/components/ui/button';

interface QuestionStepperProps {
  questions: RuoEQuestion[];
  currentQuestionIndex: number;
  answeredById: Record<number, string>;
  evaluationById?: Record<number, boolean>;
  isEvaluated: boolean;
  onSelect: (index: number) => void;
}

export const QuestionStepper: React.FC<QuestionStepperProps> = ({
  questions,
  currentQuestionIndex,
  answeredById,
  evaluationById = {},
  isEvaluated,
  onSelect,
}) => {
  const totalQuestions = questions.length;

  const handlePrev = useCallback(() => {
    if (currentQuestionIndex > 0) onSelect(currentQuestionIndex - 1);
  }, [currentQuestionIndex, onSelect]);

  const handleNext = useCallback(() => {
    if (currentQuestionIndex < totalQuestions - 1) onSelect(currentQuestionIndex + 1);
  }, [currentQuestionIndex, onSelect, totalQuestions]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  return (
    <div
      className="flex items-center justify-center gap-2"
      role="navigation"
      aria-label="Question stepper"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full h-9 w-9"
        onClick={handlePrev}
        disabled={currentQuestionIndex === 0}
        aria-label="Previous question"
        title="Previous question"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <QuestionDotsIndicator
        totalQuestions={totalQuestions}
        currentQuestionIndex={currentQuestionIndex}
        answeredQuestions={answeredById}
        onQuestionSelect={onSelect}
        isEvaluated={isEvaluated}
        evaluationResults={evaluationById}
        questions={questions}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full h-9 w-9"
        onClick={handleNext}
        disabled={currentQuestionIndex === totalQuestions - 1}
        aria-label="Next question"
        title="Next question"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
