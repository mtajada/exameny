import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSpeakingCatalog } from './useSpeakingCatalog';
import type { SpeakingSelection } from './types';

type SessionRow = {
  id: string;
  personaId: number;
  scenarioId: number | null;
  status: string;
  nuances: string | null;
  useProfile: boolean;
};

type SpeakingSessionState = {
  selection: SpeakingSelection | null;
  status: string | null;
  isLoading: boolean;
  error: string | null;
};

export function useSpeakingSession(sessionId: string | undefined): SpeakingSessionState {
  const catalog = useSpeakingCatalog(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setSessionError('The speaking session identifier is missing.');
      setSessionLoading(false);
      return;
    }

    const loadSession = async (): Promise<void> => {
      setSessionLoading(true);
      setSessionError(null);
      const { data, error } = await supabase
        .from('speaking_sessions')
        .select('id, persona_id, scenario_id, status, nuances, use_profile')
        .eq('id', sessionId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setSessionError('This speaking session is unavailable or does not belong to your account.');
        setSessionLoading(false);
        return;
      }

      setSession({
        id: data.id,
        personaId: data.persona_id,
        scenarioId: data.scenario_id,
        status: data.status,
        nuances: data.nuances,
        useProfile: data.use_profile,
      });
      setSessionLoading(false);
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const selection = useMemo<SpeakingSelection | null>(() => {
    if (!session) return null;
    const persona = catalog.personas.find((candidate) => candidate.id === session.personaId);
    const scenario = catalog.scenarios.find((candidate) => candidate.id === session.scenarioId);
    if (!persona || !scenario) return null;
    return {
      persona,
      scenario,
      useProfile: session.useProfile,
      nuances: session.nuances ?? '',
    };
  }, [catalog.personas, catalog.scenarios, session]);

  const isLoading = sessionLoading || catalog.isLoading;
  const error = sessionError ?? catalog.error ?? (
    !isLoading && session && !selection
      ? 'The partner or scenario for this session is no longer available.'
      : null
  );

  return { selection, status: session?.status ?? null, isLoading, error };
}
