import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSpeakingTranscript, createAgentTurn, createLearnerTurn } from '../transcript';
import { useCreateSpeakingSession } from '../useCreateSpeakingSession';
import { useSaveSpeakingTranscript } from '../useSaveSpeakingTranscript';

const { invokeMock, rpcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    functions: { invoke: invokeMock },
  },
}));

describe('speaking persistence hooks', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    rpcMock.mockReset();
  });

  it('creates the authenticated session through the restricted database function', async () => {
    rpcMock.mockResolvedValue({
      data: '00000000-0000-4000-8000-000000000123',
      error: null,
    });
    const { result } = renderHook(() => useCreateSpeakingSession(false));
    let sessionId: string | null = null;

    await act(async () => {
      sessionId = await result.current.createSession({
        personaId: 1,
        scenarioId: 2,
        useProfile: false,
        nuances: 'Practise polite alternatives.',
      });
    });

    expect(sessionId).toBe('00000000-0000-4000-8000-000000000123');
    expect(rpcMock).toHaveBeenCalledWith('create_speaking_session', {
      p_persona_id: 1,
      p_scenario_id: 2,
      p_use_profile: false,
      p_nuances: 'Practise polite alternatives.',
    });
  });

  it('sends transcripts only to the authenticated Edge boundary', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    const transcript = buildSpeakingTranscript([
      createAgentTurn('What would you suggest?'),
      createLearnerTurn('We could ask the volunteers.', 0, 5_000),
    ]);
    const { result } = renderHook(() => useSaveSpeakingTranscript(false));
    let saved = false;

    await act(async () => {
      saved = await result.current.saveTranscript(
        '00000000-0000-4000-8000-000000000123',
        transcript,
      );
    });

    expect(saved).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('save-speaking-transcript', {
      body: {
        sessionId: '00000000-0000-4000-8000-000000000123',
        transcript,
      },
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
