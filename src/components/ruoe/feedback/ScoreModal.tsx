import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreDisplay } from './ScoreDisplay';
import { Trophy, BarChart3, TrendingUp, Home, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  score: number;
  maxScore: number;
  scorePoints: number;
  maxScorePoints: number;
  pointsPerQuestion: number;
  questionsCorrect: number;
  totalQuestions: number;
  exerciseTitle: string;
  trigger?: React.ReactNode;
  attemptNumber?: number | null;
  onRetry?: () => Promise<void>;
}

export const ScoreModal: React.FC<ScoreModalProps> = ({
  isOpen,
  onClose,
  score,
  maxScore,
  scorePoints,
  maxScorePoints,
  pointsPerQuestion,
  questionsCorrect,
  totalQuestions,
  exerciseTitle,
  trigger,
  attemptNumber = null,
  onRetry,
}) => {
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRetryError(null);
      setIsRetrying(false);
    }
  }, [isOpen, attemptNumber]);

  const attemptLabel = useMemo(() => {
    if (typeof attemptNumber === 'number' && Number.isFinite(attemptNumber) && attemptNumber > 0) {
      return `Attempt #${attemptNumber}`;
    }
    return null;
  }, [attemptNumber]);

  const extractRetryErrorMessage = (error: unknown): string => {
    if (!error) {
      return 'We couldn’t restart the exercise. Please try again.';
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'We couldn’t restart the exercise. Please try again.';
  };

  const handleRetry = async () => {
    if (typeof onRetry !== 'function' || isRetrying) {
      return;
    }
    setRetryError(null);
    setIsRetrying(true);
    try {
      await onRetry();
      onClose();
    } catch (error) {
      setRetryError(extractRetryErrorMessage(error));
    } finally {
      setIsRetrying(false);
    }
  };

  const canRetry = typeof onRetry === 'function';

  // Get performance level for the header
  const getPerformanceLevel = () => {
    if (percentage >= 90) return { text: 'Excellent', color: 'text-green-600', icon: <Trophy className="h-6 w-6 text-yellow-500" /> };
    if (percentage >= 80) return { text: 'Very Good', color: 'text-green-600', icon: <TrendingUp className="h-6 w-6 text-green-500" /> };
    if (percentage >= 70) return { text: 'Good', color: 'text-blue-600', icon: <BarChart3 className="h-6 w-6 text-blue-500" /> };
    if (percentage >= 60) return { text: 'Fair', color: 'text-yellow-600', icon: <BarChart3 className="h-6 w-6 text-yellow-500" /> };
    return { text: 'Needs Improvement', color: 'text-red-600', icon: <BarChart3 className="h-6 w-6 text-red-500" /> };
  };

  const performance = getPerformanceLevel();

  const modalContent = (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogDescription className="sr-only">
          Review your score and choose what to do next.
        </DialogDescription>
        <div className="flex items-center justify-between">
          <DialogTitle className="flex items-center gap-3">
            {performance.icon}
            <div>
              <div className="text-xl font-bold">Exercise Complete!</div>
              <div className="text-sm text-gray-600 font-normal mt-1">
                {exerciseTitle}
              </div>
            </div>
          </DialogTitle>
          <div className="flex flex-col items-end gap-2 text-right">
            {attemptLabel && (
              <Badge variant="secondary" className="text-xs">
                {attemptLabel}
              </Badge>
            )}
            <Badge variant="outline" className={`${performance.color} border-current`}>
              {performance.text}
            </Badge>
          </div>
        </div>
      </DialogHeader>

      <div className="mt-4">
        <ScoreDisplay
          score={score}
          maxScore={maxScore}
          scorePoints={scorePoints}
          maxScorePoints={maxScorePoints}
          pointsPerQuestion={pointsPerQuestion}
          questionsCorrect={questionsCorrect}
          totalQuestions={totalQuestions}
        />
      </div>

      {retryError && (
        <div
          className="mt-4 flex items-center justify-center gap-2 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span>{retryError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-center mt-6 gap-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Review Answers
        </Button>
        {canRetry && (
          <Button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            variant="default"
            aria-label="Retry Exercise"
          >
            {isRetrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
            Retry Exercise
          </Button>
        )}
        <Button
          type="button"
          onClick={() => navigate('/dashboard')}
          variant="outline"
          aria-label="Back to dashboard"
          title="Back to dashboard"
        >
          <Home className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    </DialogContent>
  );

  // If trigger is provided, use it as a dialog trigger
  if (trigger) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        {modalContent}
      </Dialog>
    );
  }

  // Otherwise, use as a controlled dialog
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {modalContent}
    </Dialog>
  );
};
