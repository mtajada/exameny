import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type CreateSpeakingSessionInput = {
  personaId: number;
  scenarioId: number;
  useProfile: boolean;
  nuances: string;
};

type CreateSpeakingSessionState = {
  isCreating: boolean;
  error: string | null;
  createSession: (input: CreateSpeakingSessionInput) => Promise<string | null>;
};

export function useCreateSpeakingSession(demoMode = false): CreateSpeakingSessionState {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async (input: CreateSpeakingSessionInput): Promise<string | null> => {
    setIsCreating(true);
    setError(null);

    try {
      if (demoMode) {
        return 'local-demo-session';
      }

      const { data, error: rpcError } = await supabase.rpc('create_speaking_session', {
        p_persona_id: input.personaId,
        p_scenario_id: input.scenarioId,
        p_use_profile: input.useProfile,
        p_nuances: input.nuances.trim() || undefined,
      });

      if (rpcError || typeof data !== 'string' || data.length === 0) {
        throw new Error('Speaking session creation failed.');
      }
      return data;
    } catch {
      setError('Could not start the speaking rehearsal. Please try again.');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [demoMode]);

  return { isCreating, error, createSession };
}
