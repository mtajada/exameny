import type {
  SpeakingPersona,
  SpeakingScenario,
  SpeakingTranscript,
  SpeakingTurn,
} from './types';

const clampElapsedMs = (value: number, maximum: number): number =>
  Math.min(maximum, Math.max(0, Math.round(value)));

export function createAgentTurn(text: string, atMs = 0): SpeakingTurn {
  return {
    speaker: 'agent',
    start_ms: atMs,
    end_ms: atMs,
    text: text.trim(),
    filler_count: null,
    wpm: null,
  };
}

export function createLearnerTurn(text: string, startMs: number, endMs: number): SpeakingTurn {
  const normalizedText = text.trim();
  const safeStart = clampElapsedMs(startMs, 7_200_000);
  const safeEnd = Math.max(safeStart, clampElapsedMs(endMs, 7_200_000));

  return {
    speaker: 'user',
    start_ms: safeStart,
    end_ms: safeEnd,
    text: normalizedText,
    filler_count: null,
    wpm: null,
  };
}

export function getOpeningPrompt(persona: SpeakingPersona, scenario: SpeakingScenario): string {
  return `${persona.name}: Let's practise “${scenario.title}”. ${scenario.description} Start by suggesting one goal.`;
}

export function getNextPartnerPrompt(
  persona: SpeakingPersona,
  learnerTurnCount: number,
): string {
  if (learnerTurnCount === 1) {
    return `${persona.name}: That gives us a starting point. Suggest an alternative and explain one benefit.`;
  }
  if (learnerTurnCount === 2) {
    return `${persona.name}: Compare the options. Which would you choose, and what should happen next?`;
  }
  return `${persona.name}: Good work. You proposed options, made a choice and explained a next step.`;
}

export function buildSpeakingTranscript(turns: SpeakingTurn[]): SpeakingTranscript {
  return {
    version: 1,
    source: 'typed-rehearsal',
    full_text: turns
      .map((turn) => `${turn.speaker === 'agent' ? 'Partner' : 'Learner'}: ${turn.text}`)
      .join('\n'),
    turns,
  };
}
