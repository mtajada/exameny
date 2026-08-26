import React from 'react';
import { AlertCircle } from 'lucide-react';
import {
  ClarificationRequestContext,
  ClarificationRequestHandler,
  ExerciseData,
  EvaluationResult,
  MultipleChoiceInputProps,
  RuoEOption,
  RuoEQuestion,
  TextInputProps,
  TransformationInputProps,
  isReadingMultipleChoiceTask,
  isUseOfEnglishKeywordTransformationTask,
  isUseOfEnglishMultipleChoiceTask,
  isUseOfEnglishOpenClozeTask,
  isUseOfEnglishWordFormationTask,
} from '@/types/ruoe';
import { isLetterBased } from '@/utils/ruoe-task-logic';
import { getInputProps } from '@/utils/ruoe-input-selector';
import { MultipleChoiceInput } from '@/components/ruoe/inputs/MultipleChoiceInput';
import { TextInput } from '@/components/ruoe/inputs/TextInput';
import { TransformationInput } from '@/components/ruoe/inputs/TransformationInput';
import { buildClarificationContext } from '@/utils/ruoe-clarification-context';

interface AnswerInputPanelProps {
  taskCode: string;
  exerciseData: ExerciseData;
  currentQuestion?: RuoEQuestion;
  currentAnswer: string;
  questionOptions: RuoEOption[];
  isEvaluated: boolean;
  isEvaluating: boolean;
  isClozeLayout: boolean;
  evaluationResults?: Record<number, boolean>;
  evaluationData?: Readonly<EvaluationResult> | undefined;
  onRequestClarification?: ClarificationRequestHandler;
  isChatBusy?: boolean;
  onAnswerChange: (answer: string) => Promise<void>;
}

export const AnswerInputPanel: React.FC<AnswerInputPanelProps> = ({
  taskCode,
  exerciseData,
  currentQuestion,
  currentAnswer,
  questionOptions,
  isEvaluated,
  isEvaluating,
  isClozeLayout,
  evaluationResults = {},
  evaluationData,
  onRequestClarification,
  isChatBusy = false,
  onAnswerChange,
}) => {
  if (!currentQuestion) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg mb-2">No question selected</p>
        <p className="text-sm">
          {isClozeLayout ? 'Click on a gap in the text to answer the question' : 'Select a question to begin'}
        </p>
      </div>
    );
  }

  // Derive per-question evaluation context
  const wasCorrect = currentQuestion ? Boolean(evaluationResults[currentQuestion.id]) : undefined;
  const explanationFromEval = currentQuestion && evaluationData?.explanations
    ? evaluationData.explanations[currentQuestion.id]
    : undefined;
  const effectiveExplanation = explanationFromEval || currentQuestion?.explanation || undefined;

  const isUseOfEnglishMcq = isUseOfEnglishMultipleChoiceTask(taskCode);
  const isUseOfEnglishOpenCloze = isUseOfEnglishOpenClozeTask(taskCode);
  const isUseOfEnglishWordFormation = isUseOfEnglishWordFormationTask(taskCode);
  const isUseOfEnglishKeyword = isUseOfEnglishKeywordTransformationTask(taskCode);
  const isReadingMcq = isReadingMultipleChoiceTask(taskCode);
  const expectsOptions = isLetterBased(taskCode) || isUseOfEnglishMcq || isReadingMcq;

  let inputProps: MultipleChoiceInputProps | TextInputProps | TransformationInputProps = getInputProps({
    taskCode,
    question: currentQuestion,
    selectedAnswer: currentAnswer,
    onAnswerSelect: onAnswerChange,
    isEvaluated,
    disabled: isEvaluating,
    optionsForQuestion: questionOptions,
  });

  const clarificationContext: ClarificationRequestContext | null = currentQuestion
    ? buildClarificationContext({
        exerciseData,
        question: currentQuestion,
        questionOptions,
        allOptions: exerciseData.options,
        taskCode,
        userAnswer: currentAnswer,
        explanation: effectiveExplanation ?? null,
        wasCorrect,
        evaluationData,
      })
    : null;

  if (isUseOfEnglishKeyword) {
    inputProps = {
      ...inputProps,
      rootWord: undefined,
      placeholder: 'Complete the transformation using the key word...',
      // Inline evaluation summary for P4
      userAnswer: currentAnswer || null,
      correctAnswers: currentQuestion?.correct_answers || [],
      wasCorrect,
      explanation: effectiveExplanation,
      keyword: currentQuestion?.question_text || undefined,
      clarificationContext,
      onRequestClarification,
      isChatBusy,
    } as TransformationInputProps;
    return (
      <div className="space-y-4">
        <TransformationInput {...(inputProps as TransformationInputProps)} />
      </div>
    );
  }

  // Dev-only diagnostic: MCQ question without options → show clear message instead of blank
  // Note: scope to MCQ tasks only to avoid false positives on P2/P3 (which are open-ended)
  if (
    import.meta.env.DEV &&
    expectsOptions &&
    currentQuestion &&
    Array.isArray(questionOptions) &&
    questionOptions.length === 0
  ) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
        <p className="text-lg mb-1">No options available for this question</p>
        <p className="text-xs">
          This exercise may be invalid (missing ruoe_options). Regenerate or fix the source.
        </p>
      </div>
    );
  }

  if (isUseOfEnglishWordFormation) {
    inputProps = {
      ...(inputProps as TransformationInputProps),
      userAnswer: currentAnswer || null,
      correctAnswers: currentQuestion?.correct_answers || [],
      wasCorrect,
      explanation: effectiveExplanation,
      clarificationContext,
      onRequestClarification,
      isChatBusy,
    } as TransformationInputProps;
    return (
      <div className="space-y-4">
        <TransformationInput {...(inputProps as TransformationInputProps)} />
      </div>
    );
  }

  // Open cloze (P2)
  if (isUseOfEnglishOpenCloze) {
    inputProps = {
      ...(inputProps as TextInputProps),
      value: currentAnswer || null,
      userAnswer: currentAnswer || null,
      correctAnswers: currentQuestion?.correct_answers || [],
      wasCorrect,
      explanation: effectiveExplanation,
      clarificationContext,
      onRequestClarification,
      isChatBusy,
    } as TextInputProps;
    return <TextInput {...(inputProps as TextInputProps)} />;
  }

  // Multiple choice inputs: pass question-level explanation for correct option when available
  inputProps = {
    ...(inputProps as MultipleChoiceInputProps),
    questionLevelExplanationForCorrectOption: effectiveExplanation,
    clarificationContext,
    onRequestClarification,
    isChatBusy,
  } as MultipleChoiceInputProps;

  return <MultipleChoiceInput {...(inputProps as MultipleChoiceInputProps)} />;
};
