import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { applyMetadataPayload, requireAuth } from "../_shared/auth.ts";
import type { AuthContext } from "../_shared/auth.ts";
import {
  extractPostgrestErrorCode,
  HttpError,
  isPostgrestError,
  PostgrestError,
} from "../_shared/http-errors.ts";
import { emitSaveUserPreferencesCompletedEvent } from "../_shared/events.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import {
  readCachedEdgeResponse,
  writeCachedEdgeResponse,
} from "../_shared/idempotency.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";

type JsonRecord = Record<string, unknown>;

interface SavePreferencesPayload {
  fullName: string | null;
  fullNameProvided: boolean;
  targetExamId: number | null;
  targetLevelId: number | null;
  clearTargetGoal: boolean;
}

interface SavePreferencesRpcRow {
  user_id: unknown;
  full_name: unknown;
  target_exam_id: unknown;
  target_level_id: unknown;
  active_academy_id: unknown;
  is_initial_setup_completed: unknown;
  source: unknown;
  metadata_payload: unknown;
  should_refresh_session: unknown;
  request_id: unknown;
  duration_ms: unknown;
}

interface SavePreferencesResponse {
  user_id: string;
  full_name: string | null;
  target_exam_id: number | null;
  target_level_id: number | null;
  active_academy_id: number | null;
  is_initial_setup_completed: boolean;
  source: string;
  metadata_payload: JsonRecord | null;
  should_refresh_session: boolean;
  request_id: string;
  duration_ms: number | null;
}

interface ProcessContext {
  requestId: string;
  userId: string;
  startedAt: number;
}

type StudentMembershipRow = {
  id: number;
};

const EDGE_FUNCTION_NAME = "user-save-preferences";

type RpcInvocationResult = {
  data: unknown;
  error: PostgrestError | null;
};

interface HandlerDependencies {
  ensureAllowedOrigin: typeof ensureAllowedOrigin;
  requireAuth: typeof requireAuth;
  resolveRequestId: typeof resolveRequestId;
  ensureJsonBody: typeof ensureJsonBody;
  validateRequestPayload: typeof validateRequestPayload;
  callSaveUserPreferencesRpc: (
    context: AuthContext,
    payload: SavePreferencesPayload,
    requestId: string,
  ) => Promise<RpcInvocationResult>;
  syncStudentProfilesTargets: (context: AuthContext, targets: {
    targetExamId: number | null;
    targetLevelId: number | null;
  }, requestId: string) => Promise<void>;
  processPreferencesResult: (
    row: SavePreferencesRpcRow | null,
    context: ProcessContext,
  ) => Promise<SavePreferencesResponse>;
  readCachedResponse: typeof readCachedEdgeResponse;
  writeCachedResponse: typeof writeCachedEdgeResponse;
  now: () => number;
}

async function syncStudentProfilesTargets(
  context: AuthContext,
  targets: { targetExamId: number | null; targetLevelId: number | null },
  requestId: string,
): Promise<void> {
  const userId = context.user.id;
  const { data: memberships, error: membershipError } = await context.supabase
    .from("academy_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("role", "student");

  if (membershipError) {
    throw new HttpError(
      502,
      "We couldn't sync your student profile. Try again.",
      {
        code: "STUDENT_PROFILE_SYNC_FAILED",
        request_id: requestId,
        stage: "fetch_memberships",
        message: membershipError.message,
      },
    );
  }

  const activeMemberships = (memberships ?? []) as StudentMembershipRow[];
  if (activeMemberships.length === 0) {
    return;
  }

  const rows = activeMemberships.map((membership) => ({
    membership_id: membership.id,
    user_id: userId,
    target_exam_id: targets.targetExamId,
    target_level_id: targets.targetLevelId,
  }));

  const { error: profileError } = await context.supabase
    .from("student_profiles")
    .upsert(rows, { onConflict: "membership_id" });

  if (profileError) {
    throw new HttpError(
      502,
      "We couldn't sync your student profile. Try again.",
      {
        code: "STUDENT_PROFILE_SYNC_FAILED",
        request_id: requestId,
        stage: "upsert_student_profiles",
        message: profileError.message,
      },
    );
  }
}

const defaultDependencies: HandlerDependencies = {
  ensureAllowedOrigin,
  requireAuth,
  resolveRequestId,
  ensureJsonBody,
  validateRequestPayload,
  callSaveUserPreferencesRpc: async (context, payload, requestId) =>
    await context.supabase.rpc(
      "save_user_preferences",
      buildRpcPayload(payload, requestId),
    ),
  syncStudentProfilesTargets,
  processPreferencesResult: (row, context) =>
    processPreferencesResult(row, context),
  readCachedResponse: readCachedEdgeResponse,
  writeCachedResponse: writeCachedEdgeResponse,
  now: () => performance.now(),
};

const ERROR_COPY: Record<string, string> = {
  FULL_NAME_REQUIRED: "We need your full name to continue onboarding.",
  TARGET_REQUIRED:
    "Select both exam and level to complete your student profile.",
  STUDENT_MEMBERSHIP_REQUIRED:
    "You need an active student membership before setting a learning goal.",
  INVALID_EXAM_TYPE: "The selected exam does not exist. Choose another option.",
  INVALID_LEVEL: "The selected level does not exist. Choose another option.",
  INCOMPATIBLE_EXAM_LEVEL:
    "That exam and level combination is not available. Review your selection.",
  AUTH_REQUIRED: "Your session expired. Sign in again.",
};

const jsonHeaders = (request: Request) => ({
  ...createCorsHeaders(request),
  "Content-Type": "application/json",
});

const toSafeInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[-]?\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const isPlainRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeRequestId = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new HttpError(502, "The operation did not return a valid request_id.", {
    code: "REQUEST_ID_MISSING",
    expected_request_id: fallback,
  });
};

async function ensureJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.", {
      code: "INVALID_JSON",
    });
  }
}

const parseOptionalNumber = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${field} must be numeric.`, {
      code: "INVALID_TYPE",
      field,
    });
  }
  if (!Number.isSafeInteger(value)) {
    throw new HttpError(400, `${field} is too large.`, {
      code: "INVALID_RANGE",
      field,
    });
  }
  return Math.trunc(value);
};

function validateRequestPayload(input: unknown): SavePreferencesPayload {
  if (!isPlainRecord(input)) {
    throw new HttpError(400, "The body must be a JSON object.", {
      code: "INVALID_BODY",
    });
  }

  const record = input;

  const fullNameValue = record.full_name ?? record.fullName ?? null;
  if (
    fullNameValue !== null && fullNameValue !== undefined &&
    typeof fullNameValue !== "string"
  ) {
    throw new HttpError(400, "full_name must be text or null.", {
      code: "INVALID_TYPE",
      field: "full_name",
    });
  }

  const fullNameProvidedRaw = record.full_name_provided ??
    record.fullNameProvided;
  const fullNameProvided = typeof fullNameProvidedRaw === "boolean"
    ? fullNameProvidedRaw
    : false;
  if (
    fullNameProvidedRaw !== undefined &&
    typeof fullNameProvidedRaw !== "boolean"
  ) {
    throw new HttpError(400, "full_name_provided must be boolean.", {
      code: "INVALID_TYPE",
      field: "full_name_provided",
    });
  }

  const clearTargetGoalRaw = record.clear_target_goal ?? record.clearTargetGoal;
  const clearTargetGoal = typeof clearTargetGoalRaw === "boolean"
    ? clearTargetGoalRaw
    : false;
  if (
    clearTargetGoalRaw !== undefined && typeof clearTargetGoalRaw !== "boolean"
  ) {
    throw new HttpError(400, "clear_target_goal must be boolean.", {
      code: "INVALID_TYPE",
      field: "clear_target_goal",
    });
  }

  const targetExamId = parseOptionalNumber(
    record.target_exam_id ?? record.targetExamId,
    "target_exam_id",
  );
  const targetLevelId = parseOptionalNumber(
    record.target_level_id ?? record.targetLevelId,
    "target_level_id",
  );

  return {
    fullName: typeof fullNameValue === "string" ? fullNameValue : null,
    fullNameProvided,
    targetExamId,
    targetLevelId,
    clearTargetGoal,
  };
}

function buildRpcPayload(payload: SavePreferencesPayload, requestId?: string) {
  const rpcPayload: Record<string, unknown> = {
    p_full_name: payload.fullName,
    p_full_name_provided: payload.fullNameProvided,
    p_target_exam_id: payload.targetExamId,
    p_target_level_id: payload.targetLevelId,
    p_clear_target_goal: payload.clearTargetGoal,
  };

  if (requestId) {
    rpcPayload.p_request_id = requestId;
  }

  return rpcPayload;
}

const normalizePreferencesResponse = (
  row: SavePreferencesRpcRow | null,
  requestId: string,
): SavePreferencesResponse => {
  if (!row || typeof row !== "object") {
    throw new HttpError(
      500,
      "The save_user_preferences function did not return data.",
      { request_id: requestId },
    );
  }

  const record = row;
  const userId = typeof record.user_id === "string" ? record.user_id : null;
  if (!userId) {
    throw new HttpError(500, "Invalid response from save_user_preferences.", {
      request_id: requestId,
      field: "user_id",
    });
  }

  const fullName = typeof record.full_name === "string"
    ? record.full_name
    : null;

  const targetExamId = toSafeInteger(record.target_exam_id);
  const targetLevelId = toSafeInteger(record.target_level_id);
  const activeAcademyId = toSafeInteger(record.active_academy_id);
  const isInitialSetupCompleted = normalizeBoolean(
    record.is_initial_setup_completed,
  );
  const source = typeof record.source === "string" && record.source.length > 0
    ? record.source
    : "profile_edit";
  const metadataPayload = isPlainRecord(record.metadata_payload)
    ? record.metadata_payload
    : null;
  const shouldRefreshSession = normalizeBoolean(record.should_refresh_session);
  const normalizedRequestId = normalizeRequestId(record.request_id, requestId);
  const durationMs = toSafeInteger(record.duration_ms);

  return {
    user_id: userId,
    full_name: fullName,
    target_exam_id: targetExamId,
    target_level_id: targetLevelId,
    active_academy_id: activeAcademyId,
    is_initial_setup_completed: isInitialSetupCompleted,
    source,
    metadata_payload: metadataPayload,
    should_refresh_session: shouldRefreshSession,
    request_id: normalizedRequestId,
    duration_ms: durationMs,
  };
};

async function applyMetadataWithRetry(
  payload: JsonRecord | null,
  context: { userId: string; requestId: string },
  deps?: {
    applyOnce?: (input: JsonRecord | null) => Promise<void>;
    maxAttempts?: number;
  },
): Promise<void> {
  if (!payload) {
    return;
  }

  const applyOnce = deps?.applyOnce ??
    ((input: JsonRecord | null) => applyMetadataPayload(context.userId, input));
  const maxAttempts = deps?.maxAttempts ?? 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await applyOnce(payload);
      return;
    } catch (error) {
      lastError = error;
      console.warn("[user-save-preferences]", "metadata update failed", {
        requestId: context.requestId,
        attempt,
      });
      if (attempt === maxAttempts) {
        throw new HttpError(502, "We couldn't sync your session. Try again.", {
          code: "METADATA_SYNC_FAILED",
          request_id: context.requestId,
          last_error: lastError instanceof Error
            ? lastError.message
            : String(lastError),
        });
      }
    }
  }
}

async function processPreferencesResult(
  rawRow: SavePreferencesRpcRow | null,
  context: ProcessContext,
  deps?: {
    applyMetadata?: (payload: JsonRecord | null) => Promise<void>;
    emitEvent?: typeof emitSaveUserPreferencesCompletedEvent;
    now?: () => number;
  },
): Promise<SavePreferencesResponse> {
  const normalized = normalizePreferencesResponse(rawRow, context.requestId);
  if (normalized.request_id !== context.requestId) {
    throw new HttpError(
      502,
      "The operation returned an unexpected identifier.",
      {
        code: "REQUEST_ID_MISMATCH",
        expected_request_id: context.requestId,
        received_request_id: normalized.request_id,
      },
    );
  }
  const applyMetadata = deps?.applyMetadata ??
    ((payload) =>
      applyMetadataWithRetry(payload, {
        userId: context.userId,
        requestId: context.requestId,
      }));
  const emitEvent = deps?.emitEvent ?? emitSaveUserPreferencesCompletedEvent;
  const now = deps?.now ?? (() => performance.now());

  if (normalized.should_refresh_session) {
    await applyMetadata(normalized.metadata_payload);
  }

  const duration = typeof normalized.duration_ms === "number" &&
      Number.isFinite(normalized.duration_ms)
    ? normalized.duration_ms
    : Math.round(Math.max(0, now() - context.startedAt));
  await emitEvent({
    request_id: normalized.request_id,
    user_id: normalized.user_id,
    target_exam_id: normalized.target_exam_id,
    target_level_id: normalized.target_level_id,
    source: normalized.source,
    duration_ms: duration,
  });

  return { ...normalized, duration_ms: duration };
}

function handleSavePreferencesError(
  error: PostgrestError,
  context: { requestId: string },
): never {
  const rawCode = extractPostgrestErrorCode(error) ?? "UNKNOWN_ERROR";
  const code = rawCode === "AUTH_REQUIRED" ||
      rawCode === "INCOMPATIBLE_EXAM_LEVEL" ||
      rawCode.startsWith("INVALID_") ||
      rawCode in ERROR_COPY
    ? rawCode
    : "UNKNOWN_ERROR";
  const baseDetails: JsonRecord = { code, request_id: context.requestId };

  if (code === "AUTH_REQUIRED") {
    throw new HttpError(401, ERROR_COPY.AUTH_REQUIRED, baseDetails);
  }

  if (code in ERROR_COPY) {
    throw new HttpError(422, ERROR_COPY[code], baseDetails);
  }

  if (code.startsWith("INVALID_") || code === "INCOMPATIBLE_EXAM_LEVEL") {
    throw new HttpError(
      422,
      ERROR_COPY[code] ?? "Invalid request.",
      baseDetails,
    );
  }

  console.error("[user-save-preferences] rpcError", {
    request_id: context.requestId,
    failure_code: code,
  });
  throw new HttpError(
    500,
    "We couldn't save your preferences. Try again.",
    baseDetails,
  );
}

function buildErrorResponse(requestId: string, error: unknown) {
  return buildPublicErrorPayload(requestId, error, {
    fallbackError: "Internal server error",
  });
}

async function handleSavePreferencesRequest(
  req: Request,
  deps: HandlerDependencies = defaultDependencies,
): Promise<Response> {
  const cors = jsonHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const { requestId } = await deps.resolveRequestId(req.headers);
  const headers = { ...cors, "X-Request-Id": requestId };
  const log = (...args: unknown[]) => {
    const event = typeof args[0] === "string" ? args[0] : "diagnostic_event";
    console.log("[user-save-preferences]", `[${requestId}]`, { event });
  };
  const startedAt = deps.now();

  try {
    deps.ensureAllowedOrigin(req);

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed", request_id: requestId }),
        {
          status: 405,
          headers,
        },
      );
    }

    const authContext = await deps.requireAuth(req);
    const profileFullName = authContext.profile.full_name ?? null;
    const profileRole = authContext.profile.role ?? null;
    const platformRole = authContext.profile.platform_role ?? null;
    const membershipId = authContext.profile.membership_id ?? null;

    log("Invoked", {
      userId: authContext.user.id,
      role: profileRole,
      platformRole,
      membershipId,
      hasName: Boolean(profileFullName),
    });

    const cachedResponse = await deps.readCachedResponse(
      EDGE_FUNCTION_NAME,
      requestId,
      authContext.user.id,
    );
    if (cachedResponse) {
      log("Cache hit, reusing response for request", requestId);
      return new Response(JSON.stringify(cachedResponse), {
        status: 200,
        headers,
      });
    }

    const body = deps.validateRequestPayload(await deps.ensureJsonBody(req));
    const targetsRequested = body.clearTargetGoal ||
      body.targetExamId !== null ||
      body.targetLevelId !== null;
    const { data, error } = await deps.callSaveUserPreferencesRpc(
      authContext,
      body,
      requestId,
    );

    if (error) {
      if (isPostgrestError(error)) {
        handleSavePreferencesError(error, { requestId });
      }
      throw new HttpError(
        500,
        "We couldn't save your preferences. Try again.",
        {
          request_id: requestId,
        },
      );
    }

    const row = Array.isArray(data)
      ? (data[0] as SavePreferencesRpcRow | null)
      : ((data as SavePreferencesRpcRow) ?? null);
    const responseBody = await deps.processPreferencesResult(row, {
      requestId,
      userId: authContext.user.id,
      startedAt,
    });

    if (targetsRequested) {
      await deps.syncStudentProfilesTargets(authContext, {
        targetExamId: responseBody.target_exam_id,
        targetLevelId: responseBody.target_level_id,
      }, requestId);
    }
    await deps.writeCachedResponse(
      EDGE_FUNCTION_NAME,
      requestId,
      authContext.user.id,
      { ...responseBody },
    );

    log("Completed", {
      request_id: responseBody.request_id,
      source: responseBody.source,
      should_refresh_session: responseBody.should_refresh_session,
    });

    return new Response(JSON.stringify(responseBody), { status: 200, headers });
  } catch (error) {
    log("Failed", error);
    const { status, body } = buildErrorResponse(requestId, error);
    return new Response(JSON.stringify(body), { status, headers });
  }
}

export const handler = (req: Request): Promise<Response> =>
  handleSavePreferencesRequest(req, defaultDependencies);

if (import.meta.main) {
  serve(handler);
}

export const __testing = {
  validateRequestPayload,
  normalizePreferencesResponse,
  processPreferencesResult,
  handleSavePreferencesError,
  applyMetadataWithRetry,
  handleSavePreferencesRequest,
  defaultDependencies,
};
