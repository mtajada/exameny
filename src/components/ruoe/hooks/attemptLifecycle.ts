import type { AttemptView, ExerciseData, EvaluationResult, RuoEUserAttempt } from '@/types/ruoe';
export type { AttemptView } from '@/types/ruoe';

type RestError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

type SupabaseResponse = PromiseLike<{ data: unknown | null; error: RestError | null }>;

type RuoEAnswerRow = {
  question_id: number;
  user_answer: string | null;
  is_correct: boolean | null;
};

type UnknownCallable = (...args: unknown[]) => unknown;

const isCallable = (value: unknown): value is UnknownCallable => typeof value === 'function';

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeRestError = (value: unknown): RestError | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isPlainRecord(value)) {
    return { message: String(value) };
  }

  const codeValue = value.code;
  const messageValue = value.message;
  const detailsValue = value.details;
  const hintValue = value.hint;

  const code = typeof codeValue === 'string' ? codeValue : undefined;
  const message = typeof messageValue === 'string' ? messageValue : undefined;

  let details: string | null | undefined;
  if (typeof detailsValue === 'string') {
    details = detailsValue;
  } else if (detailsValue === null) {
    details = null;
  }

  let hint: string | null | undefined;
  if (typeof hintValue === 'string') {
    hint = hintValue;
  } else if (hintValue === null) {
    hint = null;
  }

  if (!code && !message && details === undefined && hint === undefined) {
    return { message: String(value) };
  }

  return {
    code,
    message,
    details,
    hint,
  };
};

const normalizeSupabaseResponse = async (
  value: unknown,
): Promise<{ data: unknown | null; error: RestError | null }> => {
  const resolved = await Promise.resolve(value);

  if (!isPlainRecord(resolved)) {
    return { data: null, error: { message: 'Supabase response was not an object.' } };
  }

  const data = 'data' in resolved ? resolved.data : null;
  const error = 'error' in resolved ? normalizeRestError(resolved.error) : null;

  return {
    data: data === undefined ? null : (data ?? null),
    error,
  };
};

const callBuilderMethod = (target: unknown, methodName: string, args: readonly unknown[]): unknown => {
  if (!isPlainRecord(target)) {
    throw new AttemptResolutionError('unknown', `Supabase query builder is missing method "${methodName}"`);
  }

  const candidate = target[methodName];
  if (!isCallable(candidate)) {
    throw new AttemptResolutionError('unknown', `Supabase query builder is missing method "${methodName}"`);
  }

  return candidate.call(target, ...args);
};

const toSupabaseResponse = (value: unknown): SupabaseResponse => normalizeSupabaseResponse(value);

const wrapAttemptsFilterBuilder = (builder: unknown): RuoEAttemptsFilterBuilder => ({
  eq: (column, value) => wrapAttemptsFilterBuilder(callBuilderMethod(builder, 'eq', [column, value])),
  order: (column, options) => wrapAttemptsFilterBuilder(callBuilderMethod(builder, 'order', [column, options])),
  limit: (count) => wrapAttemptsFilterBuilder(callBuilderMethod(builder, 'limit', [count])),
  maybeSingle: () => toSupabaseResponse(callBuilderMethod(builder, 'maybeSingle', [])),
});

const wrapAttemptsQueryBuilder = (builder: unknown): RuoEAttemptsQueryBuilder => ({
  select: (columns) => wrapAttemptsFilterBuilder(callBuilderMethod(builder, 'select', [columns])),
});

const wrapAnswersFilterBuilder = (builder: unknown): RuoEAnswersFilterBuilder => ({
  eq: (column, value) => toSupabaseResponse(callBuilderMethod(builder, 'eq', [column, value])),
});

const wrapAnswersQueryBuilder = (builder: unknown): RuoEAnswersQueryBuilder => ({
  select: (columns) => wrapAnswersFilterBuilder(callBuilderMethod(builder, 'select', [columns])),
});

interface RuoEAttemptsQueryBuilder {
  select(columns: string): RuoEAttemptsFilterBuilder;
}

interface RuoEAttemptsFilterBuilder {
  eq(column: string, value: unknown): RuoEAttemptsFilterBuilder;
  order(column: string, options?: { ascending?: boolean }): RuoEAttemptsFilterBuilder;
  limit(count: number): RuoEAttemptsFilterBuilder;
  maybeSingle(): SupabaseResponse;
}

interface RuoEAnswersQueryBuilder {
  select(columns: string): RuoEAnswersFilterBuilder;
}

interface RuoEAnswersFilterBuilder {
  eq(column: string, value: unknown): SupabaseResponse;
}

export interface SupabaseClientLike {
  from(table: 'ruoe_user_attempts'): RuoEAttemptsQueryBuilder;
  from(table: 'ruoe_user_answers'): RuoEAnswersQueryBuilder;
  rpc(name: string, args: Record<string, unknown>): SupabaseResponse;
}

type SupabaseRuntimeClient = {
  from: (table: string) => unknown;
  rpc: (name: string, args: Record<string, unknown>) => unknown;
};

const isSupabaseRuntimeClient = (value: unknown): value is SupabaseRuntimeClient => {
  if (!isPlainRecord(value)) {
    return false;
  }

  return isCallable(value.from) && isCallable(value.rpc);
};

export const adaptSupabaseClient = (client: unknown): SupabaseClientLike => {
  if (!isSupabaseRuntimeClient(client)) {
    throw new AttemptResolutionError('unknown', 'Invalid Supabase client provided for attempt lifecycle');
  }

  const runtimeClient = client;

  function from(table: 'ruoe_user_attempts'): RuoEAttemptsQueryBuilder;
  function from(table: 'ruoe_user_answers'): RuoEAnswersQueryBuilder;
  function from(table: 'ruoe_user_attempts' | 'ruoe_user_answers') {
    const builder = runtimeClient.from(table);
    return table === 'ruoe_user_attempts'
      ? wrapAttemptsQueryBuilder(builder)
      : wrapAnswersQueryBuilder(builder);
  }

  const rpc = (name: string, args: Record<string, unknown>): SupabaseResponse => (
    toSupabaseResponse(runtimeClient.rpc(name, args))
  );

  return {
    from,
    rpc,
  };
};

interface ResolveAttemptContextParams {
  attemptParam: string | null;
  viewParam: string | null;
  locationState: unknown;
  defaultView?: AttemptView;
}

type AttemptSource = 'query' | 'state' | 'none';
type ViewSource = 'query' | 'state' | 'default';

interface LegacyStateExtraction {
  attemptId: number | null;
  view: AttemptView | null;
  cleanedState: Record<string, unknown> | null;
  hadAttemptField: boolean;
  hadViewField: boolean;
  fingerprint: string | null;
}

export interface AttemptContext {
  attemptId: number | null;
  attemptNumber: number | null;
  attemptSource: AttemptSource;
  hasAttemptQueryParam: boolean;
  invalidAttemptParam: boolean;
  view: AttemptView;
  viewSource: ViewSource;
  hasViewQueryParam: boolean;
  invalidViewParam: boolean;
  needsQueryRewrite: boolean;
  stateAfterMigration: unknown | undefined;
  stateUpdateToken: string | null;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isRuoEUserAttempt = (value: unknown): value is RuoEUserAttempt => {
  if (!isPlainObject(value) || Array.isArray(value)) {
    return false;
  }

  const id = value.id;
  const studentId = value.student_id;
  const membershipId = value.membership_id;
  const exerciseId = value.exercise_id;
  const attemptNumber = value.attempt_number;
  const restartedFromAttemptId = value.restarted_from_attempt_id;
  const status = value.status;
  const score = value.score;
  const maxScore = value.max_score;
  const startedAt = value.started_at;
  const completedAt = value.completed_at;

  return (
    typeof id === 'number' &&
    typeof studentId === 'string' &&
    typeof membershipId === 'number' &&
    typeof exerciseId === 'number' &&
    typeof attemptNumber === 'number' &&
    (typeof restartedFromAttemptId === 'number' || restartedFromAttemptId === null) &&
    typeof status === 'string' &&
    (typeof score === 'number' || score === null) &&
    (typeof maxScore === 'number' || maxScore === null) &&
    typeof startedAt === 'string' &&
    (typeof completedAt === 'string' || completedAt === null)
  );
};

const isRuoEAnswerRow = (value: unknown): value is RuoEAnswerRow => {
  if (!isPlainObject(value) || Array.isArray(value)) {
    return false;
  }

  const questionId = value.question_id;
  const userAnswer = value.user_answer;
  const isCorrect = value.is_correct;

  return (
    typeof questionId === 'number' &&
    (typeof userAnswer === 'string' || userAnswer === null) &&
    (typeof isCorrect === 'boolean' || isCorrect === null)
  );
};

const parseAttemptId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const parseView = (value: unknown): AttemptView | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'practice') {
    return 'practice';
  }
  if (normalized === 'results' || normalized === 'review') {
    return 'results';
  }
  return null;
};

const extractLegacyState = (raw: unknown): LegacyStateExtraction => {
  if (!isPlainObject(raw)) {
    return {
      attemptId: null,
      view: null,
      cleanedState: null,
      hadAttemptField: false,
      hadViewField: false,
      fingerprint: null,
    };
  }

  const draft: Record<string, unknown> = { ...raw };
  let attemptId: number | null = null;
  let hadAttemptField = false;

  if ('attemptId' in draft) {
    hadAttemptField = true;
    attemptId = parseAttemptId(draft.attemptId);
    delete draft.attemptId;
  }

  let view: AttemptView | null = null;
  let hadViewField = false;
  if ('viewMode' in draft) {
    hadViewField = true;
    view = parseView(draft.viewMode);
    delete draft.viewMode;
  }

  const cleanedKeys = Object.keys(draft);
  const cleanedState = cleanedKeys.length > 0 ? draft : null;
  let fingerprint: string | null = null;

  if (hadAttemptField || hadViewField) {
    try {
      fingerprint = JSON.stringify(cleanedState);
    } catch {
      fingerprint = `${Date.now()}`;
    }
  }

  return {
    attemptId,
    view,
    cleanedState,
    hadAttemptField,
    hadViewField,
    fingerprint,
  };
};

export const resolveAttemptContext = (params: ResolveAttemptContextParams): AttemptContext => {
  const {
    attemptParam,
    viewParam,
    locationState,
    defaultView = 'practice',
  } = params;

  const hasAttemptQueryParam = attemptParam !== null;
  const parsedAttemptFromQuery = parseAttemptId(attemptParam);
  const invalidAttemptParam = hasAttemptQueryParam && parsedAttemptFromQuery === null;

  const hasViewQueryParam = viewParam !== null;
  const parsedViewFromQuery = parseView(viewParam);
  const invalidViewParam = hasViewQueryParam && parsedViewFromQuery === null;

  const legacy = extractLegacyState(locationState);

  let attemptId: number | null = parsedAttemptFromQuery;
  let attemptSource: AttemptSource = parsedAttemptFromQuery !== null ? 'query' : 'none';

  if (attemptId === null && legacy.attemptId !== null) {
    attemptId = legacy.attemptId;
    attemptSource = 'state';
  }

  const viewFromState = legacy.view;
  const view: AttemptView = parsedViewFromQuery ?? viewFromState ?? defaultView;
  let viewSource: ViewSource = 'default';
  if (parsedViewFromQuery) {
    viewSource = 'query';
  } else if (viewFromState) {
    viewSource = 'state';
  }

  const needsQueryRewrite =
    attemptSource === 'state' ||
    viewSource === 'state' ||
    invalidAttemptParam ||
    invalidViewParam;

  const stateRequiresRewrite = legacy.hadAttemptField || legacy.hadViewField;

  const stateAfterMigration = stateRequiresRewrite ? (legacy.cleanedState ?? null) : undefined;
  const stateUpdateToken = stateRequiresRewrite ? (legacy.fingerprint ?? null) : null;

  return {
    attemptId,
    attemptNumber: null,
    attemptSource,
    hasAttemptQueryParam,
    invalidAttemptParam,
    view,
    viewSource,
    hasViewQueryParam,
    invalidViewParam,
    needsQueryRewrite,
    stateAfterMigration,
    stateUpdateToken,
  };
};

export type AttemptResolutionErrorKind = 'not_found' | 'forbidden' | 'unknown';

export class AttemptResolutionError extends Error {
  readonly kind: AttemptResolutionErrorKind;
  readonly cause?: Error;

  constructor(kind: AttemptResolutionErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'AttemptResolutionError';
    this.kind = kind;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AttemptResolutionError);
    }

    if (cause instanceof Error) {
      this.cause = cause;
    } else if (cause !== undefined && cause !== null) {
      const fallbackCause = new Error(`AttemptResolutionError cause: ${String(cause)}`);
      if (cause && typeof cause === 'object') {
        fallbackCause.name = cause.constructor?.name ?? 'UnknownCause';
      }
      this.cause = fallbackCause;
    }
  }
}

interface EnsurePracticeAttemptParams {
  client: SupabaseClientLike;
  exerciseId: number;
  studentId: string;
  context: Pick<AttemptContext, 'attemptId' | 'attemptSource'>;
}

export type AttemptEnsureOrigin = 'query' | 'state' | 'resumed' | 'created';

export interface EnsurePracticeAttemptResult {
  attempt: RuoEUserAttempt;
  origin: AttemptEnsureOrigin;
}

const isRestNoRowsError = (error: RestError | null): boolean => (
  Boolean(error?.code === 'PGRST116')
);

type RpcError = RestError;

const buildRpcErrorMessage = (error: RpcError | null, fallbackMessage: string): string => {
  if (!error) {
    return fallbackMessage;
  }

  const parts: string[] = [];
  if (error.message) {
    parts.push(error.message);
  }
  if (error.details) {
    parts.push(error.details);
  }

  if (parts.length === 0) {
    return fallbackMessage;
  }

  return parts.join(' ').trim();
};

const isRpcInProgressConflict = (error: RpcError | null): boolean => {
  if (!error?.code || !error.message) {
    return false;
  }

  return error.code === 'P0001' && error.message.toLowerCase().includes('in-progress attempt');
};

const mapRpcErrorToAttemptResolutionError = (
  error: RpcError | null,
  fallbackMessage: string,
): AttemptResolutionError => {
  const message = buildRpcErrorMessage(error, fallbackMessage);
  const normalized = message.toLowerCase();

  if (normalized.includes('not found') || normalized.includes('does not exist')) {
    return new AttemptResolutionError('not_found', message, error ?? undefined);
  }

  if (
    normalized.includes('not available') ||
    normalized.includes('retry your own attempts') ||
    normalized.includes('does not belong to exercise') ||
    normalized.includes('not completed') ||
    normalized.includes('finish it before starting a retry')
  ) {
    return new AttemptResolutionError('forbidden', message, error ?? undefined);
  }

  return new AttemptResolutionError('unknown', message, error ?? undefined);
};

const loadLatestInProgressAttempt = (
  client: SupabaseClientLike,
  exerciseId: number,
  studentId: string,
) => client
  .from('ruoe_user_attempts')
  .select('*')
  .eq('exercise_id', exerciseId)
  .eq('student_id', studentId)
  .eq('status', 'in_progress')
  .order('started_at', { ascending: false })
  .limit(1)
  .maybeSingle();

export const ensurePracticeAttempt = async (
  params: EnsurePracticeAttemptParams,
): Promise<EnsurePracticeAttemptResult> => {
  const { client, exerciseId, studentId, context } = params;

  if (!studentId) {
    throw new AttemptResolutionError('unknown', 'Missing student identifier for attempt resolution');
  }

  if (context.attemptId !== null) {
    const { data, error } = await client
      .from('ruoe_user_attempts')
      .select('*')
      .eq('id', context.attemptId)
      .eq('exercise_id', exerciseId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) {
      if (isRestNoRowsError(error)) {
        throw new AttemptResolutionError('not_found', `Attempt ${context.attemptId} not found for this exercise`);
      }
      throw new AttemptResolutionError('unknown', 'Failed to fetch attempt from Supabase', error);
    }

    if (!data) {
      throw new AttemptResolutionError('not_found', `Attempt ${context.attemptId} not found for this exercise`);
    }

    if (!isRuoEUserAttempt(data)) {
      throw new AttemptResolutionError('unknown', 'Supabase returned an invalid attempt row');
    }

    return {
      attempt: data,
      origin: context.attemptSource === 'query' ? 'query' : 'state',
    };
  }

  const { data: inProgress, error: resumeError } = await loadLatestInProgressAttempt(
    client,
    exerciseId,
    studentId,
  );

  if (resumeError && !isRestNoRowsError(resumeError)) {
    throw new AttemptResolutionError('unknown', 'Failed to resume existing attempt', resumeError);
  }

  if (inProgress) {
    if (!isRuoEUserAttempt(inProgress)) {
      throw new AttemptResolutionError('unknown', 'Supabase returned an invalid attempt row');
    }
    return {
      attempt: inProgress,
      origin: 'resumed',
    };
  }

  const { data: inserted, error: rpcError } = await client.rpc(
    'start_ruoe_attempt',
    { p_exercise_id: exerciseId },
  );

  if (rpcError) {
    if (isRpcInProgressConflict(rpcError)) {
      const { data: concurrentAttempt, error: concurrentError } = await loadLatestInProgressAttempt(
        client,
        exerciseId,
        studentId,
      );

      if (concurrentError && !isRestNoRowsError(concurrentError)) {
        throw new AttemptResolutionError('unknown', 'Failed to resume concurrent attempt', concurrentError);
      }

      if (concurrentAttempt) {
        if (!isRuoEUserAttempt(concurrentAttempt)) {
          throw new AttemptResolutionError('unknown', 'Supabase returned an invalid attempt row');
        }
        return {
          attempt: concurrentAttempt,
          origin: 'resumed',
        };
      }
    }

    throw mapRpcErrorToAttemptResolutionError(rpcError, 'Failed to create new attempt');
  }

  if (!isRuoEUserAttempt(inserted)) {
    throw new AttemptResolutionError('unknown', 'Supabase did not return a practice attempt');
  }

  return {
    attempt: inserted,
    origin: 'created',
  };
};

interface RestartPracticeAttemptParams {
  client: SupabaseClientLike;
  exerciseId: number;
  studentId: string;
  retryFromAttemptId: number;
}

export interface RestartPracticeAttemptResult {
  attempt: RuoEUserAttempt;
  origin: 'retry';
}

const formatInProgressConflictMessage = (
  attempt: RuoEUserAttempt | null,
  fallback: string,
): string => {
  if (!attempt) {
    return fallback;
  }

  const label = Number.isFinite(attempt.attempt_number)
    ? `Attempt #${attempt.attempt_number}`
    : 'An attempt';

  return `${label} is still in progress for this exercise. Resume attempt ${attempt.id} before starting a new retry.`;
};

export const restartPracticeAttempt = async (
  params: RestartPracticeAttemptParams,
): Promise<RestartPracticeAttemptResult> => {
  const { client, exerciseId, studentId, retryFromAttemptId } = params;

  if (!studentId) {
    throw new AttemptResolutionError('unknown', 'Missing student identifier for attempt resolution');
  }

  if (!retryFromAttemptId || retryFromAttemptId <= 0) {
    throw new AttemptResolutionError('unknown', 'Invalid retry attempt identifier');
  }

  const { data: attempt, error: rpcError } = await client.rpc(
    'start_ruoe_attempt',
    {
      p_exercise_id: exerciseId,
      p_retry_from_attempt_id: retryFromAttemptId,
    },
  );

  if (rpcError) {
    if (isRpcInProgressConflict(rpcError)) {
      const retryMessage = buildRpcErrorMessage(
        rpcError,
        'You already have an attempt in progress for this exercise.',
      );

      const { data: inProgress, error: queryError } = await loadLatestInProgressAttempt(
        client,
        exerciseId,
        studentId,
      );

      if (queryError && !isRestNoRowsError(queryError)) {
        throw new AttemptResolutionError(
          'unknown',
          'Failed to verify in-progress attempt before retry',
          queryError,
        );
      }

      const inProgressAttempt = isRuoEUserAttempt(inProgress) ? inProgress : null;
      throw new AttemptResolutionError(
        'unknown',
        formatInProgressConflictMessage(inProgressAttempt, retryMessage),
        rpcError,
      );
    }

    throw mapRpcErrorToAttemptResolutionError(rpcError, 'Failed to start retry attempt');
  }

  if (!isRuoEUserAttempt(attempt)) {
    throw new AttemptResolutionError('unknown', 'Supabase did not return a retry attempt');
  }

  return {
    attempt,
    origin: 'retry',
  };
};

interface LoadCompletedAttemptParams {
  client: SupabaseClientLike;
  attemptId: number;
  studentId: string;
  exerciseData: ExerciseData;
}

export interface HydratedAttemptReview {
  attempt: RuoEUserAttempt;
  userAnswers: Record<number, string>;
  evaluationResults: Record<number, boolean>;
  evaluationData: EvaluationResult;
}

const computePointsPerQuestion = (taskCode: string | null | undefined): number => {
  if (!taskCode) {
    return 1;
  }
  const normalized = taskCode.toUpperCase();
  return normalized.includes('_UOE_P4') ? 2 : 1;
};

const normalizeAnswer = (value: string | null | undefined): string => (
  typeof value === 'string' ? value : ''
);

const compareAnswers = (userAnswer: string, correctAnswers: readonly string[]): boolean => {
  if (!userAnswer.trim()) {
    return false;
  }
  const normalizedUser = userAnswer.trim().toLowerCase();
  return correctAnswers.some((candidate) => candidate.trim().toLowerCase() === normalizedUser);
};

export const loadCompletedAttemptForReview = async (
  params: LoadCompletedAttemptParams,
): Promise<HydratedAttemptReview> => {
  const { client, attemptId, studentId, exerciseData } = params;

  const exerciseNumericId = exerciseData.exercise.id;
  const { data: attemptRow, error: attemptError } = await client
    .from('ruoe_user_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('student_id', studentId)
    .eq('exercise_id', exerciseNumericId)
    .maybeSingle();

  if (attemptError) {
    if (isRestNoRowsError(attemptError)) {
      throw new AttemptResolutionError('not_found', `Attempt ${attemptId} was not found for this exercise`);
    }
    throw new AttemptResolutionError('unknown', 'Failed to load attempt for review', attemptError);
  }

  if (!attemptRow) {
    throw new AttemptResolutionError('not_found', `Attempt ${attemptId} was not found for this exercise`);
  }

  if (!isRuoEUserAttempt(attemptRow)) {
    throw new AttemptResolutionError('unknown', 'Supabase returned an invalid attempt row');
  }

  if (attemptRow.status !== 'completed') {
    throw new AttemptResolutionError('unknown', 'Attempt is not completed and cannot be reviewed yet');
  }

  const { data: answerRows, error: answersError } = await client
    .from('ruoe_user_answers')
    .select('question_id, user_answer, is_correct')
    .eq('attempt_id', attemptId);

  if (answersError) {
    throw new AttemptResolutionError('unknown', 'Failed to load saved answers for review', answersError);
  }

  const persistedAnswerRows = Array.isArray(answerRows) ? answerRows : [];
  // When a student submits without typing any answers we still allow review by treating the attempt
  // as blank, so an empty answer set is valid here.

  const answerLookup = new Map<number, { answer: string; isCorrect: boolean | null }>();
  for (const row of persistedAnswerRows) {
    if (!isRuoEAnswerRow(row)) {
      continue;
    }

    answerLookup.set(row.question_id, {
      answer: normalizeAnswer(row.user_answer),
      isCorrect: typeof row.is_correct === 'boolean' ? row.is_correct : null,
    });
  }

  const userAnswers: Record<number, string> = {};
  const evaluationResults: Record<number, boolean> = {};
  const correctAnswersData: Record<number, string[]> = {};
  const explanations: Record<number, string> = {};

  let correctCount = 0;
  const totalQuestions = exerciseData.questions.length;
  const pointsPerQuestion = computePointsPerQuestion(exerciseData.taskType.task_code);

  for (const question of exerciseData.questions) {
    const questionId = question.id;
    const saved = answerLookup.get(questionId);
    const userAnswer = saved ? saved.answer : '';
    if (userAnswer) {
      userAnswers[questionId] = userAnswer;
    }

    const correctAnswers = Array.isArray(question.correct_answers)
      ? question.correct_answers
      : [];
    correctAnswersData[questionId] = correctAnswers.map((entry) => entry ?? '').filter(Boolean);
    explanations[questionId] = question.explanation ?? '';

    let wasCorrect: boolean;
    if (typeof saved?.isCorrect === 'boolean') {
      wasCorrect = saved.isCorrect;
    } else {
      wasCorrect = compareAnswers(userAnswer, correctAnswersData[questionId]);
    }

    if (wasCorrect) {
      correctCount += 1;
    }

    evaluationResults[questionId] = wasCorrect;
  }

  const maxScore = typeof attemptRow.max_score === 'number' ? attemptRow.max_score : 100;
  const computedScore = totalQuestions > 0
    ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
    : 0;
  const score = typeof attemptRow.score === 'number' ? attemptRow.score : computedScore;

  const evaluationData: EvaluationResult = {
    score,
    maxScore,
    scorePoints: correctCount * pointsPerQuestion,
    maxScorePoints: totalQuestions * pointsPerQuestion,
    pointsPerQuestion,
    totalQuestions,
    correctAnswers: correctCount,
    questionResults: evaluationResults,
    correctAnswersData,
    explanations,
  };

  return {
    attempt: attemptRow,
    userAnswers,
    evaluationResults,
    evaluationData,
  };
};
