export type SpeakingPersona = {
  id: number;
  name: string;
  accent: string;
  gender: string;
  defaultPrompt: string | null;
};

export type SpeakingScenario = {
  id: number;
  category: string;
  title: string;
  description: string;
  defaultPersonaId: number | null;
};

export type SpeakingSelection = {
  persona: SpeakingPersona;
  scenario: SpeakingScenario;
  useProfile: boolean;
  nuances: string;
};

export type SpeakingTurn = {
  speaker: 'agent' | 'user';
  start_ms: number | null;
  end_ms: number | null;
  text: string;
  filler_count: number | null;
  wpm: number | null;
};

export type SpeakingTranscript = {
  version: 1;
  source: 'typed-rehearsal';
  full_text: string;
  turns: SpeakingTurn[];
};
