import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/auth.ts";
import {
  extractPostgrestErrorCode,
  HttpError,
  isHttpError,
  isPostgrestError,
} from "../_shared/http-errors.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";
import {
  emitMembershipAliasResolvedEvent,
  MembershipAliasResolvedEventPayload,
} from "../_shared/events.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import {
  authenticateAdminRequest,
  resolveAdminActorContext,
} from "../_shared/admin-auth.ts";
import {
  applyMetadataSync,
  type JsonRecord,
  normalizeMetadataPayload,
} from "../_shared/metadata-sync.ts";
import { getMembershipOwnerUserId } from "../_shared/memberships.ts";
import { tryBuildManualInterventionResponse } from "../_shared/manual-intervention.ts";

interface AliasRequestInput {
  membership_id: number;
  normalized_email: string;
  reason: string | null;
}

interface AliasRpcPayload {
  membership_id: unknown;
  email_normalized: unknown;
  metadata_payload: unknown;
  should_refresh_session: unknown;
  request_id: unknown;
}

interface ProcessContext {
  requestId: string;
  userId: string;
  actorAcademyId: number | null;
  startedAt: number;
  targetUserId: string | null;
}

const EMAIL_MISMATCH_COPY =
  "The provided email does not match the one stored on the account.";
const ROLE_SCOPE_CONFLICT_COPY =
  "You can only correct alias conflicts in your academy. Contact the platform team for other cases.";
const ACTOR_CONTEXT_COPY =
  "We could not validate your admin session. Check your active academy and try again.";
const MEMBERSHIP_NOT_FOUND_COPY = "We could not find the requested membership.";
const INVALID_STATUS_COPY =
  "This membership must stay in awaiting_login before resolving the alias.";
const METADATA_SYNC_COPY =
  "We could not refresh the session after resolving the alias. Try again.";
const GENERIC_FAILURE_COPY = "We could not resolve the alias. Try again.";
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

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeRequestId = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseInput(body: unknown): AliasRequestInput {
  if (!isPlainRecord(body)) {
    throw new HttpError(
      400,
      "Invalid payload. Send JSON with membership_id and email.",
    );
  }
  const record = body;
  const membershipId = record.membership_id ?? record.membershipId;
  const emailValue = record.normalized_email ?? record.email ??
    record.email_normalized;
  const reasonValue = record.reason ?? null;

  const membership_id = toSafeInteger(membershipId);
  if (membership_id === null) {
    throw new HttpError(400, "Invalid membership_id.");
  }

  if (typeof emailValue !== "string" || emailValue.trim().length === 0) {
    throw new HttpError(400, "Send the normalized email address.");
  }

  const normalized_email = normalizeEmail(emailValue);
  const reason =
    typeof reasonValue === "string" && reasonValue.trim().length > 0
      ? reasonValue.trim()
      : null;

  return { membership_id, normalized_email, reason };
}

async function processAliasResult(
  payload: AliasRpcPayload,
  context: ProcessContext,
  deps?: {
    applyMetadata?: (userId: string, data: JsonRecord | null) => Promise<void>;
    emitEvent?: (payload: MembershipAliasResolvedEventPayload) => Promise<void>;
    now?: () => number;
    resolveTargetUserId?: (membershipId: number) => Promise<string>;
  },
): Promise<
  {
    membership_id: number;
    email_normalized: string;
    metadata_payload: JsonRecord | null;
    should_refresh_session: boolean;
    request_id: string;
  }
> {
  const membershipId = toSafeInteger(payload.membership_id);
  if (membershipId === null) {
    throw new HttpError(500, GENERIC_FAILURE_COPY, {
      reason: "invalid_membership_id",
    });
  }

  const normalizedEmail = typeof payload.email_normalized === "string"
    ? normalizeEmail(payload.email_normalized)
    : null;

  if (!normalizedEmail) {
    throw new HttpError(500, GENERIC_FAILURE_COPY, { reason: "invalid_email" });
  }

  const metadataPayload = normalizeMetadataPayload(payload.metadata_payload);
  const shouldRefresh = normalizeBoolean(payload.should_refresh_session);
  const resolvedRequestId = normalizeRequestId(
    payload.request_id,
    context.requestId,
  );

  if (resolvedRequestId !== context.requestId) {
    throw new HttpError(
      502,
      REQUEST_ID_MISMATCH_COPY,
      {
        reason: "request_id_mismatch",
        request_id: context.requestId,
        rpc_request_id: resolvedRequestId,
      },
    );
  }

  const mergedDeps = {
    applyMetadata: deps?.applyMetadata ??
      ((userId: string, data: JsonRecord | null) =>
        applyMetadataSync(userId, data, METADATA_SYNC_COPY)),
    emitEvent: deps?.emitEvent ??
      ((eventPayload: MembershipAliasResolvedEventPayload) =>
        emitMembershipAliasResolvedEvent(eventPayload)),
    now: deps?.now ?? (() => Date.now()),
    resolveTargetUserId: deps?.resolveTargetUserId,
  };

  const hasMetadataPayload = metadataPayload !== null;
  let targetUserId = context.targetUserId;

  if (hasMetadataPayload) {
    if (!targetUserId && mergedDeps.resolveTargetUserId) {
      targetUserId = await mergedDeps.resolveTargetUserId(membershipId);
    }

    if (!targetUserId) {
      throw new HttpError(500, METADATA_SYNC_COPY, {
        reason: "missing_target_membership_user",
      });
    }

    await mergedDeps.applyMetadata(targetUserId, metadataPayload);
  }

  const duration = Math.max(0, mergedDeps.now() - context.startedAt);
  await mergedDeps.emitEvent({
    request_id: resolvedRequestId,
    membership_id: membershipId,
    normalized_email: normalizedEmail,
    actor_user_id: context.userId,
    actor_academy_id: context.actorAcademyId,
    duration_ms: duration,
  });

  return {
    membership_id: membershipId,
    email_normalized: normalizedEmail,
    metadata_payload: metadataPayload,
    should_refresh_session: shouldRefresh,
    request_id: resolvedRequestId,
  };
}

function handleAliasRpcError(
  error: unknown,
  context: { requestId: string },
): never {
  if (!isPostgrestError(error)) {
    throw error;
  }

  const rawCode = extractPostgrestErrorCode(error) ?? "UNKNOWN_ERROR";
  const code = [
      "EMAIL_MISMATCH",
      "ROLE_SCOPE_CONFLICT",
      "ACTOR_CONTEXT_REQUIRED",
      "MEMBERSHIP_NOT_FOUND",
      "INVALID_MEMBERSHIP_STATUS",
    ].includes(rawCode)
    ? rawCode
    : "UNKNOWN_ERROR";
  const buildDetails = (extra?: Record<string, unknown>) => ({
    code,
    request_id: context.requestId,
    ...(extra ?? {}),
  });

  if (code === "EMAIL_MISMATCH") {
    throw new HttpError(409, EMAIL_MISMATCH_COPY, buildDetails());
  }

  if (code === "ROLE_SCOPE_CONFLICT") {
    throw new HttpError(403, ROLE_SCOPE_CONFLICT_COPY, buildDetails());
  }

  if (code === "ACTOR_CONTEXT_REQUIRED") {
    throw new HttpError(403, ACTOR_CONTEXT_COPY, buildDetails());
  }

  if (code === "MEMBERSHIP_NOT_FOUND") {
    throw new HttpError(404, MEMBERSHIP_NOT_FOUND_COPY, buildDetails());
  }

  if (code === "INVALID_MEMBERSHIP_STATUS") {
    throw new HttpError(409, INVALID_STATUS_COPY, buildDetails());
  }

  console.error("[admin-resolve-alias] rpcError", {
    request_id: context.requestId,
    failure_code: code,
  });
  throw new HttpError(500, GENERIC_FAILURE_COPY, buildDetails());
}

function buildErrorResponse(
  requestId: string,
  error: unknown,
  headers: Record<string, string>,
): Response {
  const payload = buildPublicErrorPayload(requestId, error, {
    fallbackError: GENERIC_FAILURE_COPY,
  });

  if (!isHttpError(error)) {
    console.error("[admin-resolve-alias] unexpected_error", {
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
  getServiceRoleClient: typeof getServiceRoleClient;
  processAliasResult: typeof processAliasResult;
  getMembershipOwnerUserId: typeof getMembershipOwnerUserId;
  tryBuildManualInterventionResponse: typeof tryBuildManualInterventionResponse;
  applyMetadata: (userId: string, payload: JsonRecord | null) => Promise<void>;
  emitMembershipAliasResolvedEvent: typeof emitMembershipAliasResolvedEvent;
}

const defaultHandlerDeps: HandlerDeps = {
  authenticateAdminRequest,
  resolveAdminActorContext,
  getServiceRoleClient,
  processAliasResult,
  getMembershipOwnerUserId,
  tryBuildManualInterventionResponse,
  applyMetadata: (userId: string, payload: JsonRecord | null) =>
    applyMetadataSync(userId, payload, METADATA_SYNC_COPY),
  emitMembershipAliasResolvedEvent,
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
      override?: string,
    ) =>
      new Response(
        JSON.stringify({ request_id: override ?? requestId, ...body }),
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
        .rpc("resolve_membership_alias", {
          p_actor_user_id: authContext.user.id,
          p_actor_academy_id: actorContext.actorAcademyId,
          p_actor_is_platform_admin: actorContext.actorIsPlatformAdmin,
          p_membership_id: payload.membership_id,
          p_normalized_email: payload.normalized_email,
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
        handleAliasRpcError(error, { requestId });
      }

      if (!data) {
        throw new HttpError(500, GENERIC_FAILURE_COPY, {
          code: "NO_DATA",
          request_id: requestId,
        });
      }

      const rpcPayload = data as AliasRpcPayload;

      const result = await deps.processAliasResult(
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
          applyMetadata: (userId, data) => deps.applyMetadata(userId, data),
          emitEvent: (payload) =>
            deps.emitMembershipAliasResolvedEvent(payload),
        },
      );

      console.info("[admin-resolve-alias] success", {
        request_id: result.request_id,
      });

      return respond(
        200,
        {
          membership_id: result.membership_id,
          email_normalized: result.email_normalized,
          metadata_payload: result.metadata_payload,
          should_refresh_session: result.should_refresh_session,
        },
        result.request_id,
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
  parseInput,
  processAliasResult,
  handleAliasRpcError,
  createHandler,
};
