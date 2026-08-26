import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { MultipleChoiceInputProps } from '@/types/ruoe';
import { getDisplayLabel, getAnswerValue, findOptionByAnswerValue } from '@/utils/ruoe-task-logic';
import { Button } from '@/components/ui/button';
import { CopyToClipboardButton } from '@/components/ui/copy-to-clipboard-button';
import { ClarificationCallout } from '@/components/ruoe/inputs/ClarificationCallout';

export const MultipleChoiceInput: React.FC<MultipleChoiceInputProps> = ({
  options,
  selectedAnswer,
  onAnswerSelect,
  isEvaluated,
  taskCode,
  questionLevelExplanationForCorrectOption,
  clarificationContext,
  onRequestClarification,
  isChatBusy,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Calculate selected option ID directly from current props
  const selectedOption = findOptionByAnswerValue(taskCode, options, selectedAnswer) || null;
  const selectedOptionId = selectedOption?.id ?? null;

  // Focus management for keyboard navigation
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < options.length) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, options.length]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!isEvaluated) {
          const opt = options[index];
          onAnswerSelect(getAnswerValue(taskCode, opt));
        }
        break;
      case 'Escape':
        event.preventDefault();
        setFocusedIndex(-1);
        break;
    }
  };

  const handleOptionClick = (option: MultipleChoiceInputProps['options'][0]) => {
    if (!isEvaluated) {
      onAnswerSelect(getAnswerValue(taskCode, option));
    }
  };

  const doesAnswerMatchOption = (answer: string | null, option: MultipleChoiceInputProps['options'][0]) => {
    if (!answer) return false;
    const normalized = answer.trim();
    return (
      getAnswerValue(taskCode, option) === normalized ||
      option.option_letter?.trim().toUpperCase() === normalized.toUpperCase()
    );
  };

  const getOptionStatus = (option: MultipleChoiceInputProps['options'][0]) => {
    if (!isEvaluated) {
      return doesAnswerMatchOption(selectedAnswer, option) ? 'selected' : 'unselected';
    }
    // In evaluation mode, show correct/incorrect status
    if (doesAnswerMatchOption(selectedAnswer, option)) {
      return option.is_correct ? 'correct' : 'incorrect';
    }

    return option.is_correct ? 'correct-unselected' : 'unselected';
  };

  const getOptionClassName = (option: MultipleChoiceInputProps['options'][0]) => {
    const baseClass = 'w-full p-3 text-left rounded-lg border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB]';
    const status = getOptionStatus(option);

    let statusClass = '';
    switch (status) {
      case 'selected':
        statusClass = 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm';
        break;
      case 'correct':
        statusClass = 'border-[#10B981] bg-green-50 text-green-900';
        break;
      case 'incorrect':
        statusClass = 'border-[#EF4444] bg-red-50 text-red-900';
        break;
      case 'correct-unselected':
        statusClass = 'border-green-300 bg-green-25 text-green-800';
        break;
      default:
        statusClass = 'border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-[#F9FAFB]';
    }

    const disabledClass = isEvaluated ? 'cursor-not-allowed' : 'cursor-pointer';

    return `${baseClass} ${statusClass} ${disabledClass}`;
  };

  const isPlaceholderFeedback = (text?: string | null) => {
    if (!text) return false;
    const norm = text.trim().toLowerCase();
    return norm === 'global option for exercise with shared option set.';
  };

  const getOptionIcon = (option: MultipleChoiceInputProps['options'][0]) => {
    if (!isEvaluated) return null;

    const status = getOptionStatus(option);
    if (status === 'correct') {
      return <CheckCircle className="h-5 w-5 text-green-600 ml-2" />;
    }
    if (status === 'incorrect') {
      return <XCircle className="h-5 w-5 text-red-600 ml-2" />;
    }
    if (status === 'correct-unselected') {
      return <CheckCircle className="h-5 w-5 text-green-500 ml-2" />;
    }
    return null;
  };

  const getDisplayText = (option: MultipleChoiceInputProps['options'][0]) => getDisplayLabel(taskCode, option);

  const canRequestClarification = Boolean(
    isEvaluated &&
    clarificationContext &&
    onRequestClarification &&
    clarificationContext.wasCorrect === false
  );

  const clarificationLabel = isChatBusy ? 'Opening chat...' : 'Ask AI for clarification';

  const handleClarificationClick = () => {
    if (!canRequestClarification || !clarificationContext || !onRequestClarification || isChatBusy) {
      return;
    }
    onRequestClarification(clarificationContext);
  };

  return (
    <div
      className="space-y-3 pt-2"
      role="radiogroup"
      aria-label="Multiple choice options"
    >
      {options.map((option, index) => {
        const raw = option.feedback?.trim();
        let explanation: string | null = null;
        if (raw && !isPlaceholderFeedback(raw)) {
          const trimmed = raw.trim();
          explanation = trimmed.length > 0 ? trimmed : null;
        } else if (option.is_correct && questionLevelExplanationForCorrectOption) {
          const trimmed = questionLevelExplanationForCorrectOption.trim();
          explanation = trimmed.length > 0 ? trimmed : null;
        }
        const explanationId = explanation ? `option-${option.id}-feedback` : undefined;

        return (
          <div key={option.id} className="space-y-2">
            <button
              ref={(el) => (optionRefs.current[index] = el)}
              type="button"
              className={getOptionClassName(option)}
              onClick={() => handleOptionClick(option)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={isEvaluated}
              role="radio"
              aria-checked={selectedOptionId === option.id}
              aria-describedby={explanationId}
              aria-label={`Option ${option.option_letter}: ${getDisplayText(option)}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="mr-3 text-lg font-semibold">
                    {option.option_letter}.
                  </span>
                  <span className="text-sm sm:text-base">
                    {getDisplayText(option)}
                  </span>
                </div>
                {getOptionIcon(option)}
              </div>
            </button>

            {isEvaluated && explanation && (
              <div
                id={explanationId}
                className="rounded-lg border border-slate-200 bg-slate-50/90 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Explanation
                  </span>
                  <CopyToClipboardButton
                    value={explanation}
                    tooltip="Copy explanation"
                    copiedTooltip="Copied"
                    ariaLabel={`Copy explanation for option ${option.option_letter}`}
                    className="h-7 w-7"
                  />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {explanation}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {canRequestClarification && (
        <ClarificationCallout helperText="Still unsure about this option?">
          <Button
            type="button"
            variant="support"
            size="compact"
            className="gap-1.5 font-medium tracking-tight sm:ml-auto"
            onClick={handleClarificationClick}
            disabled={Boolean(isChatBusy)}
            aria-label="Ask the AI assistant to explain why your answer is incorrect"
          >
            {isChatBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" aria-hidden="true" />
            ) : (
              <HelpCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            )}
            {clarificationLabel}
          </Button>
        </ClarificationCallout>
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite">
        {selectedOptionId && !isEvaluated && (() => {
          const opt = options.find(o => o.id === selectedOptionId);
          return opt ? `Selected option ${getDisplayText(opt)}` : '';
        })()}
        {isEvaluated && selectedAnswer && (() => {
          const opt = findOptionByAnswerValue(taskCode, options, selectedAnswer);
          if (!opt) return '';
          const label = getDisplayText(opt);
          return `Your answer ${label} is ${opt.is_correct ? 'correct' : 'incorrect'}`;
        })()}
      </div>
    </div>
  );
};
