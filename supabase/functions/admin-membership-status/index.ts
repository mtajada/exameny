import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import {
  extractPostgrestErrorCode,
  HttpError,
  isPostgrestError,
  parseKeyValueDetail,
} from "../_shared/http-errors.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import type { AuthContext } from "../_shared/auth.ts";
import {
  applyMetadataSync,
  JsonRecord,
  normalizeMetadataPayload,
} from "../_shared/metadata-sync.ts";

interface StatusRequestInput {
  membership_id: number;
  action: "activate" | "deactivate";
}

interface StatusRpcPayload {
  membership_id: unknown;
  academy_id: unknown;
  user_id: unknown;
  role: unknown;
  status: unknown;
  metadata_payload: unknown;
  should_refresh_session: unknown;
  request_id: unknown;
}

interface NormalizedStatusResult {
  membership_id: number;
  academy_id: number | null;
  user_id: string | null;
  role: string | null;
  status: string | null;
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

type HandlerDeps = {
  createCorsHeaders: typeof createCorsHeaders;
  ensureAllowedOrigin: typeof ensureAllowedOrigin;
  resolveRequestId: typeof resolveRequestId;
  authenticateAdminRequest: (req: Request) => Promise<AuthContextWithRpc>;
  applyMetadataSync: typeof applyMetadataSync;
};

type RpcError = { message?: string; details?: string; code?: string };
type RpcSingleResult<T> = { data: T | null; error: RpcError | null };
type SupabaseRpcClient = {
  rpc: (name: string, params?: Record<string, unknown>) => {
    single: <T>() => PromiseLike<RpcSingleResult<T>>;
  };
};
type AuthContextWithRpc = Omit<AuthContext, "supabase"> & {
  supabase: SupabaseRpcClient;
};

const MEMBERSHIP_NOT_FOUND_COPY = "We could not find the requested membership.";
const FORBIDDEN_COPY =
  "You are not allowed to update this membership. Confirm your active academy selection.";
const MEMBERSHIP_NOT_CLAIMED_COPY =
  "The invitation must be claimed before changing its status.";
const USER_REQUIRED_COPY =
  "Link the membership to a user before changing its status.";
const GENERIC_FAILURE_COPY =
  "We could not update the membership status. Try again.";
const METADATA_SYNC_COPY =
  "We could not refresh the session after updating the status. Try again.";
const MEMBERSHIP_ALIAS_CONFLICT_COPY =
  "We detected an email mismatch for this membership. Resolve the alias conflict before trying again.";

const toSafeInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
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

const parseAction = (value: unknown): StatusRequestInput["action"] | null => {
  if (value === "activate" || value === "deactivate") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "activate" || normalized === "deactivate") {
      return normalized as StatusRequestInput["action"];
    }
  }
  return null;
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeString = (
  value: unknown,
):
  | string
  | null => (typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseInput(body: unknown): StatusRequestInput {
  if (!isPlainRecord(body)) {
    throw new HttpError(
      400,
      "Invalid payload. Send JSON with membership_id and action.",
    );
  }
  const record = body;
  const membershipValue = record.membership_id ?? record.membershipId;
  const actionValue = record.action ?? record.mode;

  const membership_id = toSafeInteger(membershipValue);
  if (membership_id === null) {
    throw new HttpError(400, "Invalid membership_id.");
  }

  const action = parseAction(actionValue);
  if (!action) {
    throw new HttpError(400, 'action must be "activate" or "deactivate".');
  }

  return { membership_id, action };
}

function normalizeStatusPayload(
  payload: StatusRpcPayload,
  fallbackRequestId: string,
): NormalizedStatusResult {
  const membershipId = toSafeInteger(payload.membership_id);
  if (membershipId === null) {
    throw new HttpError(500, GENERIC_FAILURE_COPY, {
      reason: "invalid_membership_id",
    });
  }

  const academyId = toSafeInteger(payload.academy_id);
  const userId = normalizeString(payload.user_id);
  const role = normalizeString(payload.role);
  const status = normalizeString(payload.status);
  const metadataPayload = normalizeMetadataPayload(payload.metadata_payload);
  const shouldRefresh = normalizeBoolean(payload.should_refresh_session);
  const requestId = normalizeString(payload.request_id) ?? fallbackRequestId;

  return {
    membership_id: membershipId,
    academy_id: academyId,
    user_id: userId,
    role,
    status,
    metadata_payload: metadataPayload,
    should_refresh_session: shouldRefresh,
    request_id: requestId,
  };
}

const parseAliasConflictDetails = (
  detail: string | null | undefined,
): AliasConflictDetails | null => {
  const parsed = parseKeyValueDetail(detail);
  const membershipIdRaw = parsed.membership_id ?? null;
  const membershipId = membershipIdRaw
    ? Number.parseInt(membershipIdRaw, 10)
    : Number.NaN;
  const aliasDetails: AliasConflictDetails = {
    membership_id: Number.isSafeInteger(membershipId) ? membershipId : null,
    user_id: parsed.user_id ?? null,
    email_login: parsed.email_login ?? null,
    email_membership: parsed.email_membership ?? null,
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

function buildErrorDetails(
  code: string,
  requestId: string,
  extra?: Record<string, unknown>,
) {
  return { code, request_id: requestId, ...(extra ?? {}) };
}

function handleStatusRpcError(
  error: unknown,
  context: { requestId: string },
): never {
  if (!isPostgrestError(error)) {
    throw error;
  }

  const rawCode = extractPostgrestErrorCode(error) ?? "UNKNOWN_ERROR";
  const code = [
      "MEMBERSHIP_NOT_FOUND",
      "MEMBERSHIP_NOT_CLAIMED",
      "USER_REQUIRED",
      "MEMBERSHIP_OWNERSHIP_CONFLICT",
      "FORBIDDEN",
      "MEMBERSHIP_ID_REQUIRED",
    ].includes(rawCode)
    ? rawCode
    : "UNKNOWN_ERROR";
  const details = (error as { details?: string }).details ?? null;

  if (code === "MEMBERSHIP_NOT_FOUND") {
    throw new HttpError(
      404,
      MEMBERSHIP_NOT_FOUND_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "MEMBERSHIP_NOT_CLAIMED") {
    throw new HttpError(
      409,
      MEMBERSHIP_NOT_CLAIMED_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "USER_REQUIRED") {
    throw new HttpError(
      409,
      USER_REQUIRED_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "MEMBERSHIP_OWNERSHIP_CONFLICT") {
    const aliasDetails = parseAliasConflictDetails(details);
    const extra = aliasDetails ? { alias_conflict: aliasDetails } : undefined;
    throw new HttpError(
      409,
      MEMBERSHIP_ALIAS_CONFLICT_COPY,
      buildErrorDetails(code, context.requestId, extra),
    );
  }

  if (code === "FORBIDDEN") {
    throw new HttpError(
      403,
      FORBIDDEN_COPY,
      buildErrorDetails(code, context.requestId),
    );
  }

  if (code === "MEMBERSHIP_ID_REQUIRED") {
    throw new HttpError(
      400,
      "membership_id is required.",
      buildErrorDetails(code, context.requestId),
    );
  }

  console.error("[admin-membership-status] rpcError", {
    request_id: context.requestId,
    failure_code: code,
  });

  throw new HttpError(
    500,
    GENERIC_FAILURE_COPY,
    buildErrorDetails(code, context.requestId),
  );
}

function buildErrorResponse(
  requestId: string,
  error: unknown,
  headers: Record<string, string>,
): Response {
  const payload = buildPublicErrorPayload(requestId, error, {
    fallbackError: GENERIC_FAILURE_COPY,
    detailsAllowlist: ["alias_conflict"],
  });

  if (payload.status === 500 && payload.body.error === GENERIC_FAILURE_COPY) {
    console.error("[admin-membership-status] unexpected_error", {
      request_id: requestId,
    });
  }

  return new Response(JSON.stringify(payload.body), {
    status: payload.status,
    headers,
  });
}

const createHandler = (overrides?: Partial<HandlerDeps>) => {
  const deps: HandlerDeps = {
    createCorsHeaders,
    ensureAllowedOrigin,
    resolveRequestId,
    authenticateAdminRequest,
    applyMetadataSync,
    ...(overrides ?? {}),
  };

  return async function handler(req: Request): Promise<Response> {
    const baseHeaders = deps.createCorsHeaders(req);
    if (req.method === "OPTIONS") {
      try {
        deps.ensureAllowedOrigin(req);
        return new Response("ok", { headers: baseHeaders });
      } catch (error) {
        return buildErrorResponse("preflight", error, baseHeaders);
      }
    }

    const jsonHeaders = { ...baseHeaders, "Content-Type": "application/json" };
    const { requestId } = await deps.resolveRequestId(req.headers);
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
      deps.ensureAllowedOrigin(req);

      if (req.method !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }

      const authContext = await deps.authenticateAdminRequest(req);
      const payload = parseInput(await req.json());
      const rpcName = payload.action === "activate"
        ? "activate_membership"
        : "deactivate_membership";

      const { data, error } = await authContext.supabase
        .rpc(rpcName, {
          p_membership_id: payload.membership_id,
          p_request_id: requestId,
        })
        .single<StatusRpcPayload>();

      if (error) {
        handleStatusRpcError(error, { requestId });
      }

      if (!data) {
        throw new HttpError(500, GENERIC_FAILURE_COPY, {
          code: "NO_DATA",
          request_id: requestId,
        });
      }

      const normalized = normalizeStatusPayload(data, requestId);

      if (normalized.request_id !== requestId) {
        throw new HttpError(500, GENERIC_FAILURE_COPY, {
          code: "REQUEST_ID_MISMATCH",
          request_id: requestId,
          rpc_request_id: normalized.request_id,
        });
      }

      const hasMetadataPayload = normalized.metadata_payload !== null;
      if (
        (hasMetadataPayload || normalized.should_refresh_session) &&
        !normalized.user_id
      ) {
        throw new HttpError(500, METADATA_SYNC_COPY, {
          reason: "missing_user_for_metadata",
        });
      }

      if (hasMetadataPayload && normalized.user_id) {
        // should_refresh_session only informs the client; metadata applies whenever it exists
        await deps.applyMetadataSync(
          normalized.user_id,
          normalized.metadata_payload,
          METADATA_SYNC_COPY,
        );
      }

      console.info("[admin-membership-status] success", {
        request_id: normalized.request_id,
        action: payload.action,
      });

      return respond(200, {
        membership_id: normalized.membership_id,
        academy_id: normalized.academy_id,
        user_id: normalized.user_id,
        role: normalized.role,
        status: normalized.status,
        metadata_payload: normalized.metadata_payload,
        should_refresh_session: normalized.should_refresh_session,
        action: payload.action,
      }, normalized.request_id);
    } catch (error) {
      return buildErrorResponse(requestId, error, jsonHeaders);
    }
  };
};

const handler = createHandler();

if (import.meta.main) {
  serve(handler);
}

export const __testing = {
  parseInput,
  normalizeStatusPayload,
  handleStatusRpcError,
  createHandler,
};
