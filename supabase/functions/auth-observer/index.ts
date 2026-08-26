import { serve } from "std/http/server.ts";

import { emitAuthLoginAttempt } from "../_shared/events.ts";
import { HttpError } from "../_shared/http-errors.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";

interface PlainRecord {
  [key: string]: unknown;
}

interface NormalizedLoginAttempt {
  userId: string | null;
  email: string | null;
  provider: string;
  outcome: "success" | "failure";
  timestamp: string;
}

const isPlainRecord = (value: unknown): value is PlainRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNestedString = (
  value: unknown,
  path: readonly string[],
): string | null => {
  let current: unknown = value;
  for (const segment of path) {
    if (!isPlainRecord(current)) {
      return null;
    }
    current = current[segment];
  }
  if (typeof current === "string") {
    return current;
  }
  return null;
};

const readFirstString = (
  value: unknown,
  paths: readonly string[][],
): string | null => {
  for (const path of paths) {
    const candidate = readNestedString(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
};

const sanitizeString = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (value: string | null): string | null => {
  const sanitized = sanitizeString(value);
  return sanitized ? sanitized.toLowerCase() : null;
};

const normalizeTimestamp = (
  value: string | null,
  now: () => string,
): string => {
  const sanitized = sanitizeString(value);
  if (sanitized && !Number.isNaN(Date.parse(sanitized))) {
    return new Date(sanitized).toISOString();
  }
  return now();
};

const deriveOutcome = (eventName: string | null): "success" | "failure" => {
  if (!eventName) {
    return "success";
  }
  const lowered = eventName.toLowerCase();
  return lowered.includes("fail") ? "failure" : "success";
};

const eventPaths: readonly string[][] = [
  ["event"],
  ["type"],
  ["action"],
  ["metadata", "event"],
];

const userIdPaths: readonly string[][] = [
  ["user", "id"],
  ["session", "user", "id"],
  ["record", "user_id"],
  ["user_id"],
  ["data", "user", "id"],
];

const emailPaths: readonly string[][] = [
  ["user", "email"],
  ["session", "user", "email"],
  ["record", "email"],
  ["email"],
  ["data", "user", "email"],
];

const providerPaths: readonly string[][] = [
  ["session", "provider_id"],
  ["session", "provider"],
  ["session", "user", "app_metadata", "provider"],
  ["user", "app_metadata", "provider"],
  ["provider"],
];

const timestampPaths: readonly string[][] = [
  ["timestamp"],
  ["occurred_at"],
  ["occurredAt"],
  ["session", "created_at"],
  ["session", "issued_at"],
  ["record", "timestamp"],
];

function normalizeLoginAttempt(
  body: unknown,
  now: () => string,
): NormalizedLoginAttempt {
  if (!isPlainRecord(body)) {
    throw new HttpError(400, "El payload debe ser un objeto JSON.", {
      code: "INVALID_BODY",
    });
  }

  const eventName = readFirstString(body, eventPaths);
  const userId = sanitizeString(readFirstString(body, userIdPaths));
  const email = normalizeEmail(readFirstString(body, emailPaths));
  const providerRaw = sanitizeString(readFirstString(body, providerPaths));
  const timestamp = normalizeTimestamp(
    readFirstString(body, timestampPaths),
    now,
  );

  return {
    userId: userId ?? null,
    email,
    provider: (providerRaw ?? "unknown").toLowerCase(),
    outcome: deriveOutcome(eventName),
    timestamp,
  };
}

const extractObserverToken = (headers: Headers): string | null => {
  const direct = headers.get("x-auth-observer-token") ??
    headers.get("X-Auth-Observer-Token");
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }

  const authHeader = headers.get("authorization") ??
    headers.get("Authorization");
  if (!authHeader) {
    return null;
  }
  const [scheme, ...rest] = authHeader.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
};

const ensureAuthorized = (headers: Headers, expectedToken: string): void => {
  const provided = extractObserverToken(headers);
  if (!provided || provided !== expectedToken) {
    throw new HttpError(401, "Unauthorized request.", { code: "UNAUTHORIZED" });
  }
};

const buildHeaders = (requestId: string): Headers => {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("x-request-id", requestId);
  return headers;
};

const buildErrorResponse = (
  error: unknown,
  requestId: string,
): { status: number; body: PlainRecord } => {
  const payload = buildPublicErrorPayload(requestId, error, {
    fallbackError: "Internal server error",
  });
  if (
    payload.status === 500 && payload.body.error === "Internal server error"
  ) {
    console.error("[auth-observer] Unexpected error", {
      request_id: requestId,
    });
  }
  return { status: payload.status, body: payload.body };
};

interface HandlerDependencies {
  emitAuthLoginAttempt: typeof emitAuthLoginAttempt;
  resolveRequestId: typeof resolveRequestId;
  getAuthObserverToken: () => string;
  now: () => string;
}

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

const defaultDependencies: HandlerDependencies = {
  emitAuthLoginAttempt,
  resolveRequestId,
  getAuthObserverToken: () =>
    requireEnv(
      "AUTH_OBSERVER_TOKEN",
      "[auth-observer] Missing AUTH_OBSERVER_TOKEN environment variable.",
    ),
  now: () => new Date().toISOString(),
};

export function buildAuthObserverHandler(
  dependencies: Partial<HandlerDependencies> = {},
) {
  const deps: HandlerDependencies = { ...defaultDependencies, ...dependencies };

  return async (request: Request): Promise<Response> => {
    const { requestId } = await deps.resolveRequestId(request.headers);
    const headers = buildHeaders(requestId);

    if (request.method === "OPTIONS") {
      return new Response("ok", { headers });
    }

    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return new Response(
        JSON.stringify({ error: "Method not allowed", request_id: requestId }),
        {
          status: 405,
          headers,
        },
      );
    }

    try {
      ensureAuthorized(request.headers, deps.getAuthObserverToken());

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new HttpError(400, "El cuerpo debe ser JSON válido.", {
          code: "INVALID_JSON",
        });
      }

      const normalized = normalizeLoginAttempt(body, deps.now);
      await deps.emitAuthLoginAttempt({
        request_id: requestId,
        user_id: normalized.userId,
        email_normalizado: normalized.email,
        provider: normalized.provider,
        outcome: normalized.outcome,
        timestamp: normalized.timestamp,
      });

      console.info("[auth-observer] Event captured", {
        request_id: requestId,
        outcome: normalized.outcome,
      });

      return new Response(JSON.stringify({ ok: true, request_id: requestId }), {
        status: 202,
        headers,
      });
    } catch (error) {
      const { status, body } = buildErrorResponse(error, requestId);
      return new Response(JSON.stringify(body), { status, headers });
    }
  };
}

const handler = buildAuthObserverHandler();

if (import.meta.main) {
  defaultDependencies.getAuthObserverToken();
  serve(handler);
}

export const __testing = {
  normalizeLoginAttempt,
  extractObserverToken,
};

export default handler;
