import React, { useState, useEffect, useRef, useId } from 'react';
import { CheckCircle, XCircle, AlertCircle, ArrowRight, HelpCircle, Loader2 } from 'lucide-react';
import { TransformationInputProps } from '@/types/ruoe';
import { Button } from '@/components/ui/button';
import { CopyToClipboardButton } from '@/components/ui/copy-to-clipboard-button';
import { ClarificationCallout } from '@/components/ruoe/inputs/ClarificationCallout';

export const TransformationInput: React.FC<TransformationInputProps> = ({
  rootWord,
  value,
  onChange,
  placeholder,
  isEvaluated,
  disabled = false,
  userAnswer,
  correctAnswers = [],
  wasCorrect,
  explanation,
  keyword,
  wordWindow,
  clarificationContext,
  onRequestClarification,
  isChatBusy,
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const [hasChanges, setHasChanges] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const componentId = useId();

  // Sync with external value changes
  useEffect(() => {
    if (value !== localValue && !hasChanges) {
      setLocalValue(value || '');
    }
  }, [value, localValue, hasChanges]);

  // Auto-focus when component mounts
  useEffect(() => {
    if (inputRef.current && !isEvaluated) {
      inputRef.current.focus();
    }
  }, [isEvaluated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    setHasChanges(true);
    // Debounce emit (300ms)
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      onChange(newValue);
      debounceRef.current = null;
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isEvaluated) {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

  const handleBlur = () => {
    setHasChanges(false);
    // Flush pending debounce on blur
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      onChange(localValue);
    }
  };

  const trimmedValue = localValue.trim();
  const words = trimmedValue ? trimmedValue.split(/\s+/) : [];
  const wordCount = trimmedValue ? words.length : 0;
  const characterCount = localValue.length;
  const minWords = wordWindow?.min ?? null;
  const maxWords = wordWindow?.max ?? null;
  const showRootWordWarning = Boolean(
    !wordWindow && rootWord && trimmedValue && trimmedValue.toLowerCase() === rootWord.toLowerCase(),
  );
  const showWordWarning =
    Boolean(
      wordWindow && !isEvaluated && (
        (wordCount > 0 && minWords !== null && wordCount < minWords) ||
        (maxWords !== null && wordCount > maxWords)
      ),
    );
  const showAnyWarning = showWordWarning || showRootWordWarning;

  let wordWarningMessage: string | null = null;
  if (showWordWarning && wordWindow) {
    if (maxWords !== null && wordCount > maxWords) {
      wordWarningMessage = `Use no more than ${maxWords} words, including the key word.`;
    } else if (minWords !== null && wordCount > 0 && wordCount < minWords) {
      wordWarningMessage = `Use at least ${minWords} words, including the key word.`;
    }
  }
  const rootWarningMessage = showRootWordWarning ? 'Use a different form from the root word.' : null;

  const warningMessage = wordWarningMessage ?? rootWarningMessage;

  const statsId = `${componentId}-stats`;
  const helpId = `${componentId}-help`;
  const warningId = `${componentId}-warning`;
  const describedBy = [statsId];
  if (!wordWindow) {
    describedBy.push(helpId);
  }
  if (warningMessage) {
    describedBy.push(warningId);
  }

  const getValidationStatus = () => {
    if (!isEvaluated || !localValue) return 'neutral';
    return 'neutral'; // Would be set by parent after evaluation
  };

  const getInputClassName = () => {
    const baseClass = 'w-full p-3 border-2 rounded-lg text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500';

    if (disabled || isEvaluated) {
      return `${baseClass} bg-gray-50 border-gray-300 cursor-not-allowed`;
    }

    if (showAnyWarning) {
      return `${baseClass} border-amber-400 bg-amber-50 text-amber-900 focus:border-amber-500 focus:ring-amber-300`;
    }

    const validationStatus = getValidationStatus();
    switch (validationStatus) {
      case 'correct':
        return `${baseClass} border-green-500 bg-green-50 text-green-900`;
      case 'incorrect':
        return `${baseClass} border-red-500 bg-red-50 text-red-900`;
      default:
        return `${baseClass} border-gray-300 focus:border-blue-500 hover:border-gray-400`;
    }
  };

  const canRequestClarification = Boolean(
    isEvaluated &&
    wasCorrect === false &&
    clarificationContext &&
    onRequestClarification
  );

  const clarificationLabel = isChatBusy ? 'Opening chat...' : 'Ask AI for clarification';

  const handleClarificationClick = () => {
    if (!canRequestClarification || !clarificationContext || !onRequestClarification || isChatBusy) {
      return;
    }
    onRequestClarification(clarificationContext);
  };

  const trimmedExplanation = explanation?.trim() || '';


  return (
    <div className="space-y-3">
      {/* Root word display */}
      {rootWord && (
        <div className="flex items-center justify-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-center">
            <div className="text-sm text-blue-600 font-medium mb-1">Root Word</div>
            <div className="text-lg font-bold text-blue-800">{rootWord}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-blue-500 mx-4" />
          <div className="text-center">
            <div className="text-sm text-blue-600 font-medium mb-1">Transform to</div>
            <div className="text-lg font-bold text-blue-800 min-w-[80px]">
              {localValue || '___'}
            </div>
          </div>
        </div>
      )}
      {/* Keyword context (P4) */}
      {!rootWord && keyword && (
        <div className="flex items-center justify-center p-2 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-center">
            <div className="text-xs text-blue-600 font-medium mb-0.5">Key word</div>
            <div className="text-sm font-bold text-blue-800">{keyword}</div>
          </div>
        </div>
      )}

      {/* Input field */}
      <div className="relative p-1">
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder ?? `Transform "${rootWord ?? ''}" to fit the sentence...`}
          className={getInputClassName()}
          disabled={disabled || isEvaluated}
          aria-label={`Transform the word ${rootWord} to fit the sentence`}
          aria-describedby={describedBy.join(' ')}
          autoComplete="off"
          spellCheck="true"
        />

        {/* Input status indicator */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          {showAnyWarning && !isEvaluated && (
            <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          )}
          {!showAnyWarning && isEvaluated && getValidationStatus() === 'correct' && (
            <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
          )}
          {!showAnyWarning && isEvaluated && getValidationStatus() === 'incorrect' && (
            <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Input statistics and validation */}
      <div
        id={statsId}
        className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {characterCount} {characterCount === 1 ? 'character' : 'characters'}
          </span>
          <span className={`rounded-full px-3 py-1 ${showWordWarning ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        </div>
        {wordWindow ? (
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            independent English {wordWindow.level}: {wordWindow.min}–{wordWindow.max} words
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Press Enter to confirm
          </span>
        )}
      </div>

      {wordWindow && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <p className="text-sm font-semibold text-slate-700">Answer guidelines</p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>Complete the sentence so it means the same as the original.</li>
            <li>Include the key word <span className="font-semibold">unchanged</span>.</li>
            <li>independent English {wordWindow.level}: use between {wordWindow.min} and {wordWindow.max} words, including the key word.</li>
          </ul>
        </div>
      )}

      {warningMessage && (
        <div
          id={warningId}
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* Help text */}
      {!wordWindow && (
        <div id={helpId} className="text-xs text-gray-500">
          {!isEvaluated && (
            <div className="space-y-1">
              <p>• Change the root word to fit grammatically in the sentence</p>
              <p>• Add prefixes, suffixes, or change the word form</p>
              <p>• Common changes: verb tense, word class, comparative forms</p>
            </div>
          )}
        </div>
      )}

      {/* Inline evaluation summary */}
      {isEvaluated && (
        <div className={`mt-2 p-4 rounded-lg border-2 ${wasCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-700">Your Answer</div>
              <div className={`p-2 rounded-md ${wasCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {userAnswer || value || ''}
              </div>
            </div>

            {!wasCorrect && (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-700">Correct Answer(s)</div>
                <div className="p-2 rounded-md bg-green-100 text-green-800">
                  {correctAnswers && correctAnswers.length > 0 ? correctAnswers.join(', ') : '—'}
                </div>
              </div>
            )}

            {trimmedExplanation && (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-700">Explanation</div>
                  <CopyToClipboardButton value={trimmedExplanation} tooltip="Copy explanation" copiedTooltip="Copied" ariaLabel="Copy explanation" className="h-7 w-7" />
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
                  {trimmedExplanation}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {canRequestClarification && (
        <ClarificationCallout helperText="Need help understanding the transformation?">
          <Button
            type="button"
            variant="support"
            size="compact"
            className="gap-1.5 font-medium tracking-tight"
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
        {hasChanges && !isEvaluated && (
          `Transformation updated: ${rootWord} becomes ${localValue || 'empty'}`
        )}
        {isEvaluated && (
          `Transformation evaluation complete`
        )}
      </div>
    </div>
  );
};
