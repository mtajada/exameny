import { serve } from "std/http/server.ts";
import {
  type AuthContext,
  getServiceRoleClient,
  requireAuth,
} from "../_shared/auth.ts";
import { HttpError, isHttpError } from "../_shared/http-errors.ts";
import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { emitSetActiveAcademySuccess } from "../_shared/events.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import { resolveActiveAcademyIdFromMetadata } from "../_shared/membership-context.ts";

interface RpcError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
}

interface RpcResponse<T> {
  data: T | T[] | null;
  error: RpcError | null;
}

interface MetadataPayload {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

interface AcademyMembershipRow {
  id: number;
  academy_id: number;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
}

interface SetActiveAcademyRpcRow {
  membership: AcademyMembershipRow;
  metadata_payload: MetadataPayload;
  should_refresh_session: boolean;
  request_id: string;
}

interface MembershipMetadataRecord {
  academy_id?: number | string | null;
  status?: string | null;
}

type UpdateUserResult = {
  data: { user: unknown } | null;
  error: { message?: string } | null;
};
type ServiceRoleClient = {
  auth: {
    admin: {
      updateUserById: (
        uid: string,
        attributes: Record<string, unknown>,
      ) => PromiseLike<UpdateUserResult>;
    };
  };
};

interface HandlerDependencies {
  requireAuth: (req: Request) => Promise<AuthContextWithRpc>;
  getServiceRoleClient: () => ServiceRoleClient;
  emitSetActiveAcademySuccess: typeof emitSetActiveAcademySuccess;
  createCorsHeaders: typeof createCorsHeaders;
  ensureAllowedOrigin: typeof ensureAllowedOrigin;
  performanceNow: () => number;
  resolveRequestId: typeof resolveRequestId;
}

const defaultDependencies: HandlerDependencies = {
  requireAuth,
  getServiceRoleClient,
  emitSetActiveAcademySuccess,
  createCorsHeaders,
  ensureAllowedOrigin,
  performanceNow: () => performance.now(),
  resolveRequestId,
};

const ACADEMY_NOT_OWNED_MESSAGE = "Unable to change academy, please try again";

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<RpcResponse<SetActiveAcademyRpcRow>>;
};
type AuthContextWithRpc = Omit<AuthContext, "supabase"> & {
  supabase: SupabaseRpcClient;
};

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[-]?\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isActiveMembershipForAcademy(
  record: MembershipMetadataRecord | null,
  academyId: number,
): boolean {
  if (!record) {
    return false;
  }
  const status = typeof record.status === "string"
    ? record.status.toLowerCase()
    : null;
  if (status !== "active") {
    return false;
  }
  const candidateAcademyId = parseNumericId(record.academy_id ?? null);
  return candidateAcademyId === academyId;
}

function ensureCallerOwnsAcademy(
  authContext: AuthContextWithRpc,
  academyId: number,
): void {
  const memberships = Array.isArray(authContext.user.app_metadata?.memberships)
    ? authContext.user.app_metadata?.memberships
    : [];
  const ownsAcademy = memberships.some((entry) => {
    if (!isPlainRecord(entry)) {
      return false;
    }
    return isActiveMembershipForAcademy(entry, academyId);
  });

  if (!ownsAcademy) {
    throw new HttpError(403, ACADEMY_NOT_OWNED_MESSAGE);
  }
}

function parseJsonBody(payload: unknown): number {
  if (!isPlainRecord(payload)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  const academyId = payload.academy_id;
  if (
    typeof academyId !== "number" || Number.isNaN(academyId) ||
    !Number.isFinite(academyId)
  ) {
    throw new HttpError(400, "academy_id must be a finite number");
  }
  if (!Number.isInteger(academyId)) {
    throw new HttpError(422, "academy_id must be an integer");
  }
  if (academyId <= 0) {
    throw new HttpError(422, "academy_id must be greater than zero");
  }
  return academyId;
}

function extractMetadataPayload(value: unknown): MetadataPayload {
  if (!isPlainRecord(value)) {
    throw new HttpError(500, "RPC response is missing metadata payload");
  }
  const appMetadata = value.app_metadata;
  const userMetadata = value.user_metadata;
  if (!isPlainRecord(appMetadata)) {
    throw new HttpError(500, "metadata_payload.app_metadata is missing");
  }
  if (!isPlainRecord(userMetadata)) {
    throw new HttpError(500, "metadata_payload.user_metadata is missing");
  }
  return {
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  };
}

function normalizeMembershipRow(value: unknown): AcademyMembershipRow {
  if (!isPlainRecord(value)) {
    throw new HttpError(500, "RPC response is missing membership data");
  }
  const row = value;
  const id = row.id;
  const academyId = row.academy_id;
  const email = row.email;
  const role = row.role;
  const status = row.status;
  const createdAt = row.created_at;
  const updatedAt = row.updated_at;

  if (typeof id !== "number" || typeof academyId !== "number") {
    throw new HttpError(500, "Membership row is missing identifiers");
  }
  if (
    typeof email !== "string" || typeof role !== "string" ||
    typeof status !== "string"
  ) {
    throw new HttpError(500, "Membership row is missing required fields");
  }
  if (typeof createdAt !== "string" || typeof updatedAt !== "string") {
    throw new HttpError(500, "Membership row is missing timestamps");
  }

  return {
    id,
    academy_id: academyId,
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    email,
    role,
    status,
    subscription_start_date: typeof row.subscription_start_date === "string"
      ? row.subscription_start_date
      : null,
    subscription_end_date: typeof row.subscription_end_date === "string"
      ? row.subscription_end_date
      : null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeRpcRow(result: unknown): SetActiveAcademyRpcRow {
  const row = Array.isArray(result) ? result[0] : result;
  if (!isPlainRecord(row)) {
    throw new HttpError(500, "RPC response did not return a membership row");
  }
  const candidate = row;
  const membership = normalizeMembershipRow(candidate.membership);
  const metadataPayload = candidate.metadata_payload;
  const shouldRefresh = candidate.should_refresh_session;
  const requestId = candidate.request_id;

  if (typeof requestId !== "string" || requestId.length === 0) {
    throw new HttpError(500, "RPC response is missing request_id");
  }

  return {
    membership,
    metadata_payload: extractMetadataPayload(metadataPayload),
    should_refresh_session: typeof shouldRefresh === "boolean"
      ? shouldRefresh
      : false,
    request_id: requestId,
  };
}

async function callSetActiveAcademy(
  client: SupabaseRpcClient,
  academyId: number,
  requestId: string,
): Promise<SetActiveAcademyRpcRow> {
  const payload: Record<string, unknown> = {
    p_academy_id: academyId,
  };

  if (requestId) {
    payload.p_request_id = requestId;
  }

  const { data, error }: RpcResponse<SetActiveAcademyRpcRow> = await client.rpc(
    "set_active_academy",
    payload,
  );

  if (error) {
    const normalizedMessage = (error.message ?? "").toUpperCase();
    if (normalizedMessage === "ACADEMY_NOT_OWNED") {
      throw new HttpError(403, ACADEMY_NOT_OWNED_MESSAGE);
    }
    if (normalizedMessage === "AUTH_REQUIRED") {
      throw new HttpError(401, "Missing authentication context", error);
    }

    const code = error.code ?? "";
    if (code === "P0001" || code === "23514") {
      throw new HttpError(
        422,
        error.message ?? "The request is invalid",
        error,
      );
    }
    if (code.startsWith("23")) {
      throw new HttpError(409, error.message ?? "Operation conflict", error);
    }
    throw new HttpError(500, "Unexpected database error", error);
  }

  return normalizeRpcRow(data);
}

async function applyMetadata(
  getClient: () => ServiceRoleClient,
  userId: string,
  metadata: MetadataPayload,
): Promise<void> {
  const client = getClient();
  const { error } = await client.auth.admin.updateUserById(userId, {
    app_metadata: metadata.app_metadata ?? {},
    user_metadata: metadata.user_metadata ?? {},
  });
  if (error) {
    throw new HttpError(500, "Failed to apply user metadata", error);
  }
}

function createErrorResponse(
  error: unknown,
  requestId: string,
): { status: number; body: Record<string, unknown> } {
  if (isHttpError(error)) {
    return {
      status: error.status,
      body: {
        error: error.message,
        request_id: requestId,
      },
    };
  }

  console.error("[user-set-active-academy] Unexpected error", {
    request_id: requestId,
  });
  return {
    status: 500,
    body: {
      error: "Unexpected error",
      request_id: requestId,
    },
  };
}

export function buildUserSetActiveAcademyHandler(
  dependencies: Partial<HandlerDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps: HandlerDependencies = { ...defaultDependencies, ...dependencies };

  return async (request: Request): Promise<Response> => {
    const startedAt = deps.performanceNow();
    const { requestId: edgeRequestId } = await deps.resolveRequestId(
      request.headers,
    );

    if (request.method === "OPTIONS") {
      const corsHeaders = deps.createCorsHeaders(request);
      corsHeaders["x-request-id"] = edgeRequestId;
      return new Response("ok", { headers: corsHeaders });
    }

    const corsHeaders = deps.createCorsHeaders(request);
    const baseHeaders: HeadersInit = {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-request-id": edgeRequestId,
    };
    const responseRequestId = edgeRequestId;

    if (request.method !== "POST") {
      baseHeaders["Allow"] = "POST, OPTIONS";
      return new Response(
        JSON.stringify({
          error: "Method Not Allowed",
          request_id: edgeRequestId,
        }),
        {
          status: 405,
          headers: baseHeaders,
        },
      );
    }

    try {
      deps.ensureAllowedOrigin(request);

      let parsedBody: unknown;
      try {
        parsedBody = await request.json();
      } catch {
        throw new HttpError(400, "Request body must be valid JSON");
      }

      const academyId = parseJsonBody(parsedBody);
      const authContext = await deps.requireAuth(request);
      const previousAcademyId = resolveActiveAcademyIdFromMetadata(
        authContext.user,
      );
      ensureCallerOwnsAcademy(authContext, academyId);

      const rpcResult = await callSetActiveAcademy(
        authContext.supabase,
        academyId,
        edgeRequestId,
      );
      if (rpcResult.request_id !== edgeRequestId) {
        throw new HttpError(
          502,
          "The operation returned an unexpected identifier",
          {
            expected_request_id: edgeRequestId,
            received_request_id: rpcResult.request_id,
          },
        );
      }
      if (rpcResult.should_refresh_session) {
        await applyMetadata(
          deps.getServiceRoleClient,
          authContext.user.id,
          rpcResult.metadata_payload,
        );
      }

      const durationMs = Math.round(deps.performanceNow() - startedAt);
      await deps.emitSetActiveAcademySuccess({
        request_id: responseRequestId,
        duration_ms: durationMs,
        user_id: authContext.user.id,
        previous_academy_id: previousAcademyId,
        new_academy_id: rpcResult.membership.academy_id,
        role: rpcResult.membership.role,
      });

      const responseHeaders = {
        ...baseHeaders,
        "x-request-id": responseRequestId,
        "x-duration-ms": String(durationMs),
      };

      console.info("[user-set-active-academy] Completed", {
        request_id: responseRequestId,
        duration_ms: durationMs,
      });

      return new Response(
        JSON.stringify({
          membership: rpcResult.membership,
          membership_id: rpcResult.membership.id,
          academy_id: rpcResult.membership.academy_id,
          role: rpcResult.membership.role,
          status: rpcResult.membership.status,
          metadata_payload: rpcResult.metadata_payload,
          should_refresh_session: rpcResult.should_refresh_session,
          request_id: responseRequestId,
        }),
        {
          status: 200,
          headers: responseHeaders,
        },
      );
    } catch (error) {
      const durationMs = Math.round(deps.performanceNow() - startedAt);
      const responseHeaders = {
        ...baseHeaders,
        "x-request-id": responseRequestId,
        "x-duration-ms": String(durationMs),
      };
      console.error("[user-set-active-academy] Failed", {
        request_id: responseRequestId,
        duration_ms: durationMs,
      });
      const { status, body } = createErrorResponse(error, responseRequestId);
      return new Response(JSON.stringify(body), {
        status,
        headers: responseHeaders,
      });
    }
  };
}

if (import.meta.main) {
  serve(buildUserSetActiveAcademyHandler());
}
