import * as React from 'react';
import type { MembershipRole } from '@/contexts/AuthContextBase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge';
import { normalizeEdgeFunctionError } from '@/lib/auth/edge';
import { mapOnboardingErrorToCopy, onboardingErrorHasMetadata } from '@/lib/auth/errorCopy';
import { saveUserPreferences } from '@/lib/auth/saveUserPreferences';
import { OnboardingCard } from './OnboardingCard';
import { useExamLevels, useExamOptions } from './hooks';

interface OnboardingFlowProps {
  requiresFullName: boolean;
  requiresTargets: boolean;
  role: MembershipRole | null;
  fullName: string | null;
  targetExamId: number | null;
  targetLevelId: number | null;
  userEmail?: string | null;
  onSignOut?: () => Promise<void> | void;
  onPreferencesUpdated: () => Promise<void> | void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  requiresFullName,
  requiresTargets,
  role,
  fullName,
  targetExamId,
  targetLevelId,
  userEmail,
  onSignOut,
  onPreferencesUpdated,
}) => {
  const [nameValue, setNameValue] = React.useState(fullName ?? '');
  const [selectedExamId, setSelectedExamId] = React.useState<number | null>(targetExamId);
  const [selectedLevelId, setSelectedLevelId] = React.useState<number | null>(targetLevelId);
  const [error, setError] = React.useState<EdgeFunctionErrorPayload | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    setNameValue(fullName ?? '');
  }, [fullName]);

  React.useEffect(() => {
    setSelectedExamId(targetExamId);
  }, [targetExamId]);

  React.useEffect(() => {
    setSelectedLevelId(targetLevelId);
  }, [targetLevelId]);

  const { data: examOptions = [], isLoading: isLoadingExams } = useExamOptions();
  const { data: levelOptions = [], isLoading: isLoadingLevels } = useExamLevels(selectedExamId);

  const handleSignOut = async () => {
    if (!onSignOut || isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    setError(null);
    try {
      await onSignOut();
    } catch (unknownError) {
      const description = unknownError instanceof Error ? unknownError.message : 'Unexpected error. Please try again.';
      toast({
        title: 'Unable to sign out',
        description,
        variant: 'destructive',
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const footer = onSignOut ? (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{userEmail ?? 'this account'}</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        className="h-12 w-full rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground sm:w-auto"
        onClick={() => void handleSignOut()}
        disabled={isSubmitting || isSigningOut}
        aria-busy={isSigningOut}
      >
        <span className={isSigningOut ? 'opacity-80' : undefined}>{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
      </Button>
    </div>
  ) : null;

  const handleNameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requiresFullName) {
      return;
    }
    const trimmed = nameValue.trim();
    if (trimmed.length === 0) {
      setError(buildManualError('Your full name is required.'));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await saveUserPreferences(
        {
          fullName: trimmed,
          fullNameProvided: true,
        },
        { refreshSession: false },
      );
      toast({
        title: 'Name saved',
        description: 'Thanks! We updated your invitation with your full name.',
      });
      await onPreferencesUpdated();
    } catch (unknownError) {
      setError(normalizeEdgeFunctionError(unknownError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTargetsSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requiresTargets) {
      return;
    }
    if (selectedExamId == null || selectedLevelId == null) {
      setError(buildManualError('Select both exam and level to continue.'));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await saveUserPreferences(
        {
          targetExamId: selectedExamId,
          targetLevelId: selectedLevelId,
        },
        { refreshSession: false },
      );
      toast({
        title: 'Learning goal saved',
        description: 'We will tailor your tasks to this exam and level.',
      });
      await onPreferencesUpdated();
    } catch (unknownError) {
      setError(normalizeEdgeFunctionError(unknownError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const shouldShowNameStep = requiresFullName;
  const shouldShowTargetsStep = !requiresFullName && requiresTargets;

  if (!shouldShowNameStep && !shouldShowTargetsStep) {
    return null;
  }

  if (shouldShowNameStep) {
    return (
      <OnboardingCard
        title="What's your name?"
        description={
          role === 'academy_admin'
            ? 'Confirm your full name before entering the console.'
            : 'Share your full name so we can match you to the right classes.'
        }
        footer={footer}
      >
        <OnboardingErrorNotice error={error} />
        <form className="space-y-4" onSubmit={handleNameSubmit}>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor="onboarding-full-name">
              Full name
            </Label>
            <Input
              id="onboarding-full-name"
              placeholder="e.g., Anna Greene"
              value={nameValue}
              onChange={(event) => setNameValue(event.target.value)}
              disabled={isSubmitting}
              autoComplete="name"
              className="h-12 rounded-md"
            />
          </div>
          <Button
            className="h-12 w-full rounded-md text-sm font-semibold"
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            <span className={isSubmitting ? 'opacity-80' : undefined} aria-live="polite">
              {isSubmitting ? 'Saving…' : 'Save and continue'}
            </span>
          </Button>
        </form>
      </OnboardingCard>
    );
  }

  return (
    <OnboardingCard
      title="Choose your goal"
      description="Pick the exam and level you're preparing for."
      footer={footer}
    >
      <OnboardingErrorNotice error={error} />
      <form className="space-y-4" onSubmit={handleTargetsSubmit}>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" htmlFor="onboarding-exam">
            Exam
          </Label>
          <Select
            value={selectedExamId == null ? undefined : String(selectedExamId)}
            onValueChange={(value) => {
              if (!value) {
                setSelectedExamId(null);
                setSelectedLevelId(null);
                return;
              }
              const nextExamId = Number(value);
              setSelectedExamId(Number.isFinite(nextExamId) ? nextExamId : null);
              setSelectedLevelId(null);
            }}
            disabled={isSubmitting || isLoadingExams}
          >
            <SelectTrigger id="onboarding-exam" className="h-12 rounded-md">
              <SelectValue placeholder={isLoadingExams ? 'Loading exams…' : 'Select an exam'} />
            </SelectTrigger>
            <SelectContent>
              {examOptions.map((exam) => (
                <SelectItem key={exam.id} value={String(exam.id)}>
                  {exam.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" htmlFor="onboarding-level">
            Level
          </Label>
          <Select
            value={selectedLevelId == null ? undefined : String(selectedLevelId)}
            onValueChange={(value) => {
              if (!value) {
                setSelectedLevelId(null);
                return;
              }
              const nextLevelId = Number(value);
              setSelectedLevelId(Number.isFinite(nextLevelId) ? nextLevelId : null);
            }}
            disabled={isSubmitting || isLoadingLevels || selectedExamId == null}
          >
            <SelectTrigger id="onboarding-level" className="h-12 rounded-md">
              <SelectValue
                placeholder={
                  selectedExamId == null
                    ? 'Select an exam first'
                    : isLoadingLevels
                      ? 'Loading levels…'
                      : 'Select a level'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {levelOptions.map((level) => (
                <SelectItem key={level.id} value={String(level.id)}>
                  {level.name} ({level.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="h-12 w-full rounded-md text-sm font-semibold"
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          <span className={isSubmitting ? 'opacity-80' : undefined} aria-live="polite">
            {isSubmitting ? 'Saving…' : 'Save and continue'}
          </span>
        </Button>
      </form>
    </OnboardingCard>
  );
};

const buildManualError = (message: string): EdgeFunctionErrorPayload => ({
  message,
  code: null,
  requestId: null,
  status: null,
  details: { clientGenerated: true },
});

const OnboardingErrorNotice: React.FC<{ error: EdgeFunctionErrorPayload | null }> = ({ error }) => {
  if (!error) {
    return null;
  }
  const resolvedMessage = mapOnboardingErrorToCopy(error, { allowClientGeneratedMessage: true });
  const hasMetadata = onboardingErrorHasMetadata(error);
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <span>{resolvedMessage}</span>
        {hasMetadata ? (
          <span className="mt-1 block text-xs text-red-500/80">
            {error.code ? `Error code: ${error.code}` : null}
            {error.code && error.requestId ? ' · ' : null}
            {error.requestId ? `Request ID: ${error.requestId}` : null}
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};
