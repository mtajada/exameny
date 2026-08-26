import React, { useState, useEffect, useRef, useId } from 'react';
import { CheckCircle, XCircle, AlertCircle, HelpCircle, Loader2 } from 'lucide-react';
import { TextInputProps } from '@/types/ruoe';
import { Button } from '@/components/ui/button';
import { CopyToClipboardButton } from '@/components/ui/copy-to-clipboard-button';
import { ClarificationCallout } from '@/components/ruoe/inputs/ClarificationCallout';

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  placeholder = "Enter your answer...",
  isEvaluated,
  disabled = false,
  userAnswer,
  correctAnswers = [],
  wasCorrect,
  explanation,
  clarificationContext,
  onRequestClarification,
  isChatBusy,
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const [hasChanges, setHasChanges] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const pendingValueRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const inputId = useId();

  const trimmedValue = localValue.trim();
  const words = trimmedValue ? trimmedValue.split(/\s+/) : [];
  const wordCount = words.length;
  const characterCount = localValue.length;
  const exceedsWordLimit = !isEvaluated && wordCount > 1;
  const isVeryLongAnswer = !isEvaluated && characterCount > 50;
  const showLengthWarning = exceedsWordLimit || isVeryLongAnswer;
  const warningMessage = exceedsWordLimit
    ? 'Answers must contain exactly one word.'
    : isVeryLongAnswer
      ? 'This answer looks unusually long for a single-word response.'
      : null;

  const evaluationStatus = (() => {
    if (!isEvaluated) return null;
    if (typeof wasCorrect === 'boolean') {
      return wasCorrect ? 'success' : 'error';
    }
    return null;
  })();

  const inputVisualState: 'success' | 'error' | 'warning' | 'default' = evaluationStatus
    ? evaluationStatus
    : showLengthWarning
      ? 'warning'
      : 'default';

  const statsId = `${inputId}-stats`;
  const tipsId = `${inputId}-tips`;
  const warningId = `${inputId}-warning`;
  const describedBy = [statsId, tipsId, warningMessage ? warningId : null].filter(Boolean).join(' ');

  const sanitizeAnswer = (rawValue: string) => {
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      return '';
    }
    return trimmedValue.split(/\s+/)[0];
  };

  // Sync with external value changes
  useEffect(() => {
    if (value !== localValue && !hasChanges) {
      const nextValue = value || '';
      pendingValueRef.current = null;
      setLocalValue(nextValue);
    }
  }, [value, localValue, hasChanges]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (pendingValueRef.current !== null) {
        const pendingValue = pendingValueRef.current;
        pendingValueRef.current = null;
        onChangeRef.current(pendingValue);
      }
    };
  }, []);

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
    pendingValueRef.current = newValue;
    // Trigger change with debouncing (300ms)
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      onChange(newValue);
      debounceRef.current = null;
      pendingValueRef.current = null;
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
    const sanitizedValue = sanitizeAnswer(localValue);

    if (sanitizedValue !== localValue) {
      setLocalValue(sanitizedValue);
    }

    pendingValueRef.current = null;

    // Flush pending debounce immediately on blur
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      onChange(sanitizedValue);
      return;
    }

    onChange(sanitizedValue);
  };

  const getInputClassName = () => {
    const baseClass = 'w-full rounded-xl border px-4 py-3 text-base shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500';
    const locked = disabled || isEvaluated;

    if (locked) {
      return `${baseClass} border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed`;
    }

    switch (inputVisualState) {
      case 'success':
        return `${baseClass} border-emerald-400 bg-emerald-50 text-emerald-900`;
      case 'error':
        return `${baseClass} border-rose-400 bg-rose-50 text-rose-900`;
      case 'warning':
        return `${baseClass} border-amber-400 bg-amber-50 text-amber-900`;
      default:
        return `${baseClass} border-slate-200 bg-white placeholder:text-slate-400 hover:border-slate-300`;
    }
  };

  const renderStatusIcon = () => {
    if (inputVisualState === 'warning') {
      return <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />;
    }
    if (inputVisualState === 'success') {
      return <CheckCircle className="h-5 w-5 text-emerald-500" aria-hidden="true" />;
    }
    if (inputVisualState === 'error') {
      return <XCircle className="h-5 w-5 text-rose-500" aria-hidden="true" />;
    }
    return null;
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
    <div className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor={inputId}
          className="flex items-baseline justify-between text-sm font-medium text-slate-700"
        >
          Answer
          <span className="text-xs font-normal text-slate-500">Single word only</span>
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={getInputClassName()}
            disabled={disabled || isEvaluated}
            id={inputId}
          aria-label="Text input for open cloze answer"
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck="true"
        />
          {renderStatusIcon() && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {renderStatusIcon()}
            </div>
          )}
        </div>
      </div>

      <div
        id={statsId}
        className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {characterCount} {characterCount === 1 ? 'character' : 'characters'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Press Enter to confirm
        </span>
      </div>

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

      <div
        id={tipsId}
        className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600"
      >
        <p className="text-sm font-semibold text-slate-700">Answer guidelines</p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>Type your answer in the field above.</li>
          <li>Use exactly one word (no phrases or contractions).</li>
          <li>Press Enter to confirm your answer.</li>
          <li>Write full forms such as "cannot" instead of "can't".</li>
        </ul>
      </div>

      {/* Inline evaluation summary */}
      {isEvaluated && (
        <div className={`mt-2 rounded-xl border-2 p-4 ${wasCorrect ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-700">Your Answer</div>
              <div className={`rounded-md p-2 ${wasCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {userAnswer || value || ''}
              </div>
            </div>

            {!wasCorrect && (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-700">Correct Answer(s)</div>
                <div className="rounded-md bg-emerald-100 p-2 text-emerald-800">
                  {correctAnswers && correctAnswers.length > 0 ? correctAnswers.join(', ') : '—'}
                </div>
              </div>
            )}

            {trimmedExplanation && (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-700">Explanation</div>
                  <CopyToClipboardButton value={trimmedExplanation} tooltip="Copy explanation" copiedTooltip="Copied" ariaLabel="Copy explanation" className="h-7 w-7" />
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-sm leading-relaxed text-slate-700">
                  {trimmedExplanation}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {canRequestClarification && (
        <ClarificationCallout helperText="Not sure why it's wrong?">
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
          `Answer updated: ${localValue || 'empty'}`
        )}
        {isEvaluated && (
          `Input evaluation complete`
        )}
      </div>
    </div>
  );
};
