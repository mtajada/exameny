import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_SPEAKING_PERSONAS, DEMO_SPEAKING_SCENARIOS } from './demoCatalog';
import type { SpeakingPersona, SpeakingScenario } from './types';

type SpeakingCatalogState = {
  personas: SpeakingPersona[];
  scenarios: SpeakingScenario[];
  isLoading: boolean;
  error: string | null;
};

const demoState: SpeakingCatalogState = {
  personas: DEMO_SPEAKING_PERSONAS,
  scenarios: DEMO_SPEAKING_SCENARIOS,
  isLoading: false,
  error: null,
};

export function useSpeakingCatalog(demoMode = false): SpeakingCatalogState {
  const [state, setState] = useState<SpeakingCatalogState>(
    demoMode ? demoState : { personas: [], scenarios: [], isLoading: true, error: null },
  );

  useEffect(() => {
    if (demoMode) {
      setState(demoState);
      return;
    }

    let cancelled = false;

    const loadCatalog = async (): Promise<void> => {
      setState((current) => ({ ...current, isLoading: true, error: null }));
      const [personasResult, scenariosResult] = await Promise.all([
        supabase
          .from('speaking_personas')
          .select('id, name, accent, gender, default_prompt')
          .eq('is_active', true)
          .order('id'),
        supabase
          .from('speaking_scenarios')
          .select('id, category, title, description_md, default_persona_id')
          .order('category')
          .order('title'),
      ]);

      if (cancelled) return;
      if (personasResult.error || scenariosResult.error) {
        setState({
          personas: [],
          scenarios: [],
          isLoading: false,
          error: 'Could not load speaking partners and scenarios. Please try again.',
        });
        return;
      }

      setState({
        personas: (personasResult.data ?? []).map((persona) => ({
          id: persona.id,
          name: persona.name,
          accent: persona.accent,
          gender: persona.gender,
          defaultPrompt: persona.default_prompt,
        })),
        scenarios: (scenariosResult.data ?? []).map((scenario) => ({
          id: scenario.id,
          category: scenario.category,
          title: scenario.title,
          description: scenario.description_md ?? '',
          defaultPersonaId: scenario.default_persona_id,
        })),
        isLoading: false,
        error: null,
      });
    };

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [demoMode]);

  return state;
}
