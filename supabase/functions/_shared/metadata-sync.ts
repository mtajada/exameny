import { getServiceRoleClient } from "./auth.ts";
import { HttpError } from "./http-errors.ts";

export type JsonRecord = Record<string, unknown>;

export const isPlainRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeMetadataPayload = (
  value: unknown,
): JsonRecord | null => (isPlainRecord(value) ? value : null);

export type MetadataUpdate = {
  userId: string;
  payload: JsonRecord | null;
  shouldRefreshSession: boolean;
  requestId: string | null;
};

export async function applyMetadataSync(
  userId: string,
  payload: JsonRecord | null,
  errorMessage: string,
): Promise<void> {
  if (!payload) {
    return;
  }

  const update: { app_metadata?: JsonRecord; user_metadata?: JsonRecord } = {};
  if (isPlainRecord(payload.app_metadata)) {
    update.app_metadata = payload.app_metadata;
  }
  if (isPlainRecord(payload.user_metadata)) {
    update.user_metadata = payload.user_metadata;
  }

  if (!update.app_metadata && !update.user_metadata) {
    return;
  }

  const { error } = await getServiceRoleClient().auth.admin.updateUserById(
    userId,
    update,
  );
  if (error) {
    throw new HttpError(500, errorMessage, {
      message: error.message,
      status: error.status,
    });
  }
}

export function extractMetadataUpdates(
  targets: unknown,
  fallback?: {
    userId?: string | null;
    payload?: unknown;
    shouldRefreshSession?: unknown;
    requestId?: unknown;
  },
): MetadataUpdate[] {
  const updates: MetadataUpdate[] = [];
  const seen = new Set<string>();

  if (Array.isArray(targets)) {
    for (const raw of targets) {
      if (!isPlainRecord(raw)) continue;
      const userId = typeof raw.user_id === "string" ? raw.user_id : null;
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);
      updates.push({
        userId,
        payload: normalizeMetadataPayload(raw.metadata_payload),
        shouldRefreshSession: raw.should_refresh_session === true,
        requestId: typeof raw.request_id === "string" ? raw.request_id : null,
      });
    }
  }

  const fallbackUserId = typeof fallback?.userId === "string"
    ? fallback.userId
    : null;
  if (fallbackUserId && !seen.has(fallbackUserId)) {
    seen.add(fallbackUserId);
    updates.push({
      userId: fallbackUserId,
      payload: normalizeMetadataPayload(fallback?.payload),
      shouldRefreshSession: fallback?.shouldRefreshSession === true,
      requestId: typeof fallback?.requestId === "string"
        ? fallback.requestId
        : null,
    });
  }

  return updates;
}

export async function applyMetadataUpdates(
  updates: MetadataUpdate[],
  errorMessage: string,
): Promise<void> {
  for (const update of updates) {
    await applyMetadataSync(update.userId, update.payload, errorMessage);
  }
}
