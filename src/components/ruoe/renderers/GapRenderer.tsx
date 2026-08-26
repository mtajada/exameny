import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { CopyToClipboardButton } from '@/components/ui/copy-to-clipboard-button';
import { RuoEQuestion } from '@/types/ruoe';

interface GapRendererProps {
  question: RuoEQuestion;
  questionIndex: number;
  userAnswer?: string;
  isActive: boolean;
  isEvaluated: boolean;
  isEvaluating: boolean;
  evaluationResults?: Record<number, boolean>;
  onGapClick: (questionId: number) => void;
  questions: RuoEQuestion[];
  gapRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
}

export const GapRenderer: React.FC<GapRendererProps> = ({
  question,
  questionIndex,
  userAnswer,
  isActive,
  isEvaluated,
  isEvaluating,
  evaluationResults = {},
  onGapClick,
  questions,
  gapRefs,
}) => {
  const isAnswered = Boolean(userAnswer);
  const trimmedExplanation = question.explanation?.trim() || '';

  const renderTooltipExplanation = () => {
    if (!trimmedExplanation) return null;
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Explanation</span>
          <CopyToClipboardButton
            value={trimmedExplanation}
            tooltip="Copy explanation"
            copiedTooltip="Copied"
            ariaLabel="Copy explanation"
            className="h-6 w-6"
            disableTooltip
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {trimmedExplanation}
        </p>
      </div>
    );
  };

  const getGapStatus = () => {
    if (isEvaluated) {
      const isCorrect = evaluationResults[question.id];
      if (isAnswered) {
        return isCorrect ? 'correct' : 'incorrect';
      } else {
        return 'unanswered-evaluated';
      }
    }
    if (isEvaluating) {
      return 'evaluating';
    }
    if (isActive) {
      return 'active';
    }
    if (isAnswered) {
      return 'answered';
    }
    return 'unanswered';
  };

  const getGapClassName = () => {
    const baseClass = 'gap-placeholder inline-block px-[6px] py-0.5 mx-1 rounded-md border cursor-pointer transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-blue-500';
    const status = getGapStatus();
    switch (status) {
      case 'active':
        return `${baseClass} border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-300 border-solid`;
      case 'answered':
        return `${baseClass} border-green-400 bg-green-50 text-green-800 hover:border-green-500 border-dashed`;
      case 'correct':
        return `${baseClass} border-green-500 bg-green-100 text-green-900 cursor-not-allowed border-solid shadow-sm`;
      case 'incorrect':
        return `${baseClass} border-red-500 bg-red-100 text-red-900 cursor-not-allowed border-solid shadow-sm`;
      case 'unanswered-evaluated':
        return `${baseClass} border-gray-400 bg-gray-100 text-gray-700 cursor-not-allowed border-solid`;
      case 'evaluating':
        return `${baseClass} border-amber-400 bg-amber-50 text-amber-800 cursor-not-allowed animate-pulse border-dashed`;
      default:
        return `${baseClass} border-gray-400 hover:border-blue-400 hover:bg-blue-25 text-gray-600 border-dashed`;
    }
  };

  const handleGapClick = () => {
    if (!isEvaluating) {
      onGapClick(question.id);
    }
  };

  const focusAdjacentGap = (targetIndex: number) => {
    if (targetIndex >= 0 && targetIndex < questions.length) {
      const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
      const targetQuestion = sortedQuestions[targetIndex];
      if (targetQuestion && gapRefs.current[targetQuestion.id]) {
        gapRefs.current[targetQuestion.id]?.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleGapClick();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusAdjacentGap(questionIndex - 1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusAdjacentGap(questionIndex + 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAdjacentGap(0);
        break;
      case 'End':
        e.preventDefault();
        focusAdjacentGap(questions.length - 1);
        break;
    }
  };

  const getStatusIcon = () => {
    const status = getGapStatus();
    switch (status) {
      case 'correct':
        return <CheckCircle className="h-3 w-3 text-green-600 ml-1" />;
      case 'incorrect':
        return <XCircle className="h-3 w-3 text-red-600 ml-1" />;
      case 'unanswered-evaluated':
        return <AlertCircle className="h-3 w-3 text-gray-500 ml-1" />;
      default:
        return null;
    }
  };

  const getTooltipContent = () => {
    if (!isEvaluated) return null;
    const status = getGapStatus();
    const correctAnswers = question.correct_answers || [];

    switch (status) {
      case 'correct':
        return (
          <div className="text-sm">
            <div className="font-semibold text-green-600 mb-1">✓ Correct!</div>
            <div>Your answer: <span className="font-medium">{userAnswer}</span></div>
            {renderTooltipExplanation()}
          </div>
        );
      case 'incorrect':
        return (
          <div className="text-sm">
            <div className="font-semibold text-red-600 mb-1">✗ Incorrect</div>
            <div>Your answer: <span className="font-medium">{userAnswer}</span></div>
            <div>Correct answer: <span className="font-medium text-green-600">{correctAnswers.join(', ')}</span></div>
            {renderTooltipExplanation()}
          </div>
        );
      case 'unanswered-evaluated':
        return (
          <div className="text-sm">
            <div className="font-semibold text-gray-600 mb-1">No answer provided</div>
            <div>Correct answer: <span className="font-medium text-green-600">{correctAnswers.join(', ')}</span></div>
            {renderTooltipExplanation()}
          </div>
        );
      default:
        return null;
    }
  };

  const tooltipContent = getTooltipContent();

  const gapButton = (
    <button
      key={`gap-${question.id}`}
      ref={(el) => (gapRefs.current[question.id] = el)}
      type="button"
      className={getGapClassName()}
      onClick={handleGapClick}
      onKeyDown={handleKeyDown}
      disabled={isEvaluating}
      aria-label={`Gap ${question.displayOrder}${userAnswer ? `, answered: ${userAnswer}` : ', not answered'}`}
      aria-describedby={`gap-${question.id}-description`}
      aria-pressed={isActive}
      tabIndex={0}
    >
      <span className="flex items-center">
        {userAnswer || `(${question.displayOrder})`}
        {getStatusIcon()}
      </span>

      <span id={`gap-${question.id}-description`} className="sr-only">
        {isEvaluated
          ? `Gap ${question.displayOrder} evaluation complete: ${getGapStatus()}`
          : userAnswer
            ? `Gap ${question.displayOrder} answered with: ${userAnswer}. Click to modify.`
            : `Gap ${question.displayOrder} not answered. Click to answer.`
        }
      </span>
    </button>
  );

  if (tooltipContent) {
    return (
      <TooltipProvider key={`gap-${question.id}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            {gapButton}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return gapButton;
};
