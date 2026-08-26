import {
  extractPostgrestErrorCode,
  isPostgrestError,
  type PostgrestError,
} from "./http-errors.ts";

const MANUAL_INTERVENTION_CODE = "MANUAL_INTERVENTION_REQUIRED";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseDetailsPayload = (details: unknown): unknown => {
  if (typeof details !== "string") {
    return details ?? null;
  }

  const trimmed = details.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
};

/**
 * Builds the HTTP 409 response mandated by the spec when the RPC returns MANUAL_INTERVENTION_REQUIRED.
 * Returns null when the error does not match the manual intervention pattern.
 */
export function tryBuildManualInterventionResponse(
  error: unknown,
  requestId: string,
  headers: Record<string, string>,
  extras?: Record<string, unknown>,
): Response | null {
  if (!isPostgrestError(error)) {
    return null;
  }

  if (extractPostgrestErrorCode(error) !== MANUAL_INTERVENTION_CODE) {
    return null;
  }

  const payload = parseDetailsPayload((error as PostgrestError).details);
  const additional: Record<string, unknown> | undefined = extras
    ? { ...extras }
    : undefined;
  if (additional && "request_id" in additional) {
    delete additional.request_id;
  }

  if (!isPlainObject(payload)) {
    console.error("[manual-intervention] invalid_details_payload", {
      request_id: requestId,
    });
  }

  const manualBody = isPlainObject(payload)
    ? { ...payload, request_id: requestId }
    : {
      request_id: requestId,
      code: MANUAL_INTERVENTION_CODE,
      error: MANUAL_INTERVENTION_CODE,
      details: null,
    };
  const body = additional ? { ...additional, ...manualBody } : manualBody;

  return new Response(JSON.stringify(body), { status: 409, headers });
}
