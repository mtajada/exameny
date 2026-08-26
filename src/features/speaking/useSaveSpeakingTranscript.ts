import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SpeakingTranscript } from './types';

type SaveSpeakingTranscriptState = {
  isSaving: boolean;
  error: string | null;
  saveTranscript: (sessionId: string, transcript: SpeakingTranscript) => Promise<boolean>;
};

export function useSaveSpeakingTranscript(demoMode = false): SaveSpeakingTranscriptState {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTranscript = useCallback(async (
    sessionId: string,
    transcript: SpeakingTranscript,
  ): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      if (demoMode) {
        return true;
      }

      const { error: invokeError } = await supabase.functions.invoke('save-speaking-transcript', {
        body: { sessionId, transcript },
      });
      if (invokeError) {
        throw new Error('Transcript save failed.');
      }
      return true;
    } catch {
      setError('Could not save the transcript. Your text remains on this page so you can try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [demoMode]);

  return { isSaving, error, saveTranscript };
}
