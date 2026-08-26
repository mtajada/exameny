import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { HttpError } from "../_shared/http-errors.ts";
import { getServiceRoleClient } from "../_shared/auth.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import { emitMembershipAliasConflictLogged } from "../_shared/events.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";

type JsonRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INTERNAL_TOKEN = Deno.env.get("LOG_ALIAS_CONFLICT_TOKEN");

if (!INTERNAL_TOKEN) {
  throw new Error(
    "[log-membership-alias-conflict] Missing LOG_ALIAS_CONFLICT_TOKEN environment variable.",
  );
}

interface AliasConflictRequest {
  userId: string | null;
  emailLogin: string;
  emailMembership: string;
  requestId: string;
  membershipId: number | null;
  context: JsonRecord | null;
}

interface AliasConflictRow {
  id: number;
  user_id: string | null;
  email_login: string;
  email_membership: string;
  request_id: string;
  detected_at: string;
  resolved_at: string | null;
  resolver_id: string | null;
}

// Align with Phase 3 SQL contract: only trim edges and lowercase, never strip interior spacing
const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const isPlainRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toSafeInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? Math.trunc(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0 || !/^[-]?\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  return null;
};

const normalizeAliasConflictRow = (value: unknown): AliasConflictRow => {
  if (!isPlainRecord(value)) {
    throw new HttpError(500, "No pudimos registrar el incidente de alias.", {
      code: "INVALID_ROW",
    });
  }
  const id = toSafeInteger(value.id);
  const emailLogin = typeof value.email_login === "string"
    ? value.email_login
    : null;
  const emailMembership = typeof value.email_membership === "string"
    ? value.email_membership
    : null;
  const requestId = typeof value.request_id === "string"
    ? value.request_id
    : null;
  const detectedAt = typeof value.detected_at === "string"
    ? value.detected_at
    : null;
  const resolvedAt = typeof value.resolved_at === "string"
    ? value.resolved_at
    : null;
  const resolverId = typeof value.resolver_id === "string"
    ? value.resolver_id
    : null;
  if (
    id === null ||
    !emailLogin ||
    !emailMembership ||
    !requestId ||
    !detectedAt
  ) {
    throw new HttpError(500, "No pudimos registrar el incidente de alias.", {
      code: "INVALID_ROW",
    });
  }

  return {
    id,
    user_id: typeof value.user_id === "string" ? value.user_id : null,
    email_login: emailLogin,
    email_membership: emailMembership,
    request_id: requestId,
    detected_at: detectedAt,
    resolved_at: resolvedAt,
    resolver_id: resolverId,
  };
};

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "El cuerpo debe ser JSON válido.", {
      code: "INVALID_JSON",
    });
  }
}

function validateUuid(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new HttpError(422, `${field} debe ser un UUID válido.`, {
      code: "INVALID_UUID",
      field,
    });
  }
  return value.toLowerCase();
}

function validateEmail(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(422, `${field} es obligatorio.`, {
      code: "EMAIL_REQUIRED",
      field,
    });
  }
  const normalized = normalizeEmail(value);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new HttpError(422, `${field} no tiene un formato válido.`, {
      code: "INVALID_EMAIL",
      field,
    });
  }
  return normalized;
}

function parseAliasConflictRequest(body: unknown): AliasConflictRequest {
  if (!isPlainRecord(body)) {
    throw new HttpError(400, "El cuerpo debe ser un objeto JSON.", {
      code: "INVALID_BODY",
    });
  }

  const requestIdRaw = body.request_id ?? body.requestId;
  if (typeof requestIdRaw !== "string") {
    throw new HttpError(422, "request_id es obligatorio.", {
      code: "REQUEST_ID_REQUIRED",
    });
  }
  const requestId = validateUuid(requestIdRaw.trim(), "request_id");

  const userIdRaw = body.user_id ?? body.userId ?? null;
  let userId: string | null = null;
  if (userIdRaw !== null && userIdRaw !== undefined) {
    if (typeof userIdRaw !== "string") {
      throw new HttpError(422, "user_id debe ser UUID o null.", {
        code: "INVALID_USER_ID",
      });
    }
    userId = validateUuid(userIdRaw.trim(), "user_id");
  }

  const emailLogin = validateEmail(
    body.email_login ?? body.emailLogin,
    "email_login",
  );
  const emailMembership = validateEmail(
    body.email_membership ?? body.emailMembership,
    "email_membership",
  );

  const membershipIdRaw = body.membership_id ?? body.membershipId ?? null;
  let membershipId: number | null = null;
  if (membershipIdRaw !== null && membershipIdRaw !== undefined) {
    const parsed = toSafeInteger(membershipIdRaw);
    if (parsed === null) {
      throw new HttpError(422, "membership_id debe ser numérico.", {
        code: "INVALID_MEMBERSHIP_ID",
      });
    }
    membershipId = parsed;
  }

  const contextRaw = body.context ?? null;
  const context = isPlainRecord(contextRaw) ? contextRaw : null;

  return {
    userId,
    emailLogin,
    emailMembership,
    requestId,
    membershipId,
    context,
  };
}

function extractInternalToken(headers: Headers): string {
  const headerToken = headers.get("x-internal-token") ??
    headers.get("X-Internal-Token");
  if (headerToken && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const authHeader = headers.get("authorization") ??
    headers.get("Authorization");
  if (authHeader) {
    const [scheme, ...rest] = authHeader.trim().split(/\s+/);
    if (scheme && scheme.toLowerCase() === "bearer") {
      const token = rest.join(" ").trim();
      if (token.length > 0) {
        return token;
      }
    }
  }

  return "";
}

type PostgrestErrorLike = { message: string; code?: string };

type PostgrestSingleResponse = PromiseLike<
  { data: unknown | null; error: PostgrestErrorLike | null }
>;

interface AliasConflictRpcBuilder {
  single(): PostgrestSingleResponse;
}

interface AliasConflictDbClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): AliasConflictRpcBuilder;
}

const isAliasConflictDbClient = (
  value: unknown,
): value is AliasConflictDbClient => {
  if (!isPlainRecord(value)) {
    return false;
  }

  return typeof value.rpc === "function";
};

const ensureAliasConflictDbClient = (value: unknown): AliasConflictDbClient => {
  if (!isAliasConflictDbClient(value)) {
    throw new HttpError(500, "No pudimos registrar el incidente de alias.", {
      code: "INVALID_DB_CLIENT",
    });
  }
  return value;
};

async function persistAliasConflict(
  input: AliasConflictRequest,
  client: unknown = getServiceRoleClient(),
): Promise<AliasConflictRow> {
  const dbClient = ensureAliasConflictDbClient(client);
  const payload: JsonRecord = input.context
    ? { source: "log-membership-alias-conflict", ...input.context }
    : {
      source: "log-membership-alias-conflict",
    };

  const { data, error } = await dbClient
    .rpc("upsert_membership_alias_conflict", {
      p_user_id: input.userId,
      p_email_login: input.emailLogin,
      p_email_membership: input.emailMembership,
      p_membership_id: input.membershipId,
      p_request_id: input.requestId,
      p_payload: payload,
    })
    .single();

  if (error || !data) {
    const details = error ? { message: error.message, code: error.code } : null;
    throw new HttpError(500, "No pudimos registrar el incidente de alias.", {
      code: "RPC_FAILED",
      details,
    });
  }

  if (!isPlainRecord(data)) {
    throw new HttpError(500, "No pudimos registrar el incidente de alias.", {
      code: "INVALID_ROW",
    });
  }
  return normalizeAliasConflictRow(data);
}

const buildResponseHeaders = (
  requestId: string,
  request: Request,
): Record<string, string> => {
  const headers = createCorsHeaders(request);
  headers["Content-Type"] = "application/json";
  headers["x-request-id"] = requestId;
  return headers;
};

const buildErrorPayload = (
  error: unknown,
  requestId: string,
): { status: number; body: JsonRecord } => {
  const payload = buildPublicErrorPayload(requestId, error, {
    fallbackError: "Internal server error",
  });
  if (
    payload.status === 500 && payload.body.error === "Internal server error"
  ) {
    console.error("[log-membership-alias-conflict] Unexpected error");
  }
  return { status: payload.status, body: payload.body };
};

interface HandlerDeps {
  ensureOrigin: typeof ensureAllowedOrigin;
  persist: (input: AliasConflictRequest) => Promise<AliasConflictRow>;
  emitEvent: typeof emitMembershipAliasConflictLogged;
  now: () => number;
  internalToken: string;
}

const defaultDeps: HandlerDeps = {
  ensureOrigin: ensureAllowedOrigin,
  persist: persistAliasConflict,
  emitEvent: emitMembershipAliasConflictLogged,
  now: () => performance.now(),
  internalToken: INTERNAL_TOKEN,
};

export function buildLogMembershipAliasConflictHandler(
  overrides?: Partial<HandlerDeps>,
) {
  const deps: HandlerDeps = {
    ...defaultDeps,
    ...overrides,
    internalToken: overrides?.internalToken ?? defaultDeps.internalToken,
  };

  return async function handler(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: createCorsHeaders(request) });
    }

    const { requestId } = await resolveRequestId(request.headers);
    const headers = buildResponseHeaders(requestId, request);
    const providedToken = extractInternalToken(request.headers);
    const hasProvidedToken = typeof providedToken === "string" &&
      providedToken.length > 0;
    const hasInternalSecret = typeof deps.internalToken === "string" &&
      deps.internalToken.length > 0;
    const isAuthorizedInternal = hasInternalSecret && hasProvidedToken &&
      providedToken === deps.internalToken;

    try {
      if (!isAuthorizedInternal) {
        deps.ensureOrigin(request);
      } else {
        console.info(
          "[log-membership-alias-conflict] Skipping origin enforcement for authenticated internal request.",
          {
            request_id: requestId,
          },
        );
      }

      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({
            error: "Method not allowed",
            request_id: requestId,
          }),
          {
            status: 405,
            headers,
          },
        );
      }

      if (!hasProvidedToken) {
        throw new HttpError(401, "Unauthorized request.", {
          code: "INTERNAL_TOKEN_REQUIRED",
        });
      }
      if (!isAuthorizedInternal) {
        throw new HttpError(403, "Forbidden request.", {
          code: "INVALID_INTERNAL_TOKEN",
        });
      }

      const startedAt = deps.now();
      const payload = parseAliasConflictRequest(await readJsonBody(request));
      const record = await deps.persist(payload);
      const duration = Math.round(Math.max(0, deps.now() - startedAt));

      await deps.emitEvent({
        request_id: record.request_id,
        email_login: record.email_login,
        email_membership: record.email_membership,
        user_id: record.user_id,
        detected_at: record.detected_at,
        duration_ms: duration,
      });

      const responseBody = {
        id: record.id,
        user_id: record.user_id,
        email_login: record.email_login,
        email_membership: record.email_membership,
        request_id: record.request_id,
        detected_at: record.detected_at,
        resolved_at: record.resolved_at,
        resolver_id: record.resolver_id,
        should_refresh_session: false,
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers,
      });
    } catch (error) {
      const { status, body } = buildErrorPayload(error, requestId);
      return new Response(JSON.stringify(body), { status, headers });
    }
  };
}

export const logMembershipAliasConflictHandler =
  buildLogMembershipAliasConflictHandler();

if (import.meta.main) {
  serve(logMembershipAliasConflictHandler);
}

export const __testing = {
  normalizeEmail,
  parseAliasConflictRequest,
  extractInternalToken,
  buildLogMembershipAliasConflictHandler,
  persistAliasConflict,
};
