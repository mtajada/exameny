import { supabase } from '@/integrations/supabase/client';

import type { EdgeFunctionErrorPayload, EdgeMetadataCarrier } from './edge';
import { normalizeEdgeFunctionError } from './edge';
import { refreshSessionSafely } from './refreshSessionSafely';

type NullableNumber = number | null | undefined;

export interface SaveUserPreferencesPayload {
  fullName?: string | null;
  fullNameProvided?: boolean;
  targetExamId?: NullableNumber;
  targetLevelId?: NullableNumber;
  clearTargetGoal?: boolean;
}

export interface SaveUserPreferencesResponse extends EdgeMetadataCarrier {
  user_id: string;
  full_name: string | null;
  target_exam_id: number | null;
  target_level_id: number | null;
  active_academy_id: number | null;
  is_initial_setup_completed: boolean;
  source: string;
  request_id: string;
  duration_ms: number | null;
}

interface SaveUserPreferencesOptions {
  refreshSession?: boolean;
}

const buildRequestBody = (payload: SaveUserPreferencesPayload) => ({
  full_name: payload.fullName ?? null,
  full_name_provided: payload.fullNameProvided ?? false,
  target_exam_id: typeof payload.targetExamId === 'number' ? payload.targetExamId : null,
  target_level_id: typeof payload.targetLevelId === 'number' ? payload.targetLevelId : null,
  clear_target_goal: payload.clearTargetGoal ?? false,
});

export const saveUserPreferences = async (
  payload: SaveUserPreferencesPayload,
  options: SaveUserPreferencesOptions = {},
): Promise<SaveUserPreferencesResponse> => {
  const { data, error } = await supabase.functions.invoke<SaveUserPreferencesResponse>('user-save-preferences', {
    body: buildRequestBody(payload),
  });

  if (error || !data) {
    throw normalizeEdgeFunctionError(error);
  }

  if (options.refreshSession !== false && data.should_refresh_session) {
    await refreshSessionSafely({ context: 'saveUserPreferences' });
  }

  return data;
};

export type SaveUserPreferencesError = EdgeFunctionErrorPayload;
