import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { getServiceRoleClient, requireAuth } from "../_shared/auth.ts";
import {
  extractPostgrestErrorCode,
  HttpError,
  isPostgrestError,
  parseKeyValueDetail,
  PostgrestError,
} from "../_shared/http-errors.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";
import {
  emitFinalizeInvitedSignupEvent,
  FinalizeInvitedSignupEventPayload,
  logMembershipAliasConflict,
} from "../_shared/events.ts";
import { resolveRequestId } from "../_shared/request-id.ts";

function getEnvOptional(key: string): string | undefined {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function requireEnv(key: string, errorMessage: string): string {
  const value = getEnvOptional(key);
  if (!value) {
    throw new Error(errorMessage);
  }
  return value;
}

type JsonRecord = Record<string, unknown>;

interface MembershipRecord {
  membership_id: number;
  academy_id: number;
  role: string;
  status?: string;
}

interface FinalizeRpcResponse {
  memberships: unknown;
  memberships_inactive: unknown;
  memberships_claimed: unknown;
  auto_selected_academy_id: unknown;
  metadata_payload: unknown;
  should_refresh_session: unknown;
  is_platform_admin: unknown;
  request_id: unknown;
}

interface FinalizeResponseBody {
  memberships: MembershipRecord[];
  memberships_inactive: MembershipRecord[];
  memberships_claimed: MembershipRecord[];
  auto_selected_academy_id: number | null;
  metadata_payload: JsonRecord | null;
  should_refresh_session: boolean;
  is_platform_admin: boolean;
  request_id: string;
}

const ROLE_CONFLICT_BASE_COPY =
  "This account is tied to a {{rol_actual}} profile. Sign in with another account to access as {{rol_nuevo}} or ask your academy to invite a separate email.";
const INVITATION_ALREADY_CLAIMED_COPY =
  "This invitation has already been claimed. Ask your academy to confirm access or issue a new invite.";
const ALIAS_CONFLICT_COPY =
  "We detected an email mismatch between your account and the invitation. Ask your academy to confirm before trying again.";
const AUTH_REQUIRED_COPY = "Your session expired. Please sign in again.";

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

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

function normalizeMembershipArray(value: unknown): MembershipRecord[] {
  return asArray(value)
    .map((entry) => {
      if (!isPlainRecord(entry)) {
        return null;
      }
      const record = entry;
      const membershipId = toSafeInteger(record.membership_id ?? record.id);
      const academyId = toSafeInteger(record.academy_id);
      const role = typeof record.role === "string" ? record.role : null;
      const status = typeof record.status === "string"
        ? record.status
        : undefined;
      if (membershipId === null || academyId === null || !role) {
        return null;
      }
      const normalized: MembershipRecord = {
        membership_id: membershipId,
        academy_id: academyId,
        role,
      };
      if (status) {
        normalized.status = status;
      }
      return normalized;
    })
    .filter((entry): entry is MembershipRecord => entry !== null);
}

const isPlainRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFinalizeRpcResponse = (value: unknown): value is FinalizeRpcResponse =>
  isPlainRecord(value);

const normalizeMetadataPayload = (
  value: unknown,
): JsonRecord | null => (isPlainRecord(value) ? value : null);

const normalizeBoolean = (value: unknown): boolean => value === true;

const isDeepEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (left === null || right === null) {
    return left === right;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (!isDeepEqual(left[i], right[i])) {
        return false;
      }
    }
    return true;
  }

  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!isDeepEqual(left[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
};

const recordPatchDiffers = (
  current: JsonRecord,
  patch: JsonRecord | null,
): boolean => {
  if (!patch) {
    return false;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (!isDeepEqual(current[key], value)) {
      return true;
    }
  }

  return false;
};

const payloadWouldMutateUser = (
  user: { app_metadata?: unknown; user_metadata?: unknown },
  payload: JsonRecord | null,
): boolean => {
  if (!payload) {
    return false;
  }

  const currentApp = isPlainRecord(user.app_metadata) ? user.app_metadata : {};
  const currentUser = isPlainRecord(user.user_metadata)
    ? user.user_metadata
    : {};

  const payloadApp = isPlainRecord(payload.app_metadata)
    ? payload.app_metadata
    : null;
  const payloadUser = isPlainRecord(payload.user_metadata)
    ? payload.user_metadata
    : null;

  return recordPatchDiffers(currentApp, payloadApp) ||
    recordPatchDiffers(currentUser, payloadUser);
};

const normalizeRequestId = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const buildEventMemberships = (memberships: MembershipRecord[]) =>
  memberships.map((membership) => ({
    membership_id: membership.membership_id,
    academy_id: membership.academy_id,
    role: membership.role,
  }));

function buildRoleConflictDetails(
  detailMap: Record<string, string>,
): { currentRole: string | null; requestedRole: string | null } {
  const existingRole = detailMap.existing_role ?? null;
  const newRole = detailMap.new_role ?? null;
  const rolesRaw = detailMap.roles ?? null;

  if (existingRole || newRole) {
    return {
      currentRole: existingRole ?? null,
      requestedRole: newRole ?? null,
    };
  }

  if (!rolesRaw) {
    return { currentRole: null, requestedRole: null };
  }

  const list = rolesRaw.replace(/[{}]/g, "").split(",").map((value) =>
    value.trim()
  ).filter(Boolean);
  return {
    currentRole: list[0] ?? null,
    requestedRole: list[1] ?? null,
  };
}

const formatRoleConflictMessage = (
  currentRole: string | null,
  requestedRole: string | null,
): string => {
  const safeCurrent = currentRole ?? "otro rol";
  const safeRequested = requestedRole ?? "otro rol";
  return ROLE_CONFLICT_BASE_COPY
    .replace("{{rol_actual}}", safeCurrent)
    .replace("{{rol_nuevo}}", safeRequested);
};

async function applyMetadataPayload(
  userId: string,
  payload: JsonRecord | null,
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
    throw new HttpError(500, "We couldn't sync your session. Try again.", {
      message: error.message,
      status: error.status,
    });
  }
}

interface FinalizeErrorDeps {
  logAliasConflict: (input: {
    userId: string;
    emailLogin: string;
    emailMembership: string;
    membershipId?: number;
    requestId: string;
  }) => Promise<void>;
}

interface FinalizeRpcDeps {
  fetchImpl: typeof fetch;
  supabaseUrl: string;
  serviceRoleKey: string;
}

const parseJsonBody = (raw: string): unknown => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const extractRpcRow = (payload: unknown): unknown => {
  if (Array.isArray(payload)) {
    return payload.length > 0 ? payload[0] : null;
  }
  return payload;
};

async function callFinalizeInvitedSignup(
  authorizationHeader: string,
  requestId: string,
  deps?: Partial<FinalizeRpcDeps>,
) {
  const supabaseUrl = deps?.supabaseUrl ??
    requireEnv(
      "SUPABASE_URL",
      "[auth-finalize-signup] Missing SUPABASE_URL environment variable.",
    );
  const serviceRoleKey = deps?.serviceRoleKey ??
    requireEnv(
      "EXAMENY_SUPABASE_SECRET_KEY",
      "[auth-finalize-signup] Missing EXAMENY_SUPABASE_SECRET_KEY environment variable.",
    );
  const fetchImpl = deps?.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(
      `${supabaseUrl}/rest/v1/rpc/finalize_invited_signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/vnd.pgrst.object+json",
          apikey: serviceRoleKey,
          Authorization: authorizationHeader,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ p_request_id: requestId }),
        cache: "no-store",
        credentials: "omit",
      },
    );

    const rawBody = await response.text();
    const parsedBody = extractRpcRow(parseJsonBody(rawBody));

    if (!response.ok) {
      const errorPayload: PostgrestError =
        typeof parsedBody === "object" && parsedBody !== null
          ? parsedBody as PostgrestError
          : {
            message: "REQUEST_FAILED",
            details: rawBody,
            code: String(response.status),
          };
      return { data: null, error: errorPayload };
    }

    return { data: parsedBody, error: null };
  } catch (unknownError) {
    const errorPayload: PostgrestError = {
      message: "NETWORK_ERROR",
      details: unknownError instanceof Error
        ? unknownError.message
        : String(unknownError),
    };
    return { data: null, error: errorPayload };
  }
}

async function handleFinalizeRpcError(
  error: PostgrestError,
  context: { requestId: string; userId: string },
  deps?: Partial<FinalizeErrorDeps>,
): Promise<never> {
  const rawCode = extractPostgrestErrorCode(error) ?? "UNKNOWN_ERROR";
  const code = [
      "AUTH_REQUIRED",
      "INVITATION_ALREADY_CLAIMED",
      "ROLE_CONFLICT",
      "MEMBERSHIP_OWNERSHIP_CONFLICT",
    ].includes(rawCode)
    ? rawCode
    : "UNKNOWN_ERROR";
  const baseDetails = { code, request_id: context.requestId };

  if (code === "AUTH_REQUIRED") {
    throw new HttpError(401, AUTH_REQUIRED_COPY, baseDetails);
  }

  if (code === "INVITATION_ALREADY_CLAIMED") {
    throw new HttpError(409, INVITATION_ALREADY_CLAIMED_COPY, baseDetails);
  }

  if (code === "ROLE_CONFLICT") {
    const detailMap = parseKeyValueDetail(error.details);
    const { currentRole, requestedRole } = buildRoleConflictDetails(detailMap);
    throw new HttpError(
      409,
      formatRoleConflictMessage(currentRole, requestedRole),
      {
        ...baseDetails,
        current_role: currentRole,
        requested_role: requestedRole,
      },
    );
  }

  if (code === "MEMBERSHIP_OWNERSHIP_CONFLICT") {
    const detailMap = parseKeyValueDetail(error.details);
    const emailLogin = detailMap.email_login ?? "";
    const emailMembership = detailMap.email_membership ?? "";
    const membershipId = toSafeInteger(
      detailMap.membership_id ?? detailMap.id ?? null,
    );
    const logAlias = deps?.logAliasConflict ?? logMembershipAliasConflict;

    if (emailLogin && emailMembership) {
      await logAlias({
        userId: context.userId,
        emailLogin,
        emailMembership,
        membershipId: membershipId ?? undefined,
        requestId: context.requestId,
      });
    }

    throw new HttpError(409, ALIAS_CONFLICT_COPY, baseDetails);
  }

  console.error("[auth-finalize-signup] finalizeRpcError", {
    request_id: context.requestId,
    failure_code: code,
  });
  throw new HttpError(
    500,
    "We couldn't complete your sign-in. Try again later.",
    baseDetails,
  );
}

function normalizeRpcResponse(
  row: FinalizeRpcResponse,
  fallbackRequestId: string,
): FinalizeResponseBody {
  return {
    memberships: normalizeMembershipArray(row.memberships),
    memberships_inactive: normalizeMembershipArray(row.memberships_inactive),
    memberships_claimed: normalizeMembershipArray(row.memberships_claimed),
    auto_selected_academy_id: toSafeInteger(row.auto_selected_academy_id),
    metadata_payload: normalizeMetadataPayload(row.metadata_payload),
    should_refresh_session: normalizeBoolean(row.should_refresh_session),
    is_platform_admin: normalizeBoolean(row.is_platform_admin),
    request_id: normalizeRequestId(row.request_id, fallbackRequestId),
  };
}

interface ProcessFinalizeResultDeps {
  applyMetadata: (payload: JsonRecord | null) => Promise<void>;
  emitEvent: (payload: FinalizeInvitedSignupEventPayload) => Promise<void>;
  now: () => number;
}

async function processFinalizeResult(
  rawResult: FinalizeRpcResponse,
  context: {
    requestId: string;
    userId: string;
    userEmail: string | null;
    startedAt: number;
  },
  deps?: Partial<ProcessFinalizeResultDeps>,
): Promise<FinalizeResponseBody> {
  const normalized = normalizeRpcResponse(rawResult, context.requestId);
  const applyMetadata = deps?.applyMetadata ??
    ((payload) => applyMetadataPayload(context.userId, payload));
  const emitEvent = deps?.emitEvent ?? emitFinalizeInvitedSignupEvent;
  const now = deps?.now ?? (() => performance.now());

  if (normalized.should_refresh_session) {
    await applyMetadata(normalized.metadata_payload);
  }

  const duration = Math.round(Math.max(0, now() - context.startedAt));
  await emitEvent({
    request_id: normalized.request_id,
    duration_ms: duration,
    user_id: context.userId,
    email: context.userEmail,
    memberships_claimed: buildEventMemberships(normalized.memberships_claimed),
    memberships_inactive: buildEventMemberships(
      normalized.memberships_inactive,
    ),
    auto_selected_academy_id: normalized.auto_selected_academy_id,
  });

  return normalized;
}

function ensureFinalizeRpcPayload(
  data: unknown,
  requestId: string,
): FinalizeRpcResponse {
  if (!isFinalizeRpcResponse(data)) {
    throw new HttpError(
      500,
      "The finalize_invited_signup function did not return data.",
      {
        request_id: requestId,
        response_type: data === null ? "null" : typeof data,
      },
    );
  }
  return data;
}

function ensureRpcRequestIdMatches(
  row: FinalizeRpcResponse,
  requestId: string,
): void {
  const rpcRequestId = typeof row.request_id === "string"
    ? row.request_id.trim()
    : "";
  if (rpcRequestId && rpcRequestId !== requestId) {
    throw new HttpError(
      502,
      "The operation returned an unexpected identifier.",
      {
        request_id: requestId,
        expected_request_id: requestId,
        received_request_id: row.request_id,
      },
    );
  }
}

function buildErrorPayload(
  requestId: string,
  error: unknown,
  statusOverride?: number,
): { status: number; body: JsonRecord } {
  const payload = buildPublicErrorPayload(requestId, error, {
    statusOverride,
    fallbackError: "Internal server error",
  });
  return { status: payload.status, body: payload.body };
}

interface HandlerDeps {
  requireAuth: typeof requireAuth;
  callFinalizeInvitedSignup: typeof callFinalizeInvitedSignup;
  processFinalizeResult: typeof processFinalizeResult;
  handleFinalizeRpcError: typeof handleFinalizeRpcError;
  applyMetadataPayloadForUser: typeof applyMetadataPayload;
  emitFinalizeInvitedSignupEvent: typeof emitFinalizeInvitedSignupEvent;
  logMembershipAliasConflict: typeof logMembershipAliasConflict;
}

const defaultHandlerDeps: HandlerDeps = {
  requireAuth,
  callFinalizeInvitedSignup,
  processFinalizeResult,
  handleFinalizeRpcError,
  applyMetadataPayloadForUser: applyMetadataPayload,
  emitFinalizeInvitedSignupEvent,
  logMembershipAliasConflict,
};

export const createAuthFinalizeHandler = (overrides?: Partial<HandlerDeps>) => {
  const deps: HandlerDeps = { ...defaultHandlerDeps, ...(overrides ?? {}) };

  return async (req: Request): Promise<Response> => {
    const cors = jsonHeaders(req);
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: cors });
    }

    const { requestId } = await resolveRequestId(req.headers);
    const log = (...args: unknown[]) => {
      const event = typeof args[0] === "string" ? args[0] : "diagnostic_event";
      console.log("[auth-finalize-signup]", `[${requestId}]`, { event });
    };

    const startedAt = performance.now();

    try {
      ensureAllowedOrigin(req);

      if (req.method !== "POST") {
        return new Response(
          JSON.stringify({
            error: "Method not allowed",
            request_id: requestId,
          }),
          {
            status: 405,
            headers: cors,
          },
        );
      }

      const authContext = await deps.requireAuth(req);
      log("Finalizing signup for authenticated user");

      const { data, error } = await deps.callFinalizeInvitedSignup(
        authContext.authorization,
        requestId,
      );
      if (error) {
        if (isPostgrestError(error)) {
          await deps.handleFinalizeRpcError(
            error,
            { requestId, userId: authContext.user.id },
            { logAliasConflict: deps.logMembershipAliasConflict },
          );
        }
        throw new HttpError(
          500,
          "We couldn't complete your sign-in. Try again later.",
          {
            request_id: requestId,
          },
        );
      }

      const rpcPayload = ensureFinalizeRpcPayload(data, requestId);
      ensureRpcRequestIdMatches(rpcPayload, requestId);

      const preview = normalizeRpcResponse(rpcPayload, requestId);
      const shouldApplyMetadata = preview.should_refresh_session &&
        payloadWouldMutateUser(authContext.user, preview.metadata_payload);

      const responseBody = await deps.processFinalizeResult(
        rpcPayload,
        {
          requestId,
          userId: authContext.user.id,
          userEmail: authContext.profile.email ?? authContext.user.email ??
            null,
          startedAt,
        },
        {
          applyMetadata: (payload) =>
            shouldApplyMetadata
              ? deps.applyMetadataPayloadForUser(authContext.user.id, payload)
              : Promise.resolve(),
          emitEvent: (payload) => deps.emitFinalizeInvitedSignupEvent(payload),
        },
      );

      const effectiveResponse = shouldApplyMetadata
        ? responseBody
        : { ...responseBody, should_refresh_session: false };

      log("Completed finalize signup", {
        duration_ms: Math.round(performance.now() - startedAt),
      });
      return new Response(JSON.stringify(effectiveResponse), {
        status: 200,
        headers: cors,
      });
    } catch (error) {
      log("Failed finalize signup", error);
      const { status, body } = buildErrorPayload(requestId, error);
      return new Response(JSON.stringify(body), { status, headers: cors });
    }
  };
};

export const authFinalizeHandler = createAuthFinalizeHandler();

if (import.meta.main) {
  requireEnv(
    "SUPABASE_URL",
    "[auth-finalize-signup] Missing SUPABASE_URL environment variable.",
  );
  requireEnv(
    "EXAMENY_SUPABASE_SECRET_KEY",
    "[auth-finalize-signup] Missing EXAMENY_SUPABASE_SECRET_KEY environment variable.",
  );
  serve(authFinalizeHandler);
}

export const __testing = {
  normalizeMembershipArray,
  buildRoleConflictDetails,
  processFinalizeResult,
  handleFinalizeRpcError,
  callFinalizeInvitedSignup,
  ensureFinalizeRpcPayload,
  ensureRpcRequestIdMatches,
  createAuthFinalizeHandler,
};
