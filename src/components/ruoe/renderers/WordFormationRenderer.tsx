import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { CopyToClipboardButton } from '@/components/ui/copy-to-clipboard-button';
import { RuoEQuestion } from '@/types/ruoe';

interface WordFormationRendererProps {
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

export const WordFormationRenderer: React.FC<WordFormationRendererProps> = ({
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
  const rootWord = question.question_text;
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
    const baseClass = 'gap-placeholder inline-block px-3 py-2 mx-1 rounded-lg border-2 cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] min-w-[100px] text-center';
    const status = getGapStatus();
    switch (status) {
      case 'active':
        return `${baseClass} border-[#2563EB] bg-[#EFF6FF] text-[#1E40AF] ring-2 ring-[#DBEAFE] border-solid`;
      case 'answered':
        return `${baseClass} border-[#10B981] bg-[#ECFDF5] text-[#047857] hover:border-[#059669] border-dashed`;
      case 'correct':
        return `${baseClass} border-[#10B981] bg-[#D1FAE5] text-[#065F46] cursor-not-allowed border-solid shadow-sm`;
      case 'incorrect':
        return `${baseClass} border-[#EF4444] bg-[#FEE2E2] text-[#DC2626] cursor-not-allowed border-solid shadow-sm`;
      case 'unanswered-evaluated':
        return `${baseClass} border-[#D1D5DB] bg-[#F3F4F6] text-[#6B7280] cursor-not-allowed border-solid`;
      case 'evaluating':
        return `${baseClass} border-[#F59E0B] bg-[#FEF3C7] text-[#D97706] cursor-not-allowed animate-pulse border-dashed`;
      default:
        return `${baseClass} border-[#D1D5DB] hover:border-[#2563EB] hover:bg-[#F9FAFB] text-[#6B7280] border-dashed`;
    }
  };

  const handleGapClick = () => {
    if (!isEvaluating) {
      onGapClick(question.id);
    }
  };

  const focusAdjacentGap = (targetIndex: number) => {
    if (targetIndex >= 0 && targetIndex < questions.length) {
      const sortedQuestions = [...questions].sort((a, b) => a.displayOrder - b.displayOrder);
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
        return <CheckCircle className="h-3 w-3 text-[#10B981] ml-1" />;
      case 'incorrect':
        return <XCircle className="h-3 w-3 text-[#EF4444] ml-1" />;
      case 'unanswered-evaluated':
        return <AlertCircle className="h-3 w-3 text-[#6B7280] ml-1" />;
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
            <div className="font-semibold text-[#10B981] mb-1">✓ Correct!</div>
            <div>Your answer: <span className="font-medium">{userAnswer}</span></div>
            <div>Root word: <span className="font-medium text-[#2563EB]">{rootWord}</span></div>
            {renderTooltipExplanation()}
          </div>
        );
      case 'incorrect':
        return (
          <div className="text-sm">
            <div className="font-semibold text-[#EF4444] mb-1">✗ Incorrect</div>
            <div>Your answer: <span className="font-medium">{userAnswer}</span></div>
            <div>Correct answer: <span className="font-medium text-[#10B981]">{correctAnswers.join(', ')}</span></div>
            <div>Root word: <span className="font-medium text-[#2563EB]">{rootWord}</span></div>
            {renderTooltipExplanation()}
          </div>
        );
      case 'unanswered-evaluated':
        return (
          <div className="text-sm">
            <div className="font-semibold text-[#6B7280] mb-1">No answer provided</div>
            <div>Correct answer: <span className="font-medium text-[#10B981]">{correctAnswers.join(', ')}</span></div>
            <div>Root word: <span className="font-medium text-[#2563EB]">{rootWord}</span></div>
            {renderTooltipExplanation()}
          </div>
        );
      default:
        return null;
    }
  };

  const tooltipContent = getTooltipContent();

  const gapButton = (
    <div key={`word-formation-gap-${question.id}`} className="inline-flex flex-col items-center mx-2">
      <button
        ref={(el) => (gapRefs.current[question.id] = el)}
        type="button"
        className={getGapClassName()}
        onClick={handleGapClick}
        onKeyDown={handleKeyDown}
        disabled={isEvaluating}
        aria-label={`Gap ${question.displayOrder}, root word ${rootWord}${userAnswer ? `, answered: ${userAnswer}` : ', not answered'}`}
        aria-describedby={`gap-${question.id}-description`}
        aria-pressed={isActive}
        tabIndex={0}
      >
        <span className="flex items-center justify-center">
          {userAnswer || '________'}
          {getStatusIcon()}
        </span>
      </button>

      <div className="mt-1 px-2 py-1 bg-[#2563EB] text-white text-xs rounded-md font-medium shadow-sm">
        ({rootWord})
      </div>

      <span id={`gap-${question.id}-description`} className="sr-only">
        {isEvaluated
          ? `Gap ${question.displayOrder} evaluation complete: ${getGapStatus()}. Root word: ${rootWord}`
          : userAnswer
            ? `Gap ${question.displayOrder} answered with: ${userAnswer}. Root word: ${rootWord}. Click to modify.`
            : `Gap ${question.displayOrder} not answered. Root word: ${rootWord}. Click to answer.`
        }
      </span>
    </div>
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
