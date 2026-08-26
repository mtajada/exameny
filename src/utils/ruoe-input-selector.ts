import { RuoEOption, RuoEQuestion, isUseOfEnglishKeywordTransformationTask, isUseOfEnglishMultipleChoiceTask, isUseOfEnglishOpenClozeTask, isUseOfEnglishWordFormationTask } from '@/types/ruoe';
import { getKeywordTransformationWindow } from '@/utils/ruoe-task-logic';
import type { MultipleChoiceInputProps, TextInputProps, TransformationInputProps } from '@/types/ruoe';

// Normalized interface as guidance for consumers using the selector.
// Note: Concrete components still have their own prop types.
// Note: Component selection is now handled at call-sites to ensure
// proper type narrowing and avoid union-of-component props issues.

// Helper to adapt props for the selected input component
export const getInputProps = (params: {
  taskCode: string;
  question: RuoEQuestion;
  selectedAnswer: string | null;
  onAnswerSelect: (answer: string) => void;
  isEvaluated: boolean;
  disabled?: boolean;
  optionsForQuestion?: RuoEOption[];
}): MultipleChoiceInputProps | TextInputProps | TransformationInputProps => {
  const {
    taskCode,
    question,
    selectedAnswer,
    onAnswerSelect,
    isEvaluated,
    disabled,
    optionsForQuestion = []
  } = params;

  if (isUseOfEnglishMultipleChoiceTask(taskCode)) {
    const props: MultipleChoiceInputProps = {
      options: optionsForQuestion,
      selectedAnswer: selectedAnswer || null,
      onAnswerSelect,
      isEvaluated,
      disabled,
      taskCode,
    };
    return props;
  }

  if (isUseOfEnglishOpenClozeTask(taskCode)) {
    const props: TextInputProps = {
      value: selectedAnswer || null,
      onChange: onAnswerSelect,
      isEvaluated,
      disabled,
    };
    return props;
  }

  if (isUseOfEnglishWordFormationTask(taskCode)) {
    const props: TransformationInputProps = {
      value: selectedAnswer || null,
      onChange: onAnswerSelect,
      isEvaluated,
      disabled,
      rootWord: question.question_text,
    };
    return props;
  }

  if (isUseOfEnglishKeywordTransformationTask(taskCode)) {
    const wordWindow = getKeywordTransformationWindow(taskCode);
    const props: TransformationInputProps = {
      value: selectedAnswer || null,
      onChange: onAnswerSelect,
      isEvaluated,
      disabled,
      wordWindow: wordWindow ?? undefined,
    };
    return props;
  }

  // Reading layouts fall back to multiple-choice style inputs (letters or shared text blocks)
  const mcqProps: MultipleChoiceInputProps = {
    options: optionsForQuestion,
    selectedAnswer: selectedAnswer || null,
    onAnswerSelect,
    isEvaluated,
    disabled,
    taskCode,
  };

  return mcqProps;
};
