import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SpeakingRehearsal } from '@/features/speaking/SpeakingRehearsal';
import { useCreateSpeakingSession } from '@/features/speaking/useCreateSpeakingSession';
import { useSaveSpeakingTranscript } from '@/features/speaking/useSaveSpeakingTranscript';
import { useSpeakingCatalog } from '@/features/speaking/useSpeakingCatalog';
import type { SpeakingSelection } from '@/features/speaking/types';

type SpeakingPracticePageProps = {
  demoMode?: boolean;
};

export default function SpeakingPracticePage({ demoMode = false }: SpeakingPracticePageProps) {
  const navigate = useNavigate();
  const catalog = useSpeakingCatalog(demoMode);
  const creator = useCreateSpeakingSession(demoMode);
  const saver = useSaveSpeakingTranscript(true);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [useProfile, setUseProfile] = useState(false);
  const [nuances, setNuances] = useState('');
  const [demoSelection, setDemoSelection] = useState<SpeakingSelection | null>(null);

  useEffect(() => {
    if (scenarioId !== null || catalog.scenarios.length === 0) return;
    const scenario = catalog.scenarios[0];
    setScenarioId(scenario.id);
    setPersonaId(scenario.defaultPersonaId ?? catalog.personas[0]?.id ?? null);
  }, [catalog.personas, catalog.scenarios, scenarioId]);

  const selection = useMemo<SpeakingSelection | null>(() => {
    const persona = catalog.personas.find((candidate) => candidate.id === personaId);
    const scenario = catalog.scenarios.find((candidate) => candidate.id === scenarioId);
    if (!persona || !scenario) return null;
    return { persona, scenario, useProfile, nuances: nuances.trim() };
  }, [catalog.personas, catalog.scenarios, nuances, personaId, scenarioId, useProfile]);

  const chooseScenario = (value: string): void => {
    const nextId = Number.parseInt(value, 10);
    const scenario = catalog.scenarios.find((candidate) => candidate.id === nextId);
    setScenarioId(Number.isSafeInteger(nextId) ? nextId : null);
    if (scenario?.defaultPersonaId) setPersonaId(scenario.defaultPersonaId);
  };

  const start = async (): Promise<void> => {
    if (!selection) return;
    const sessionId = await creator.createSession({
      personaId: selection.persona.id,
      scenarioId: selection.scenario.id,
      useProfile: selection.useProfile,
      nuances: selection.nuances,
    });
    if (!sessionId) return;

    if (demoMode) {
      setDemoSelection(selection);
      return;
    }
    navigate(`/speaking/session/${sessionId}`);
  };

  if (demoSelection) {
    return (
      <div className={demoMode ? 'min-h-screen bg-slate-100 text-slate-950' : ''}>
        <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
          <Button onClick={() => setDemoSelection(null)} type="button" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" /> Choose another rehearsal
          </Button>
          <SpeakingRehearsal
            demoMode
            isSaving={saver.isSaving}
            onComplete={(transcript) => saver.saveTranscript('local-demo-session', transcript)}
            saveError={saver.error}
            selection={demoSelection}
          />
        </div>
      </div>
    );
  }

  const backTarget = demoMode ? '/demo' : '/dashboard';
  const backLabel = demoMode ? 'Back to the activity demo' : 'Back to dashboard';

  return (
    <div className={demoMode ? 'min-h-screen bg-slate-100 text-slate-950' : ''}>
      <div className="mx-auto max-w-5xl space-y-8 px-5 py-8 sm:py-12">
        <header>
          <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to={backTarget}>
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <div className="mt-5 flex items-start gap-4">
            <span className="rounded-2xl bg-cyan-100 p-3 text-cyan-800">
              <MessageCircle className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700">Speaking practice</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Rehearse a real conversation structure.</h1>
              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                Choose an original scenario and a conversation partner. Speak each answer aloud, then type a short
                transcript so you can retain the learning evidence without recording audio.
              </p>
            </div>
          </div>
        </header>

        {demoMode && (
          <Alert className="border-cyan-200 bg-cyan-50 text-cyan-950">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Local synthetic demo</AlertTitle>
            <AlertDescription>
              This route does not sign in, contact Supabase, call an AI model or retain your answers after refresh.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Set up the rehearsal</CardTitle>
            <CardDescription>All public scenarios and demo identities are original clean-room material.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {catalog.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading speaking options…
              </div>
            )}
            {catalog.error && (
              <Alert variant="destructive">
                <AlertTitle>Speaking options unavailable</AlertTitle>
                <AlertDescription>{catalog.error}</AlertDescription>
              </Alert>
            )}

            {!catalog.isLoading && !catalog.error && catalog.scenarios.length === 0 && (
              <Alert>
                <AlertTitle>No speaking scenarios yet</AlertTitle>
                <AlertDescription>Load the synthetic seed or add an original scenario before starting.</AlertDescription>
              </Alert>
            )}

            {catalog.scenarios.length > 0 && (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="speaking-scenario">Scenario</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="speaking-scenario"
                    onChange={(event) => chooseScenario(event.target.value)}
                    value={scenarioId ?? ''}
                  >
                    {catalog.scenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.category} · {scenario.title}
                      </option>
                    ))}
                  </select>
                  {selection && <p className="text-sm leading-6 text-muted-foreground">{selection.scenario.description}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="speaking-persona">Conversation partner</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="speaking-persona"
                    onChange={(event) => setPersonaId(Number.parseInt(event.target.value, 10))}
                    value={personaId ?? ''}
                  >
                    {catalog.personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name} · {persona.accent} English
                      </option>
                    ))}
                  </select>
                  <p className="text-sm leading-6 text-muted-foreground">
                    The partner uses deterministic prompts in this edition; no voice provider is required.
                  </p>
                </div>
              </div>
            )}

            {!demoMode && (
              <label className="flex items-start gap-3 rounded-xl border p-4 text-sm leading-6">
                <input
                  checked={useProfile}
                  className="mt-1 h-4 w-4"
                  onChange={(event) => setUseProfile(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong className="block text-foreground">Keep my learning-profile preference with this session</strong>
                  <span className="text-muted-foreground">This stores only the preference flag; the rehearsal does not expose profile data to a provider.</span>
                </span>
              </label>
            )}

            <div className="space-y-2">
              <Label htmlFor="speaking-focus">Optional practice focus</Label>
              <Input
                id="speaking-focus"
                maxLength={240}
                onChange={(event) => setNuances(event.target.value)}
                placeholder="For example: suggest alternatives politely."
                value={nuances}
              />
              <p className="text-xs text-muted-foreground">Avoid names, contact details or real learner information.</p>
            </div>

            {creator.error && (
              <Alert variant="destructive">
                <AlertTitle>Session not started</AlertTitle>
                <AlertDescription>{creator.error}</AlertDescription>
              </Alert>
            )}

            <Button disabled={!selection || creator.isCreating} onClick={() => void start()} type="button">
              {creator.isCreating ? 'Starting rehearsal…' : 'Start speaking rehearsal'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
