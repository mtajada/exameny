import { HttpError } from "./http-errors.ts";

const LOCAL_RUNTIME_ORIGINS = new Set([
  "http://127.0.0.1:8080",
  "http://localhost:8080",
]);

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin.trim());
    const isWebOrigin = parsed.protocol === "http:" ||
      parsed.protocol === "https:";
    const hasOriginOnly = parsed.pathname === "/" && parsed.search === "" &&
      parsed.hash === "";
    const hasNoCredentials = parsed.username === "" && parsed.password === "";

    if (
      !isWebOrigin || !hasOriginOnly || !hasNoCredentials ||
      parsed.origin === "null"
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function getEnvOptional(key: string): string | undefined {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function isLocalRuntime(): boolean {
  const supabaseUrl = getEnvOptional("SUPABASE_URL");
  if (!supabaseUrl) {
    return false;
  }

  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname === "[::1]";
  } catch {
    return false;
  }
}

function resolveAllowedOrigins(): Set<string> {
  const raw = getEnvOptional("ALLOWED_ORIGINS")?.split(",") ?? [];
  const configured = raw
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);

  if (configured.length > 0) {
    return new Set(configured);
  }

  // The local fallback is deliberately finite. Hosted deployments must set
  // ALLOWED_ORIGINS and never fall back to a wildcard.
  return isLocalRuntime() ? new Set(LOCAL_RUNTIME_ORIGINS) : new Set();
}

function baseHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-token, x-request-id",
    "Vary": "Origin",
  };
}

function isOriginAllowed(
  origin: string | null,
  allowedOrigins: Set<string>,
): boolean {
  if (!origin) {
    return false;
  }
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedOrigins.has(normalized);
}

function ensureAllowedOrigin(request: Request): void {
  const allowedOrigins = resolveAllowedOrigins();
  const origin = request.headers.get("origin") ?? request.headers.get("Origin");
  if (!isOriginAllowed(origin, allowedOrigins)) {
    throw new HttpError(403, "Origin is not allowed");
  }
}

function createCorsHeaders(request: Request): Record<string, string> {
  const allowedOrigins = resolveAllowedOrigins();
  const headers = baseHeaders();
  const origin = request.headers.get("origin") ??
    request.headers.get("Origin") ?? null;
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers["Access-Control-Allow-Origin"] = normalizeOrigin(origin) ?? origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export { createCorsHeaders, ensureAllowedOrigin };
