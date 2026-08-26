import type { Session } from '@supabase/supabase-js';

export type MetadataPayload = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null;

export type EdgeMetadataCarrier = {
  metadata_payload: MetadataPayload;
  should_refresh_session: boolean;
};

export type EdgeFunctionErrorPayload = {
  message: string;
  code: string | null;
  requestId: string | null;
  status?: number | null;
  details?: unknown;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeEdgeFunctionError = (
  error: unknown,
  fallbackMessage = 'Operation unavailable. Try again shortly.',
): EdgeFunctionErrorPayload => {
  if (!error || typeof error !== 'object') {
    return {
      message: fallbackMessage,
      code: null,
      requestId: null,
      status: null,
      details: null,
    };
  }

  const raw = isPlainRecord(error) ? error : {};
  const context = isPlainRecord(raw.context) ? raw.context : {};
  const errorMessage = error instanceof Error ? error.message : null;

  const message =
    (typeof context.error === 'string' && context.error.trim().length > 0
      ? context.error
      : typeof raw.message === 'string' && raw.message.trim().length > 0
        ? raw.message
        : typeof errorMessage === 'string' && errorMessage.trim().length > 0
          ? errorMessage
        : fallbackMessage) ?? fallbackMessage;

  const details = context.details ?? raw.details ?? null;
  const requestId =
    (typeof context.request_id === 'string' && context.request_id.length > 0
      ? context.request_id
      : typeof raw.requestId === 'string'
        ? raw.requestId
        : null);

  const code =
    (typeof context.code === 'string' && context.code.length > 0
      ? context.code
      : typeof raw.code === 'string'
        ? raw.code
        : null);

  const status =
    typeof raw.status === 'number'
      ? raw.status
      : typeof context.status === 'number'
        ? context.status
        : null;

  return {
    message,
    code,
    requestId,
    status,
    details,
  };
};

export const mergeMetadataPayload = (
  session: Session | null,
  payload: MetadataPayload,
): Session | null => {
  if (!session || !payload) {
    return session;
  }

  const nextAppMetadata = isPlainRecord(payload.app_metadata)
    ? { ...(session.user.app_metadata ?? {}), ...payload.app_metadata }
    : session.user.app_metadata;
  const nextUserMetadata = isPlainRecord(payload.user_metadata)
    ? { ...(session.user.user_metadata ?? {}), ...payload.user_metadata }
    : session.user.user_metadata;

  if (nextAppMetadata === session.user.app_metadata && nextUserMetadata === session.user.user_metadata) {
    return session;
  }

  return {
    ...session,
    user: {
      ...session.user,
      app_metadata: nextAppMetadata,
      user_metadata: nextUserMetadata,
    },
  };
};

const toSafeInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export type SessionClaims = {
  activeAcademyId: number | null;
  activeRole: string | null;
  platformRole: string | null;
  memberships: Array<Record<string, unknown>>;
};

export const readSessionClaims = (session: Session | null): SessionClaims => {
  if (!session) {
    return {
      activeAcademyId: null,
      activeRole: null,
      platformRole: null,
      memberships: [],
    };
  }

  const appMetadata = isPlainRecord(session.user.app_metadata)
    ? session.user.app_metadata
    : {};
  const memberships = Array.isArray(appMetadata.memberships)
    ? appMetadata.memberships.filter(isPlainRecord)
    : [];

  const activeAcademyId = toSafeInteger(appMetadata.active_academy_id);
  const activeRole =
    typeof appMetadata.active_role === 'string' && appMetadata.active_role.length > 0
      ? appMetadata.active_role
      : null;
  const platformRole =
    typeof appMetadata.platform_role === 'string' && appMetadata.platform_role.length > 0
      ? appMetadata.platform_role
      : null;

  return {
    activeAcademyId,
    activeRole,
    platformRole,
    memberships,
  };
};

export const isMetadataPayload = (value: unknown): value is MetadataPayload =>
  value === null || isPlainRecord(value);
