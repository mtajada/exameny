import type { SpeakingPersona, SpeakingScenario } from './types';

export const DEMO_SPEAKING_PERSONAS: SpeakingPersona[] = [
  {
    id: 1,
    name: 'Morgan',
    accent: 'neutral',
    gender: 'nonbinary',
    defaultPrompt: 'A supportive conversation partner who asks one clear question at a time.',
  },
];

export const DEMO_SPEAKING_SCENARIOS: SpeakingScenario[] = [
  {
    id: 1,
    category: 'Collaboration',
    title: 'Plan a community event',
    description: 'Agree on a goal, divide three tasks and decide how to invite local participants.',
    defaultPersonaId: 1,
  },
];
