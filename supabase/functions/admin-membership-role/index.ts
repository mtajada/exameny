import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/auth.ts";
import {
  extractPostgrestErrorCode,
  HttpError,
  isHttpError,
  isPostgrestError,
  parseKeyValueDetail,
} from "../_shared/http-errors.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";
import {
  emitMembershipRoleMigratedEvent,
  MembershipRoleMigratedEventPayload,
} from "../_shared/events.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import {
  authenticateAdminRequest,
  resolveAdminActorContext,
} from "../_shared/admin-auth.ts";
import {
  applyMetadataSync,
  isPlainRecord,
  type JsonRecord,
  normalizeMetadataPayload,
} from "../_shared/metadata-sync.ts";
import { getMembershipOwnerUserId } from "../_shared/memberships.ts";
import { tryBuildManualInterventionResponse } from "../_shared/manual-intervention.ts";

interface MembershipRoleInput {
  membership_id: number;
  new_role: string;
  reason: string | null;
}

interface RoleMigrationRpcPayload {
  membership_id: unknown;
  academy_id: unknown;
  old_role: unknown;
  new_role: unknown;
  cleaned_records: unknown;
  metadata_payload: unknown;
  should_refresh_session: unknown;
  request_id: unknown;
}

interface NormalizedRoleMigrationResult {
  membership_id: number;
  academy_id: number | null;
  old_role: string | null;
  new_role: string | null;
  cleaned_records: JsonRecord;
  metadata_payload: JsonRecord | null;
  should_refresh_session: boolean;
  request_id: string;
}

interface AliasConflictDetails {
  membership_id: number | null;
  user_id: string | null;
  email_login: string | null;
  email_membership: string | null;
}

interface ProcessContext {
  requestId: string;
  userId: string;
  actorAcademyId: number | null;
  startedAt: number;
  targetUserId: string | null;
}

interface ProcessDeps {
  applyMetadata: (userId: string, payload: JsonRecord | null) => Promise<void>;
  emitEvent: (payload: MembershipRoleMigratedEventPayload) => Promise<void>;
  now: () => number;
  resolveTargetUserId?: (membershipId: number) => Promise<string>;
}

const ROLE_CONFLICT_BASE_COPY =
  "This email is already linked to {{current_role}}. Use a different account to invite them as {{requested_role}}.";
const ROLE_IMMUTABLE_COPY = "Administrator roles require a dedicated account.";
const ROLE_SCOPE_CONFLICT_COPY =
  "You do not have permission to modify that academy. Contact the platform team.";
const ACTOR_CONTEXT_COPY =
  "We could not validate your admin session. Check your active academy and try again.";
const MEMBERSHIP_NOT_FOUND_COPY = "We could not find the requested membership.";
const METADATA_SYNC_COPY =
  "We could not refresh the session after the role change. Try again.";
const GENERIC_FAILURE_COPY = "We could not convert the role. Try again.";
const MEMBERSHIP_ALIAS_CONFLICT_COPY =
  "We detected an email mismatch for this membership. Resolve the alias conflict before trying again.";
const REQUEST_ID_MISMATCH_COPY =
  "The operation returned an unexpected identifier.";

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

const normalizeCleanedRecords = (
  value: unknown,
): JsonRecord => (isPlainRecord(value) ? value : {});

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeRequestId = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const sanitizeRole = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const parseRoleConflictDetails = (
  detail: string | null | undefined,
): { currentRole: string | null; requestedRole: string | null } => {
  const detailMap = parseKeyValueDetail(detail);
  const existingRole = detailMap.existing_role ?? detailMap.current_role ??
    null;
  const newRole = detailMap.new_role ?? null;
  if (existingRole || newRole) {
    return {
      currentRole: existingRole ?? null,
      requestedRole: newRole ?? null,
    };
  }
  const rolesRaw = detailMap.roles;
  if (!rolesRaw) {
    return { currentRole: null, requestedRole: null };
  }
  const normalized = rolesRaw.replace(/[{}]/g, "").split(",").map((value) =>
    value.trim()
  ).filter(Boolean);
  return {
    currentRole: normalized[0] ?? null,
    requestedRole: normalized[1] ?? null,
  };
};

const parseAliasConflictDetails = (
  detail: string | null | undefined,
): AliasConflictDetails | null => {
  const detailMap = parseKeyValueDetail(detail);
  const membershipIdRaw = detailMap.membership_id ?? null;
  const membershipId = membershipIdRaw
    ? Number.parseInt(membershipIdRaw, 10)
    : Number.NaN;
  const aliasDetails: AliasConflictDetails = {
    membership_id: Number.isSafeInteger(membershipId) ? membershipId : null,
    user_id: detailMap.user_id ?? null,
    email_login: detailMap.email_login ?? null,
    email_membership: detailMap.email_membership ?? null,
  };

  if (
    aliasDetails.membership_id === null &&
    !aliasDetails.user_id &&
    !aliasDetails.email_login &&
    !aliasDetails.email_membership
  ) {
    return null;
  }

  return aliasDetails;
};

const formatRoleConflictMessage = (
  currentRole: string | null,
  requestedRole: string | null,
): string =>
  ROLE_CONFLICT_BASE_COPY
    .replace("{{current_role}}", currentRole ?? "another role")
    .replace("{{requested_role}}", requestedRole ?? "another role");

async function processRoleMigrationResult(
  payload: RoleMigrationRpcPayload,
  context: ProcessContext,
  deps?: Partial<ProcessDeps>,
): Promise<NormalizedRoleMigrationResult> {
  const membershipId = toSafeInteger(payload.membership_id);
  if (membershipId === null) {
    throw new HttpError(500, GENERIC_FAILURE_COPY, {
      reason: "invalid_membership_id",
    });
  }

  const normalized: NormalizedRoleMigrationResult = {
    membership_id: membershipId,
    academy_id: toSafeInteger(payload.academy_id),
    old_role: sanitizeRole(payload.old_role),
    new_role: sanitizeRole(payload.new_role),
    cleaned_records: normalizeCleanedRecords(payload.cleaned_records),
    metadata_payload: normalizeMetadataPayload(payload.metadata_payload),
    should_refresh_session: normalizeBoolean(payload.should_refresh_session),
    request_id: normalizeRequestId(payload.request_id, context.requestId),
  };

  if (!Number.isSafeInteger(normalized.membership_id)) {
    throw new HttpError(500, GENERIC_FAILURE_COPY, {
      reason: "invalid_membership_id",
    });
  }

  if (normalized.request_id !== context.requestId) {
    throw new HttpError(
      502,
      REQUEST_ID_MISMATCH_COPY,
      {
        reason: "request_id_mismatch",
        request_id: context.requestId,
        rpc_request_id: normalized.request_id,
      },
    );
  }

  const mergedDeps: ProcessDeps = {
    applyMetadata: deps?.applyMetadata ??
      ((userId, metadata) =>
        applyMetadataSync(userId, metadata, METADATA_SYNC_COPY)),
    emitEvent: deps?.emitEvent ??
      ((eventPayload) => emitMembershipRoleMigratedEvent(eventPayload)),
    now: deps?.now ?? (() => Date.now()),
    resolveTargetUserId: deps?.resolveTargetUserId,
  };

  const hasMetadataPayload = normalized.metadata_payload !== null;
  let targetUserId = context.targetUserId;

  if (hasMetadataPayload) {
    if (!targetUserId && mergedDeps.resolveTargetUserId) {
      targetUserId = await mergedDeps.resolveTargetUserId(
        normalized.membership_id,
      );
    }

    if (!targetUserId) {
      throw new HttpError(500, METADATA_SYNC_COPY, {
        reason: "missing_target_membership_user",
      });
    }

    await mergedDeps.applyMetadata(targetUserId, normalized.metadata_payload);
  }

  const duration = Math.max(0, mergedDeps.now() - context.startedAt);
  await mergedDeps.emitEvent({
    request_id: normalized.request_id,
    membership_id: normalized.membership_id,
    academy_id: normalized.academy_id ?? null,
    actor_user_id: context.userId,
    actor_academy_id: context.actorAcademyId,
    old_role: normalized.old_role,
    new_role: normalized.new_role,
    cleaned_records: normalized.cleaned_records,
    duration_ms: duration,
  });

  return normalized;
}

function parseInput(body: unknown): MembershipRoleInput {
  if (!isPlainRecord(body)) {
    throw new HttpError(
      400,
      "Invalid payload. Send JSON with membership_id and new_role.",
    );
  }
  const record = body;
  const membershipId = record.membership_id ?? record.membershipId;
  const newRoleRaw = record.new_role ?? record.newRole;
  const reasonRaw = record.reason ?? null;

  const membership_id = toSafeInteger(membershipId);
  if (membership_id === null) {
    throw new HttpError(400, "Invalid membership_id.");
  }

  const new_role = typeof newRoleRaw === "string"
    ? newRoleRaw.trim().toLowerCase()
    : "";
  if (!["student", "teacher"].includes(new_role)) {
    throw new HttpError(400, 'new_role must be "student" or "teacher".');
  }

  const reason = typeof reasonRaw === "string" && reasonRaw.trim().length > 0
    ? reasonRaw.trim()
    : null;

  return { membership_id, new_role, reason };
}

function buildErrorDetails(
  code: string,
  requestId: string,
  extra?: Record<string, unknown>,
) {
  return { code, request_id: requestId, ...(extra ?? {}) };
}

function handleMembershipRoleRpcError(
  error: unknown,
  context: { requestId: string },
): never {
  if (!isPostgrestError(error)) {
    throw error;
  }

  const rawCode = extractPostgrestErrorCode(error) ?? "UNKNOWN_ERROR";
  const code = [
      "ROLE_CONFLICT",
      "ROLE_IMMUTABLE",
      "ROLE_IMMUTABLE_CROSS_ACADEMY",
      "ROLE_SCOPE_CONFLICT",
      "MEMBERSHIP_OWNERSHIP_CONFLICT",
      "ACTOR_CONTEXT_REQUIRED",
      "MEMBERSHIP_NOT_FOUND",
    ].includes(rawCode)
    ? rawCode
    : "UNKNOWN_ERROR";

  if (code === "ROLE_CONFLICT") {
    const { currentRole, requestedRole } = parseRoleConflictDetails(
      error.details,
    );
    throw new HttpError(
      409,
      formatRoleConflictMessage(currentRole, requestedRole),
      {
        ...buildErrorDetails(code, context.requestId, {
          current_role: currentRole,
          requested_role: requestedRole,
        }),
      },
    );
  }

  if (code === "ROLE_IMMUTABLE" || code === "ROLE_IMMUTABLE_CROSS_ACADEMY") {
    throw new HttpError(
      409,
      ROLE_IMMUTABLE_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "ROLE_SCOPE_CONFLICT") {
    throw new HttpError(
      403,
      ROLE_SCOPE_CONFLICT_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "MEMBERSHIP_OWNERSHIP_CONFLICT") {
    const aliasDetails = parseAliasConflictDetails(
      (error as { details?: string }).details ?? null,
    );
    const extra = aliasDetails ? { alias_conflict: aliasDetails } : undefined;
    throw new HttpError(
      409,
      MEMBERSHIP_ALIAS_CONFLICT_COPY,
      buildErrorDetails(code, context.requestId, extra),
    );
  }

  if (code === "ACTOR_CONTEXT_REQUIRED") {
    throw new HttpError(
      403,
      ACTOR_CONTEXT_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "MEMBERSHIP_NOT_FOUND") {
    throw new HttpError(
      404,
      MEMBERSHIP_NOT_FOUND_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  console.error("[admin-membership-role] rpcError", {
    request_id: context.requestId,
    failure_code: code,
  });
  throw new HttpError(
    500,
    GENERIC_FAILURE_COPY,
    buildErrorDetails(code, context.requestId),
  );
}

type RpcError = { message?: string; code?: string };
type RpcSingleResult<T> = { data: T | null; error: RpcError | null };
type ServiceRoleClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => { single: <T>() => PromiseLike<RpcSingleResult<T>> };
};

function buildErrorResponse(
  requestId: string,
  error: unknown,
  headers: Record<string, string>,
): Response {
  const payload = buildPublicErrorPayload(requestId, error, {
    fallbackError: GENERIC_FAILURE_COPY,
    detailsAllowlist: ["alias_conflict"],
  });

  if (!isHttpError(error)) {
    console.error("[admin-membership-role] unexpected_error", {
      request_id: requestId,
    });
  }

  return new Response(JSON.stringify(payload.body), {
    status: payload.status,
    headers,
  });
}

interface HandlerDeps {
  authenticateAdminRequest: typeof authenticateAdminRequest;
  resolveAdminActorContext: typeof resolveAdminActorContext;
  getServiceRoleClient: () => ServiceRoleClient;
  processRoleMigrationResult: typeof processRoleMigrationResult;
  getMembershipOwnerUserId: typeof getMembershipOwnerUserId;
  tryBuildManualInterventionResponse: typeof tryBuildManualInterventionResponse;
}

const defaultHandlerDeps: HandlerDeps = {
  authenticateAdminRequest,
  resolveAdminActorContext,
  getServiceRoleClient,
  processRoleMigrationResult,
  getMembershipOwnerUserId,
  tryBuildManualInterventionResponse,
};

export const createHandler = (overrides?: Partial<HandlerDeps>) => {
  const deps: HandlerDeps = { ...defaultHandlerDeps, ...(overrides ?? {}) };

  return async function handler(req: Request): Promise<Response> {
    const baseHeaders = createCorsHeaders(req);
    if (req.method === "OPTIONS") {
      try {
        ensureAllowedOrigin(req);
        return new Response("ok", { headers: baseHeaders });
      } catch (error) {
        return buildErrorResponse("preflight", error, baseHeaders);
      }
    }

    const jsonHeaders = { ...baseHeaders, "Content-Type": "application/json" };
    const { requestId } = await resolveRequestId(req.headers);
    const respond = (
      status: number,
      body: Record<string, unknown>,
      overrideRequestId?: string,
    ) =>
      new Response(
        JSON.stringify({ request_id: overrideRequestId ?? requestId, ...body }),
        { status, headers: jsonHeaders },
      );

    try {
      ensureAllowedOrigin(req);

      if (req.method !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }

      const authContext = await deps.authenticateAdminRequest(req);
      const actorContext = deps.resolveAdminActorContext(authContext);
      const payload = parseInput(await req.json());
      const startedAt = Date.now();

      const { data, error } = await deps.getServiceRoleClient()
        .rpc("migrate_membership_role", {
          p_actor_user_id: authContext.user.id,
          p_actor_academy_id: actorContext.actorAcademyId,
          p_actor_is_platform_admin: actorContext.actorIsPlatformAdmin,
          p_membership_id: payload.membership_id,
          p_new_role: payload.new_role,
          p_reason: payload.reason,
          p_request_id: requestId,
        })
        .single();

      if (error) {
        const manualResponse = deps.tryBuildManualInterventionResponse(
          error,
          requestId,
          jsonHeaders,
        );
        if (manualResponse) {
          return manualResponse;
        }
        handleMembershipRoleRpcError(error, { requestId });
      }

      if (!data) {
        throw new HttpError(
          500,
          GENERIC_FAILURE_COPY,
          buildErrorDetails("NO_DATA", requestId),
        );
      }

      const rpcPayload = data as RoleMigrationRpcPayload;

      const normalized = await deps.processRoleMigrationResult(
        rpcPayload,
        {
          requestId,
          userId: authContext.user.id,
          actorAcademyId: actorContext.actorAcademyId,
          startedAt,
          targetUserId: null,
        },
        {
          resolveTargetUserId: (membershipId) =>
            deps.getMembershipOwnerUserId(membershipId, METADATA_SYNC_COPY),
        },
      );

      console.info("[admin-membership-role] success", {
        request_id: normalized.request_id,
      });

      return respond(
        200,
        {
          membership_id: normalized.membership_id,
          academy_id: normalized.academy_id,
          old_role: normalized.old_role,
          new_role: normalized.new_role,
          cleaned_records: normalized.cleaned_records,
          metadata_payload: normalized.metadata_payload,
          should_refresh_session: normalized.should_refresh_session,
        },
        normalized.request_id,
      );
    } catch (error) {
      return buildErrorResponse(requestId, error, jsonHeaders);
    }
  };
};

export const handler = createHandler();

if (import.meta.main) {
  serve(handler);
}

export const __testing = {
  parseRoleConflictDetails,
  formatRoleConflictMessage,
  parseInput,
  processRoleMigrationResult,
  handleMembershipRoleRpcError,
  resolveAdminActorContext,
  createHandler,
};
