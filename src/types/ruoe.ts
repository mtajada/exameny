import { Database } from '@/integrations/supabase/types';
import type React from 'react';

// Database types for R&UoE entities
export type RuoEExercise = Database['public']['Tables']['ruoe_exercises']['Row'];
export type RuoEQuestion = Database['public']['Tables']['ruoe_questions']['Row'] & {
  displayOrder: number;
};
export type RuoEOption = Database['public']['Tables']['ruoe_options']['Row'];
export type RuoEUserAttempt = Database['public']['Tables']['ruoe_user_attempts']['Row'];
export type RuoEUserAnswer = Database['public']['Tables']['ruoe_user_answers']['Row'];

// Insert types for creating new records
export type RuoEExerciseInsert = Database['public']['Tables']['ruoe_exercises']['Insert'];
export type RuoEQuestionInsert = Database['public']['Tables']['ruoe_questions']['Insert'];
export type RuoEOptionInsert = Database['public']['Tables']['ruoe_options']['Insert'];
export type RuoEUserAttemptInsert = Database['public']['Tables']['ruoe_user_attempts']['Insert'];
export type RuoEUserAnswerInsert = Database['public']['Tables']['ruoe_user_answers']['Insert'];

// Composite data types for components
export interface ExerciseData {
  exercise: RuoEExercise;
  questions: RuoEQuestion[];
  options: RuoEOption[];
  taskType: Database['public']['Tables']['exam_task_types']['Row'];
  /**
   * Maps a question id to its sequential display position (starting at 1).
   * Persisted order remains untouched so placeholders & evaluation logic keep working.
   */
  displayOrderByQuestionId: Record<number, number>;
}

// Component-specific interfaces
export interface LayoutProps {
  exerciseData: ExerciseData;
  attemptId: number;
  onEvaluate: () => Promise<void>;
  isEvaluated: boolean;
  evaluationResults: Record<number, boolean>;
  isEvaluating: boolean;
  evaluationData?: EvaluationResult | null;
  onShowScoreModal?: () => void;
}

export interface ContentZoneProps {
  // Text content for Parts 1–3 (and 4) layouts
  // New: include the exercise title so the cloze layout can render it like reading layout
  title: string;
  content: string;
  questions: RuoEQuestion[];
  userAnswers: Record<number, string>;
  onGapClick: (questionId: number) => void;
  activeQuestionId: number | null;
  isEvaluated: boolean;
  taskType: string;
  isEvaluating?: boolean;
  evaluationResults?: Record<number, boolean>;
  // Save & Back integration (optional)
  hasPendingChanges?: boolean;
  isSaving?: boolean;
  onSaveAndExit?: () => Promise<void>;
}


// (Removed) InstructionZoneProps: legacy UI replaced by UnifiedRightPanel + TaskInstructionsPanel

export interface QuestionNavigatorProps {
  questions: RuoEQuestion[];
  currentQuestionIndex: number;
  onQuestionSelect: (index: number) => void;
  userAnswers: Record<number, string>;
  isEvaluated: boolean;
}

export interface ChatPanelProps {
  exerciseData: ExerciseData;
  attemptId: number;
  isEvaluated: boolean;
  userAnswers: Record<number, string>;
  currentQuestionId?: number | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ConversationHistoryEntry {
  readonly role: 'user' | 'model' | 'assistant';
  readonly parts: ReadonlyArray<{ readonly text: string }>;
}

export interface ClarificationAnswerDetail {
  readonly raw: string | null;
  readonly letter: string | null;
  readonly text: string | null;
}

export type AssistanceIntent = 'general' | 'ruoe_clarification';

export interface ClarificationQuestionContext {
  readonly questionId: number;
  readonly order: number;
  readonly displayOrder: number;
  readonly questionText: string | null;
  readonly originalSentence: string | null | undefined;
  readonly transformationSentence: string | null | undefined;
}

export type ClarificationAnswerStatus = 'blank' | 'correct' | 'incorrect';

export interface ClarificationRequestContext {
  readonly taskCode: string;
  readonly taskName: string | null;
  readonly taskTypeId: number;
  readonly levelId: number | null;
  readonly examTypeId: number | null;
  readonly exerciseTitle: string | null;
  readonly question: ClarificationQuestionContext;
  readonly studentAnswer: ClarificationAnswerDetail;
  readonly correctAnswers: readonly ClarificationAnswerDetail[];
  readonly studentAnswerStatus: ClarificationAnswerStatus;
  readonly correctAnswerExplanation: string | null;
  readonly correctAnswerAdditionalNotes: readonly string[];
  readonly incorrectAnswerFeedback: string | null;
  readonly wasCorrect: boolean | null | undefined;
}

export interface PendingClarificationPrompt {
  readonly id: string;
  readonly message: string;
  readonly intent: AssistanceIntent;
}

export type ClarificationRequestHandler = (context: ClarificationRequestContext) => void;

// Input component interfaces
export interface MultipleChoiceInputProps {
  options: RuoEOption[];
  selectedAnswer: string | null;
  onAnswerSelect: (answer: string) => void;
  isEvaluated: boolean;
  disabled?: boolean;
  // When evaluated: show explanation under correct option if option.feedback is generic/placeholder
  questionLevelExplanationForCorrectOption?: string | null | undefined;
  // Optional: task code to adjust labels (e.g., C1_READ_CROSS_TEXT => "Text A")
  taskCode?: string;
  clarificationContext?: ClarificationRequestContext | null;
  onRequestClarification?: ClarificationRequestHandler;
  isChatBusy?: boolean;
}

export interface TextInputProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  isEvaluated: boolean;
  disabled?: boolean;
  // Inline evaluation summary (post-evaluation)
  userAnswer?: string | null;
  correctAnswers?: string[];
  wasCorrect?: boolean;
  explanation?: string | null | undefined;
  clarificationContext?: ClarificationRequestContext | null;
  onRequestClarification?: ClarificationRequestHandler;
  isChatBusy?: boolean;
}

export interface KeywordTransformationWindow {
  level: 'B2' | 'C1' | 'C2'
  min: number
  max: number
}

export interface TransformationInputProps {
  rootWord?: string | null;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  isEvaluated: boolean;
  disabled?: boolean;
  // Inline evaluation summary (post-evaluation)
  userAnswer?: string | null;
  correctAnswers?: string[];
  wasCorrect?: boolean;
  explanation?: string | null | undefined;
  // For P4 (keyword transformation) we show the keyword context
  keyword?: string | null | undefined;
  wordWindow?: KeywordTransformationWindow;
  clarificationContext?: ClarificationRequestContext | null;
  onRequestClarification?: ClarificationRequestHandler;
  isChatBusy?: boolean;
}



export interface ReadingContentZoneProps {
  title: string;
  content: string;
  taskType: string;
  isEvaluated: boolean;
  exerciseData: ExerciseData;
  // For summary pills post-evaluation
  userAnswers?: Record<number, string>;
  evaluationResults?: Record<number, boolean>;
  // Allow clicking on gaps to jump/select the corresponding question
  onGapClick?: (questionId: number) => void;
  // Save & Back integration (optional)
  hasPendingChanges?: boolean;
  isSaving?: boolean;
  onSaveAndExit?: () => Promise<void>;
}

export interface UnifiedRightPanelProps {
  exerciseData: ExerciseData;
  attemptId: number;
  // For Cloze layout
  activeQuestionId?: number | null;
  onGapClick?: (questionId: number) => void;
  // For Reading layout
  currentQuestionIndex?: number;
  onQuestionSelect?: (index: number) => void;
  // Common props
  userAnswers: Record<number, string>;
  onAnswerSave: (questionId: number, answer: string) => Promise<void>;
  isEvaluated: boolean;
  evaluationResults: Record<number, boolean>;
  onEvaluate: () => Promise<void>;
  isEvaluating: boolean;
  evaluationData?: Readonly<EvaluationResult> | null;
  // Save & Back integration (optional)
  hasPendingChanges?: boolean;
  isSaving?: boolean;
  onSaveAndExit?: () => Promise<void>;
}


// Feedback component interfaces
export interface AnswerFeedbackProps {
  question: RuoEQuestion;
  userAnswer: string | null;
  options?: RuoEOption[];
  evaluationResult?: boolean;
}

export interface ScoreDisplayProps {
  score: number;
  maxScore: number;
  scorePoints: number;
  maxScorePoints: number;
  pointsPerQuestion: number;
  questionsCorrect: number;
  totalQuestions: number;
}

export interface ExplanationPanelProps {
  question: RuoEQuestion;
  userAnswer: string | null;
  correctAnswers: string[];
  explanation?: string | null;
}

// State management interfaces
export interface ExerciseState {
  exerciseData: ExerciseData | null;
  attemptId: number | null;
  userAnswers: Record<number, string>; // questionId -> answer
  currentQuestionId: number | null;
  currentQuestionIndex: number;
  isEvaluated: boolean;
  isLoading: boolean;
  isEvaluating: boolean;
  error: string | null;
  evaluationResults: Record<number, boolean>; // questionId -> isCorrect
}

export type ExerciseAction =
  | { type: 'LOAD_EXERCISE_START' }
  | { type: 'LOAD_EXERCISE_SUCCESS'; payload: ExerciseData }
  | { type: 'LOAD_EXERCISE_ERROR'; payload: string }
  | { type: 'SET_ATTEMPT_ID'; payload: number }
  | { type: 'UPDATE_ANSWER'; payload: { questionId: number; answer: string } }
  | { type: 'SET_CURRENT_QUESTION'; payload: number }
  | { type: 'SET_CURRENT_QUESTION_INDEX'; payload: number }
  | { type: 'SET_EVALUATED'; payload: boolean }
  | { type: 'SET_EVALUATING'; payload: boolean }
  | { type: 'SET_EVALUATION_RESULTS'; payload: Record<number, boolean> }
  | { type: 'RESET_EXERCISE' };

// Hook return types
export interface UseExerciseDataReturn {
  exerciseData: ExerciseData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseAnswerTrackingReturn {
  userAnswers: Record<number, string>;
  updateAnswer: (questionId: number, answer: string) => Promise<void>;
  hasPendingChanges: boolean;
  isSaving: boolean;
  flushPendingSaves: (timeoutMs?: number) => Promise<'flushed' | 'timeout'>;
}

export interface UseEvaluationReturn {
  evaluateAnswers: () => Promise<EvaluationResult>;
  isEvaluating: boolean;
  evaluationResults: Record<number, boolean>;
  score: number | null;
  maxScore: number | null;
}

// Evaluation interfaces
export interface EvaluationResult {
  score: number;
  maxScore: number;
  scorePoints: number;
  maxScorePoints: number;
  pointsPerQuestion: number;
  totalQuestions: number;
  correctAnswers: number;
  questionResults: Record<number, boolean>; // questionId -> isCorrect
  correctAnswersData: Record<number, string[]>; // questionId -> correct answers
  explanations: Record<number, string>; // questionId -> explanation
}

// Navigation and routing interfaces
export interface RuoERouteParams extends Record<string, string> {
  exerciseId: string;
}

export interface RuoENavigationState {
  fromAssignment?: boolean;
  assignedPromptId?: string;
  taskTypeId?: number;
}

// Error boundary interfaces
export interface RuoEErrorBoundaryState {
  hasError: boolean;
  error: string | null;
  errorInfo?: React.ErrorInfo;
}

export interface RuoEErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: string; retry: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export type AttemptView = 'practice' | 'results';

// Task type constants
export const RUOE_TASK_CODES = {
  // Parts 1-4 (Use cloze layout)
  B2_LANG_MC_CLOZE: 'B2_LANG_MC_CLOZE', // Multiple-choice cloze
  B2_LANG_OPEN_CLOZE: 'B2_LANG_OPEN_CLOZE', // Open cloze
  B2_LANG_WORD_FORMATION: 'B2_LANG_WORD_FORMATION', // Word formation
  B2_LANG_TRANSFORMATION: 'B2_LANG_TRANSFORMATION', // Key word transformations
  C1_LANG_MC_CLOZE: 'C1_LANG_MC_CLOZE', // Multiple-choice cloze
  C1_LANG_OPEN_CLOZE: 'C1_LANG_OPEN_CLOZE', // Open cloze
  C1_LANG_WORD_FORMATION: 'C1_LANG_WORD_FORMATION', // Word formation
  C1_LANG_TRANSFORMATION: 'C1_LANG_TRANSFORMATION', // Key word transformations
  B1_LANG_MC_CLOZE: 'B1_LANG_MC_CLOZE', // Multiple-choice cloze (B1)
  B1_LANG_OPEN_CLOZE: 'B1_LANG_OPEN_CLOZE', // Open cloze (B1)
  C2_LANG_MC_CLOZE: 'C2_LANG_MC_CLOZE', // Multiple-choice cloze (C2)
  C2_LANG_OPEN_CLOZE: 'C2_LANG_OPEN_CLOZE', // Open cloze (C2)
  C2_LANG_WORD_FORMATION: 'C2_LANG_WORD_FORMATION', // Word formation (C2)
  C2_LANG_TRANSFORMATION: 'C2_LANG_TRANSFORMATION', // Key word transformations (C2)

  // Parts 5-8 (Use reading layout)
  B2_READ_MCQ: 'B2_READ_MCQ', // Multiple choice
  B2_READ_GAPPED_TEXT: 'B2_READ_GAPPED_TEXT', // Gapped text
  B2_READ_MULTIPLE_MATCHING: 'B2_READ_MULTIPLE_MATCHING', // Multiple matching
  C1_READ_MCQ: 'C1_READ_MCQ', // Multiple choice
  C1_READ_CROSS_TEXT: 'C1_READ_CROSS_TEXT', // Cross-Text Multiple Matching
  C1_READ_GAPPED_TEXT: 'C1_READ_GAPPED_TEXT', // Gapped text
  C1_READ_MULTIPLE_MATCHING: 'C1_READ_MULTIPLE_MATCHING', // Multiple matching
  B1_READ_MCQ_SHORT: 'B1_READ_MCQ_SHORT', // Notices and messages (3-option MCQ)
  B1_READ_MULTIPLE_MATCHING: 'B1_READ_MULTIPLE_MATCHING', // Multiple matching (A–H)
  B1_READ_MCQ_LONG: 'B1_READ_MCQ_LONG', // Reading MCQ
  B1_READ_GAPPED_TEXT: 'B1_READ_GAPPED_TEXT', // Gapped text (A–F)
  C2_READ_MCQ: 'C2_READ_MCQ', // Reading MCQ (2 marks per Q)
  C2_READ_GAPPED_TEXT: 'C2_READ_GAPPED_TEXT', // Gapped text (A–H)
  C2_READ_MULTIPLE_MATCHING: 'C2_READ_MULTIPLE_MATCHING', // Multiple matching (flex sections)
} as const;

export type RuoETaskCode = typeof RUOE_TASK_CODES[keyof typeof RUOE_TASK_CODES];

// Helper task families to keep layout/utils logic consistent across levels
export const RUOE_GAPPED_TEXT_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_READ_GAPPED_TEXT,
  RUOE_TASK_CODES.C1_READ_GAPPED_TEXT,
  RUOE_TASK_CODES.B1_READ_GAPPED_TEXT,
  RUOE_TASK_CODES.C2_READ_GAPPED_TEXT,
]);

export const RUOE_MULTIPLE_MATCHING_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_READ_MULTIPLE_MATCHING,
  RUOE_TASK_CODES.C1_READ_MULTIPLE_MATCHING,
  RUOE_TASK_CODES.B1_READ_MULTIPLE_MATCHING,
  RUOE_TASK_CODES.C2_READ_MULTIPLE_MATCHING,
]);

export const RUOE_LETTER_OPTION_TASKS = new Set<RuoETaskCode>([
  // Reading gapped/matching parts store answers as letters
  ...Array.from(RUOE_GAPPED_TEXT_TASKS),
  RUOE_TASK_CODES.C1_READ_CROSS_TEXT,
  ...Array.from(RUOE_MULTIPLE_MATCHING_TASKS),
]);

export const RUOE_USE_OF_ENGLISH_MCQ_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_LANG_MC_CLOZE,
  RUOE_TASK_CODES.C1_LANG_MC_CLOZE,
  RUOE_TASK_CODES.B1_LANG_MC_CLOZE,
  RUOE_TASK_CODES.C2_LANG_MC_CLOZE,
]);

export const RUOE_USE_OF_ENGLISH_OPEN_CLOZE_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_LANG_OPEN_CLOZE,
  RUOE_TASK_CODES.C1_LANG_OPEN_CLOZE,
  RUOE_TASK_CODES.B1_LANG_OPEN_CLOZE,
  RUOE_TASK_CODES.C2_LANG_OPEN_CLOZE,
]);

export const RUOE_USE_OF_ENGLISH_WORD_FORMATION_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_LANG_WORD_FORMATION,
  RUOE_TASK_CODES.C1_LANG_WORD_FORMATION,
  RUOE_TASK_CODES.C2_LANG_WORD_FORMATION,
]);

export const RUOE_USE_OF_ENGLISH_KEYWORD_TRANSFORMATION_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_LANG_TRANSFORMATION,
  RUOE_TASK_CODES.C1_LANG_TRANSFORMATION,
  RUOE_TASK_CODES.C2_LANG_TRANSFORMATION,
]);

export const RUOE_READING_MCQ_TASKS = new Set<RuoETaskCode>([
  RUOE_TASK_CODES.B2_READ_MCQ,
  RUOE_TASK_CODES.C1_READ_MCQ,
  RUOE_TASK_CODES.C2_READ_MCQ,
  RUOE_TASK_CODES.B1_READ_MCQ_LONG,
  RUOE_TASK_CODES.B1_READ_MCQ_SHORT,
]);

// Layout type determination
export const isClozeLayout = (taskCode: string): boolean => {
  return taskCode.includes('_UOE_');
};

export const isReadingLayout = (taskCode: string): boolean => {
  return taskCode.includes('_READ_') && !isClozeLayout(taskCode);
};

export const isGappedTextTask = (taskCode: string): boolean => {
  return RUOE_GAPPED_TEXT_TASKS.has(taskCode as RuoETaskCode);
};

export const isMultipleMatchingTask = (taskCode: string): boolean => {
  return RUOE_MULTIPLE_MATCHING_TASKS.has(taskCode as RuoETaskCode);
};

export const isUseOfEnglishMultipleChoiceTask = (taskCode: string): boolean => {
  return RUOE_USE_OF_ENGLISH_MCQ_TASKS.has(taskCode as RuoETaskCode);
};

export const isUseOfEnglishOpenClozeTask = (taskCode: string): boolean => {
  return RUOE_USE_OF_ENGLISH_OPEN_CLOZE_TASKS.has(taskCode as RuoETaskCode);
};

export const isUseOfEnglishWordFormationTask = (taskCode: string): boolean => {
  return RUOE_USE_OF_ENGLISH_WORD_FORMATION_TASKS.has(taskCode as RuoETaskCode);
};

export const isUseOfEnglishKeywordTransformationTask = (taskCode: string): boolean => {
  return RUOE_USE_OF_ENGLISH_KEYWORD_TRANSFORMATION_TASKS.has(taskCode as RuoETaskCode);
};

export const isReadingMultipleChoiceTask = (taskCode: string): boolean => {
  return RUOE_READING_MCQ_TASKS.has(taskCode as RuoETaskCode);
};

export const needsInteractiveGaps = (content: string): boolean => {
  // Detect if content contains gap placeholders that need user interaction
  return /\{\{GAP_\d+\}\}/.test(content);
};

export const isTransformationLayout = (taskCode: string): boolean => {
  return isUseOfEnglishKeywordTransformationTask(taskCode);
};

export const isWordFormationLayout = (taskCode: string): boolean => {
  return isUseOfEnglishWordFormationTask(taskCode);
};

// Answer validation interfaces
export interface AnswerValidation {
  isValid: boolean;
  normalizedAnswer: string;
  suggestions?: string[];
}

export interface AnswerValidator {
  validate: (answer: string, correctAnswers: string[]) => AnswerValidation;
  normalize: (answer: string) => string;
}

// Progress tracking interfaces
export interface ExerciseProgress {
  questionsAnswered: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  timeSpent: number; // in seconds
  lastUpdated: Date;
}

// Chat integration types following TypeScript best practices
export interface ChatError {
  readonly name: 'ChatError';
  readonly message: string;
  readonly cause?: Error;
  readonly timestamp: Date;
}

// Complete context for R&UoE chat assistance
export interface CompleteRuoEContext {
  // Exercise basic information
  readonly exerciseId: number;
  readonly exerciseTitle: string;
  readonly exerciseContent: string;
  readonly taskType: string;
  readonly taskTypeName: string;
  readonly examType: number;
  readonly levelId: number;

  // All questions with complete information (sent in both pre/post evaluation)
  readonly allQuestions: readonly CompleteQuestionContext[];

  // All options with complete information (sent in both pre/post evaluation)
  readonly allOptions: readonly CompleteOptionContext[];

  // User's current state
  readonly isEvaluated: boolean;
  readonly attemptId: number;
  readonly totalQuestions: number;
  readonly answeredQuestions: number;
  readonly userAnswers: Readonly<Record<number, string>>;
  readonly displayOrderByQuestionId: Readonly<Record<number, number>>;

  // Current question context
  readonly currentQuestion: CurrentQuestionContext | null;

  // Evaluation results (only present when available)
  readonly evaluationResults?: Readonly<Record<number, boolean>>;
  readonly correctAnswersData?: Readonly<Record<number, string[]>>;
  readonly explanations?: Readonly<Record<number, string>>;
  readonly score?: number;
  readonly maxScore?: number;
}

export interface CompleteQuestionContext {
  readonly id: number;
  readonly order: number;
  readonly displayOrder: number;
  readonly questionText: string | null;
  readonly correctAnswers: readonly string[]; // Always included for better guidance
  readonly explanation: string | null;
}

export interface CompleteOptionContext {
  readonly id: number;
  readonly questionId: number;
  readonly letter: string;
  readonly text: string;
  readonly isCorrect: boolean; // Always included for better guidance
  readonly feedback: string | null;
}

export interface CurrentQuestionContext {
  readonly id: number;
  readonly order: number;
  readonly displayOrder: number;
  readonly questionText: string | null;
  readonly userAnswer: string | null;
}

// Chat assistance payload for edge function
export interface ChatAssistancePayload {
  readonly userQuery: string;
  readonly currentDraftText: string;
  readonly originalPromptText: string;
  readonly taskTypeId: number;
  readonly examId: number;
  readonly levelId: number;
  readonly ruoeContext: CompleteRuoEContext;
  readonly conversationHistory?: readonly ConversationHistoryEntry[];
  readonly assistanceIntent?: AssistanceIntent;
}

// Loading state using discriminated unions (TypeScript best practice)
export type ChatLoadingState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly error: ChatError };

// Enhanced chat integration props
export interface UseChatIntegrationProps {
  readonly exerciseData: ExerciseData;
  readonly attemptId: number;
  readonly isEvaluated: boolean;
  readonly userAnswers?: Readonly<Record<number, string>>;
  readonly currentQuestionId?: number | null;
  readonly evaluationResults?: Readonly<Record<number, boolean>>;
  readonly evaluationData?: Readonly<EvaluationResult> | null;
}

// Chat integration return type using const assertion pattern
export interface ChatIntegrationReturn {
  readonly messages: readonly ChatMessage[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly sendMessage: (query: string, intent?: AssistanceIntent) => Promise<void>;
  readonly clearMessages: () => void;
  readonly cancelRequest: () => void;
}

// Update existing ChatPanelProps to include new evaluation data
export interface EnhancedChatPanelProps extends ChatPanelProps {
  readonly evaluationResults?: Readonly<Record<number, boolean>>;
  readonly evaluationData?: Readonly<EvaluationResult> | null;
  readonly pendingPrompt?: PendingClarificationPrompt | null;
  readonly onPromptConsumed?: (id: string) => void;
  readonly onChatBusyChange?: (busy: boolean) => void;
}
