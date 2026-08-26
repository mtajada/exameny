import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RuoERouteParams, isClozeLayout, isReadingLayout, EvaluationResult } from '@/types/ruoe';
import { useExerciseData } from '@/components/ruoe/hooks/useExerciseData';
import { RuoEErrorBoundary } from '@/components/ruoe/RuoEErrorBoundary';
import { RuoELayoutCloze } from '@/components/ruoe/layouts/RuoELayoutCloze';
import { RuoELayoutReading } from '@/components/ruoe/layouts/RuoELayoutReading';
import { ScoreModal } from '@/components/ruoe/feedback/ScoreModal';
import { useToast } from '@/components/ui/use-toast';
import FixedViewportPage from '@/components/layout/FixedViewportPage';
import { useScrollLock } from '@/hooks/useScrollLock';
import {
  AttemptView,
  adaptSupabaseClient,
  resolveAttemptContext,
  ensurePracticeAttempt,
  AttemptResolutionError,
  loadCompletedAttemptForReview,
  restartPracticeAttempt,
} from '@/components/ruoe/hooks/attemptLifecycle';
import { applyRetryResult, buildRetrySearchString } from './ruoeRetryHelpers';

const ruoeSupabaseClient = adaptSupabaseClient(supabase);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const coerceNumberField = (value: unknown, field: string): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Evaluation payload is missing numeric field "${field}"`);
};

const normalizeBooleanRecord = (value: unknown): Record<number, boolean> => {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<number, boolean>>((acc, [key, entry]) => {
    if (typeof entry !== 'boolean') {
      return acc;
    }

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey)) {
      acc[numericKey] = entry;
    }
    return acc;
  }, {});
};

const normalizeStringArrayRecord = (value: unknown): Record<number, string[]> => {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<number, string[]>>((acc, [key, entry]) => {
    if (!Array.isArray(entry)) {
      return acc;
    }

    const normalized = entry.filter((candidate): candidate is string => typeof candidate === 'string');
    const numericKey = Number(key);
    if (!Number.isNaN(numericKey)) {
      acc[numericKey] = normalized;
    }
    return acc;
  }, {});
};

const normalizeStringRecord = (value: unknown): Record<number, string> => {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<number, string>>((acc, [key, entry]) => {
    if (typeof entry !== 'string') {
      return acc;
    }

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey)) {
      acc[numericKey] = entry;
    }
    return acc;
  }, {});
};

const normalizeEvaluationPayload = (payload: unknown): EvaluationResult => {
  if (!isObjectRecord(payload)) {
    throw new Error('Evaluation payload is not a JSON object');
  }

  const score = coerceNumberField(payload.score, 'score');
  const maxScore = coerceNumberField(payload.maxScore, 'maxScore');
  const scorePoints = coerceNumberField(payload.scorePoints, 'scorePoints');
  const maxScorePoints = coerceNumberField(payload.maxScorePoints, 'maxScorePoints');
  const pointsPerQuestion = coerceNumberField(payload.pointsPerQuestion, 'pointsPerQuestion');
  const totalQuestions = coerceNumberField(payload.totalQuestions, 'totalQuestions');
  const correctAnswers = coerceNumberField(payload.correctAnswers, 'correctAnswers');

  return {
    score,
    maxScore,
    scorePoints,
    maxScorePoints,
    pointsPerQuestion,
    totalQuestions,
    correctAnswers,
    questionResults: normalizeBooleanRecord(payload.questionResults),
    correctAnswersData: normalizeStringArrayRecord(payload.correctAnswersData),
    explanations: normalizeStringRecord(payload.explanations),
  };
};

const RuoEPracticePage: React.FC = () => {
  useScrollLock(true);
  const { exerciseId } = useParams<RuoERouteParams>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [initialLocationState] = useState(() => location.state);

  const [evaluationResults, setEvaluationResults] = useState<Record<number, boolean>>({});
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [showScoreModal, setShowScoreModal] = useState<boolean>(false);
  const [evaluationData, setEvaluationData] = useState<EvaluationResult | null>(null);

  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<'in_progress' | 'completed' | null>(null);
  const [attemptLoading, setAttemptLoading] = useState<boolean>(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const lastHydratedAttemptRef = useRef<number | null>(null);

  const attemptParam = searchParams.get('attempt');
  const viewParam = searchParams.get('view');

  const locationStateForAttempt = useMemo(() => {
    if (role === 'student') {
      return location.state;
    }

    if (role === null) {
      return initialLocationState;
    }

    return undefined;
  }, [initialLocationState, location.state, role]);

  const attemptContext = useMemo(
    () =>
      resolveAttemptContext({
        attemptParam,
        viewParam,
        locationState: locationStateForAttempt,
      }),
    [attemptParam, viewParam, locationStateForAttempt],
  );

  const waitingForStudentProfile = Boolean(user?.id) && role === null;

  const [viewMode, setViewMode] = useState<AttemptView>(attemptContext.view);

  useEffect(() => {
    if (attemptContext.view !== viewMode) {
      setViewMode(attemptContext.view);
    }
  }, [attemptContext.view, viewMode]);

  const { exerciseData, isLoading, error, refetch } = useExerciseData(exerciseId || '');

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    if (role && role !== 'student') {
      navigate('/auth', { replace: true });
    }
  }, [navigate, role, user]);

  useEffect(() => {
    if (!exerciseData?.exercise?.id || !user?.id || role !== 'student') {
      return;
    }

    let cancelled = false;

    const resolveAttempt = async () => {
      setAttemptLoading(true);
      setAttemptError(null);

      try {
	        const result = await ensurePracticeAttempt({
	          client: ruoeSupabaseClient,
	          exerciseId: exerciseData.exercise.id,
	          studentId: user.id,
	          context: {
	            attemptId: attemptContext.attemptId,
            attemptSource: attemptContext.attemptSource,
          },
        });

        if (cancelled) {
          return;
        }

        const resolvedAttemptId = result.attempt.id;
        const resolvedStatus = result.attempt.status === 'completed' ? 'completed' : 'in_progress';

        setAttemptId(resolvedAttemptId);
        setAttemptStatus(resolvedStatus);
        setAttemptNumber(
          typeof result.attempt.attempt_number === 'number'
            ? result.attempt.attempt_number
            : null,
        );

        let nextView: AttemptView = attemptContext.view;
        if (resolvedStatus === 'completed') {
          nextView = 'results';
        } else if (nextView === 'results') {
          nextView = 'practice';
        }

        if (viewMode !== nextView) {
          setViewMode(nextView);
        }

        const currentSearch = location.search.startsWith('?')
          ? location.search.slice(1)
          : location.search;
        const params = new URLSearchParams(currentSearch);
        const attemptValue = String(resolvedAttemptId);
        let searchChanged = false;

        if (params.get('attempt') !== attemptValue) {
          params.set('attempt', attemptValue);
          searchChanged = true;
        }

        if (params.get('view') !== nextView) {
          params.set('view', nextView);
          searchChanged = true;
        }

        const nextSearch = params.toString();
        const shouldRewriteQuery = searchChanged || attemptContext.needsQueryRewrite;
        const statePayload = attemptContext.stateAfterMigration;
        const shouldRewriteState = statePayload !== undefined;

        if (shouldRewriteQuery || shouldRewriteState) {
          navigate(
            {
              pathname: location.pathname,
              search: nextSearch ? `?${nextSearch}` : '',
            },
            {
              replace: true,
              state: shouldRewriteState ? statePayload ?? null : undefined,
            },
          );
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        let message = 'Unable to resolve practice attempt.';
        if (err instanceof AttemptResolutionError) {
          message = err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }

        setAttemptId(null);
        setAttemptStatus(null);
        setAttemptNumber(null);
        setAttemptError(message);

        if (err instanceof AttemptResolutionError && err.kind === 'not_found') {
          const params = new URLSearchParams();
          params.set('view', 'practice');
          navigate(
            {
              pathname: location.pathname,
              search: params.toString() ? `?${params.toString()}` : '',
            },
            { replace: true, state: null },
          );
          toast({
            title: 'Attempt unavailable',
            description: 'Starting a fresh practice session for this exercise.',
          });
        } else {
          console.error('Failed to ensure R&UoE attempt');
        }
      } finally {
        if (!cancelled) {
          setAttemptLoading(false);
        }
      }
    };

    void resolveAttempt();

    return () => {
      cancelled = true;
    };
  }, [
    attemptContext.attemptId,
    attemptContext.attemptSource,
    attemptContext.needsQueryRewrite,
    attemptContext.stateAfterMigration,
    attemptContext.stateUpdateToken,
    attemptContext.view,
    exerciseData?.exercise?.id,
    location.pathname,
    location.search,
    navigate,
    toast,
    user?.id,
    viewMode,
    role,
  ]);

  useEffect(() => {
    lastHydratedAttemptRef.current = null;
    setEvaluationResults({});
    setEvaluationData(null);
    setShowScoreModal(false);
  }, [attemptId]);

  useEffect(() => {
    if (viewMode !== 'results') {
      setEvaluationResults({});
      setEvaluationData(null);
      setShowScoreModal(false);
      lastHydratedAttemptRef.current = null;
    }
  }, [viewMode]);

  const loadCompletedAttempt = useCallback(
    async (completedAttemptId: number) => {
      if (!user?.id || !exerciseData) {
        return;
      }

      try {
	        const hydration = await loadCompletedAttemptForReview({
	          client: ruoeSupabaseClient,
	          attemptId: completedAttemptId,
	          studentId: user.id,
	          exerciseData,
	        });

        lastHydratedAttemptRef.current = completedAttemptId;
        setAttemptStatus('completed');
        setAttemptError(null);
        setEvaluationResults(hydration.evaluationResults);
        setEvaluationData(hydration.evaluationData);
        setAttemptNumber(
          typeof hydration.attempt.attempt_number === 'number'
            ? hydration.attempt.attempt_number
            : null,
        );

        setTimeout(() => {
          setShowScoreModal(true);
        }, 500);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not load the results for this attempt.';
        console.error('Error hydrating completed attempt:');
        toast({
          title: 'Results Unavailable',
          description: message,
          variant: 'destructive',
        });
        setEvaluationResults({});
        setEvaluationData(null);
        setShowScoreModal(false);
        lastHydratedAttemptRef.current = null;
        setAttemptStatus('in_progress');
        setAttemptLoading(true);
        setAttemptId(null);
        setViewMode('practice');
        setAttemptNumber(null);

        const params = new URLSearchParams();
        params.set('view', 'practice');
        navigate(
          {
            pathname: location.pathname,
            search: params.toString() ? `?${params.toString()}` : '',
          },
          { replace: true, state: null },
        );
      }
    },
    [exerciseData, location.pathname, navigate, toast, user?.id],
  );

  useEffect(() => {
    if (!attemptId || !exerciseData) {
      return;
    }

    if (viewMode !== 'results' || attemptStatus !== 'completed') {
      return;
    }

    if (lastHydratedAttemptRef.current === attemptId && evaluationData) {
      return;
    }

    void loadCompletedAttempt(attemptId);
  }, [attemptId, attemptStatus, viewMode, exerciseData, evaluationData, loadCompletedAttempt]);

  const handleRetryFromResults = useCallback(async () => {
    if (!exerciseData?.exercise?.id || !attemptId || !user?.id) {
      const message = 'Unable to restart the exercise right now.';
      toast({
        title: 'Retry unavailable',
        description: message,
        variant: 'destructive',
      });
      throw new Error(message);
    }

    if (isRetrying) {
      return;
    }

    setIsRetrying(true);

    try {
		      const { attempt: nextAttempt } = await restartPracticeAttempt({
		        client: ruoeSupabaseClient,
		        exerciseId: exerciseData.exercise.id,
		        studentId: user.id,
		        retryFromAttemptId: attemptId,
		      });

      applyRetryResult({
        nextAttempt,
        setAttemptId,
        setAttemptNumber,
        setAttemptStatus,
        setAttemptError,
        setEvaluationResults,
        setEvaluationData,
        setShowScoreModal,
        setViewMode,
        setIsEvaluating,
        lastHydratedAttemptRef,
      });

      const nextSearch = buildRetrySearchString(
        location.search,
        nextAttempt.id,
        'practice',
      );

      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true, state: null },
      );
    } catch (err) {
      const message =
        err instanceof AttemptResolutionError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to restart attempt. Please try again.';
      console.error('Failed to restart R&UoE attempt');
      toast({
        title: 'Retry unavailable',
        description: message,
        variant: 'destructive',
      });
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setIsRetrying(false);
    }
  }, [
    attemptId,
    exerciseData?.exercise?.id,
    isRetrying,
    location.pathname,
    location.search,
    navigate,
    toast,
    user?.id,
  ]);

  const handleEvaluate = useCallback(async () => {
    if (!attemptId || !exerciseData) {
      console.error('Cannot evaluate: missing attempt ID or exercise data');
      return;
    }

    if (viewMode === 'results') {
      return;
    }

    setIsEvaluating(true);

    try {
      const { data: evaluationPayload, error: evaluationError } = await supabase.rpc(
        'evaluate_ruoe_attempt',
        { p_attempt_id: attemptId },
      );

      if (evaluationError) {
        throw new Error(`Evaluation failed: ${evaluationError.message}`);
      }

      if (!evaluationPayload) {
        throw new Error('No evaluation data returned from server');
      }

      const normalizedEvaluation = normalizeEvaluationPayload(evaluationPayload);
      setEvaluationResults(normalizedEvaluation.questionResults);
      setEvaluationData(normalizedEvaluation);
      setAttemptStatus('completed');
      lastHydratedAttemptRef.current = attemptId;

      setTimeout(() => {
        setShowScoreModal(true);
      }, 500);

      const currentSearch = location.search.startsWith('?')
        ? location.search.slice(1)
        : location.search;
      const params = new URLSearchParams(currentSearch);
      const attemptValue = String(attemptId);
      let searchChanged = false;

      if (params.get('attempt') !== attemptValue) {
        params.set('attempt', attemptValue);
        searchChanged = true;
      }

      if (params.get('view') !== 'results') {
        params.set('view', 'results');
        searchChanged = true;
      }

      if (searchChanged) {
        navigate(
          {
            pathname: location.pathname,
            search: params.toString() ? `?${params.toString()}` : '',
          },
          { replace: true },
        );
      }

      setViewMode('results');
    } catch (err) {
      console.error('Error in handleEvaluate:');
      toast({
        title: 'Evaluation Failed',
        description: 'Failed to evaluate exercise. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [attemptId, exerciseData, location.pathname, location.search, navigate, toast, viewMode]);

  const getLayoutComponent = () => {
    if (!exerciseData || !attemptId) {
      return null;
    }

    const taskCode = exerciseData.taskType.task_code;

    const sharedProps = {
      exerciseData,
      attemptId,
      onEvaluate: handleEvaluate,
      isEvaluated: viewMode === 'results',
      evaluationResults,
      isEvaluating,
      evaluationData,
      onShowScoreModal: () => setShowScoreModal(true),
    };

    if (isClozeLayout(taskCode)) {
      return <RuoELayoutCloze key={attemptId} {...sharedProps} />;
    }

    if (isReadingLayout(taskCode)) {
      return <RuoELayoutReading key={attemptId} {...sharedProps} />;
    }

    throw new Error(`Unsupported task code: ${taskCode}`);
  };

  if (isLoading || attemptLoading || waitingForStudentProfile) {
    return (
      <FixedViewportPage paddingYClass="py-1.5">
        <Card className="shadow-sm h-full">
          <CardContent className="p-6 h-full">
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div className="lg:col-span-2">
                  <Skeleton className="h-96 w-full" />
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </FixedViewportPage>
    );
  }

  if (error) {
    return (
      <FixedViewportPage paddingYClass="py-1.5">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Exercise</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
            <div className="mt-4">
              <Button variant="outline" onClick={() => refetch()}>
                Try Again
              </Button>
              <Button
                variant="outline"
                className="ml-2"
                onClick={() => navigate('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </FixedViewportPage>
    );
  }

  if (attemptError && !attemptId) {
    return (
      <FixedViewportPage paddingYClass="py-1.5">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unable to start attempt</AlertTitle>
          <AlertDescription className="mt-2">
            {attemptError}
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </FixedViewportPage>
    );
  }

  if (!exerciseData || !attemptId) {
    return (
      <FixedViewportPage paddingYClass="py-1.5">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Exercise Not Found</AlertTitle>
          <AlertDescription>
            The requested exercise could not be found or you don't have access to it.
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </FixedViewportPage>
    );
  }

  return (
    <RuoEErrorBoundary>
      <FixedViewportPage paddingYClass="py-1.5">
        {getLayoutComponent()}
        {viewMode === 'results' && evaluationData && (
          <ScoreModal
            isOpen={showScoreModal}
            onClose={() => setShowScoreModal(false)}
            score={evaluationData.score}
            maxScore={evaluationData.maxScore}
            scorePoints={evaluationData.scorePoints}
          maxScorePoints={evaluationData.maxScorePoints}
          pointsPerQuestion={evaluationData.pointsPerQuestion}
          questionsCorrect={Object.values(evaluationData.questionResults ?? {}).filter(Boolean).length}
          totalQuestions={exerciseData.questions.length}
          exerciseTitle={exerciseData.exercise.title || 'R&UoE Exercise'}
          attemptNumber={attemptNumber}
          onRetry={handleRetryFromResults}
        />
      )}
      </FixedViewportPage>
    </RuoEErrorBoundary>
  );
};

export default RuoEPracticePage;
