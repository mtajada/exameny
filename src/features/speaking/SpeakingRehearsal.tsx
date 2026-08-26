import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Keyboard, MessageCircle, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  buildSpeakingTranscript,
  createAgentTurn,
  createLearnerTurn,
  getNextPartnerPrompt,
  getOpeningPrompt,
} from './transcript';
import type { SpeakingSelection, SpeakingTranscript, SpeakingTurn } from './types';

type SpeakingRehearsalProps = {
  selection: SpeakingSelection;
  demoMode?: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  onComplete: (transcript: SpeakingTranscript) => Promise<boolean>;
  now?: () => number;
};

const TARGET_LEARNER_TURNS = 3;

export function SpeakingRehearsal({
  selection,
  demoMode = false,
  isSaving = false,
  saveError = null,
  onComplete,
  now = () => Date.now(),
}: SpeakingRehearsalProps) {
  const startedAt = useRef(now());
  const promptStartedAt = useRef(startedAt.current);
  const [turns, setTurns] = useState<SpeakingTurn[]>([
    createAgentTurn(getOpeningPrompt(selection.persona, selection.scenario)),
  ]);
  const [draft, setDraft] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const learnerTurnCount = useMemo(
    () => turns.filter((turn) => turn.speaker === 'user').length,
    [turns],
  );
  const readyToFinish = learnerTurnCount >= TARGET_LEARNER_TURNS;

  const addLearnerTurn = (): void => {
    const text = draft.trim();
    if (!text || readyToFinish) return;

    const submittedAt = now();
    const learnerTurn = createLearnerTurn(
      text,
      promptStartedAt.current - startedAt.current,
      submittedAt - startedAt.current,
    );
    const nextLearnerTurnCount = learnerTurnCount + 1;
    const partnerTurn = createAgentTurn(
      getNextPartnerPrompt(selection.persona, nextLearnerTurnCount),
      Math.max(0, submittedAt - startedAt.current + 250),
    );

    setTurns((current) => [...current, learnerTurn, partnerTurn]);
    setDraft('');
    promptStartedAt.current = submittedAt;
  };

  const finish = async (): Promise<void> => {
    if (!readyToFinish || isSaving || isSaved) return;
    setIsComplete(true);
    const saved = await onComplete(buildSpeakingTranscript(turns));
    setIsSaved(saved);
    if (!saved) setIsComplete(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selection.scenario.category}</Badge>
            <Badge variant="outline">Partner: {selection.persona.name}</Badge>
          </div>
          <CardTitle className="pt-2">{selection.scenario.title}</CardTitle>
          <CardDescription>{selection.scenario.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {selection.nuances && (
            <Alert>
              <MessageCircle className="h-4 w-4" />
              <AlertTitle>Your practice focus</AlertTitle>
              <AlertDescription>{selection.nuances}</AlertDescription>
            </Alert>
          )}
          <ol className="space-y-3" aria-label="Speaking rehearsal transcript" aria-live="polite">
            {turns.map((turn, index) => (
              <li
                className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-6 ${
                  turn.speaker === 'agent'
                    ? 'bg-muted text-foreground'
                    : 'ml-auto bg-primary text-primary-foreground'
                }`}
                key={`${turn.speaker}-${index}-${turn.text}`}
              >
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide opacity-70">
                  {turn.speaker === 'agent' ? selection.persona.name : 'You'}
                </span>
                {turn.text}
              </li>
            ))}
          </ol>

          {!readyToFinish && (
            <div className="space-y-2">
              <Label htmlFor="speaking-turn">Speak aloud, then type a short transcript of your answer</Label>
              <Textarea
                id="speaking-turn"
                maxLength={2_000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type what you said so the rehearsal can be reviewed later."
                rows={5}
                value={draft}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{draft.length}/2,000 characters</p>
                <Button disabled={!draft.trim()} onClick={addLearnerTurn} type="button">
                  Add answer
                </Button>
              </div>
            </div>
          )}

          {readyToFinish && !isSaved && (
            <div className="space-y-3">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Rehearsal ready to finish</AlertTitle>
                <AlertDescription>
                  Review the three answers above, then save this typed transcript.
                </AlertDescription>
              </Alert>
              {saveError && (
                <Alert variant="destructive">
                  <AlertTitle>Transcript not saved</AlertTitle>
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}
              <Button disabled={isSaving || isComplete} onClick={() => void finish()} type="button">
                {isSaving ? 'Saving transcript…' : 'Finish and save transcript'}
              </Button>
            </div>
          )}

          {isSaved && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>{demoMode ? 'Local demo completed' : 'Transcript saved'}</AlertTitle>
              <AlertDescription>
                {demoMode
                  ? 'This synthetic rehearsal stayed in memory and will be discarded when you leave or refresh.'
                  : 'The transcript was saved to your own speaking session.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" /> How this rehearsal works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Read the partner prompt.</li>
              <li>Answer aloud in your own words.</li>
              <li>Type a short transcript of what you said.</li>
            </ol>
          </CardContent>
        </Card>
        <Alert>
          <Keyboard className="h-4 w-4" />
          <AlertTitle>No microphone or voice provider</AlertTitle>
          <AlertDescription>
            This public workflow does not record audio or contact an external speech service.
          </AlertDescription>
        </Alert>
        <div className="flex gap-3 rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <p>Do not include names, contact details or other personal information in a practice answer.</p>
        </div>
      </aside>
    </div>
  );
}
