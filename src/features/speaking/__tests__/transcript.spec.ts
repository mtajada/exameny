import { describe, expect, it } from 'vitest';
import {
  buildSpeakingTranscript,
  createAgentTurn,
  createLearnerTurn,
  getNextPartnerPrompt,
  getOpeningPrompt,
} from '../transcript';
import { DEMO_SPEAKING_PERSONAS, DEMO_SPEAKING_SCENARIOS } from '../demoCatalog';

describe('speaking transcript helpers', () => {
  it('creates deterministic prompts from the clean-room catalog', () => {
    const persona = DEMO_SPEAKING_PERSONAS[0];
    const scenario = DEMO_SPEAKING_SCENARIOS[0];

    expect(getOpeningPrompt(persona, scenario)).toContain('Plan a community event');
    expect(getNextPartnerPrompt(persona, 1)).toContain('Suggest an alternative');
    expect(getNextPartnerPrompt(persona, 2)).toContain('Compare the options');
    expect(getNextPartnerPrompt(persona, 3)).toContain('Good work');
  });

  it('keeps speech-derived metrics empty when no audio is recorded', () => {
    const turn = createLearnerTurn('Um, we could invite volunteers.', 1_000, 31_000);

    expect(turn).toEqual({
      speaker: 'user',
      start_ms: 1_000,
      end_ms: 31_000,
      text: 'Um, we could invite volunteers.',
      filler_count: null,
      wpm: null,
    });
  });

  it('builds the restricted typed-rehearsal transcript contract', () => {
    const transcript = buildSpeakingTranscript([
      createAgentTurn('What would you suggest?'),
      createLearnerTurn('We could meet on Saturday.', 0, 5_000),
    ]);

    expect(transcript.source).toBe('typed-rehearsal');
    expect(transcript.version).toBe(1);
    expect(transcript.full_text).toBe(
      'Partner: What would you suggest?\nLearner: We could meet on Saturday.',
    );
  });
});
