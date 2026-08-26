import { isHttpError } from "./http-errors.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const looksLikeSqlState = (code: string): boolean => {
  if (code.length !== 5) {
    return false;
  }
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    return false;
  }
  return true;
};

export const isSafePublicErrorCode = (value: string): boolean => {
  const code = value.trim();
  if (!code || code.length > 80) {
    return false;
  }
  if (!/^[A-Z0-9_]+$/.test(code)) {
    return false;
  }
  if (/^\d{5}$/.test(code)) {
    return false;
  }
  if (looksLikeSqlState(code) && /\d/.test(code) && !code.includes("_")) {
    return false;
  }
  if (code.startsWith("PGRST")) {
    return false;
  }
  return true;
};

export function extractPublicErrorCode(details: unknown): string | null {
  if (!isPlainRecord(details)) {
    return null;
  }
  const raw = details.code;
  if (typeof raw !== "string") {
    return null;
  }
  const code = raw.trim();
  return isSafePublicErrorCode(code) ? code : null;
}

export function extractPublicErrorDetails(
  details: unknown,
  allowlist: string[],
): Record<string, unknown> | null {
  if (!isPlainRecord(details) || allowlist.length === 0) {
    return null;
  }
  const output: Record<string, unknown> = {};
  for (const key of allowlist) {
    if (key in details) {
      output[key] = details[key];
    }
  }
  return Object.keys(output).length > 0 ? output : null;
}

export function buildPublicErrorPayload(
  requestId: string,
  error: unknown,
  options?: {
    fallbackError?: string;
    statusOverride?: number;
    detailsAllowlist?: string[];
  },
): { status: number; body: Record<string, unknown> } {
  const fallbackError = options?.fallbackError ?? "Internal server error";
  const detailsAllowlist = options?.detailsAllowlist ?? [];

  if (isHttpError(error)) {
    const body: Record<string, unknown> = {
      request_id: requestId,
      error: error.message,
    };

    const code = extractPublicErrorCode(error.details);
    if (code) {
      body.code = code;
    }

    const safeDetails = extractPublicErrorDetails(
      error.details,
      detailsAllowlist,
    );
    if (safeDetails) {
      body.details = safeDetails;
    }

    return { status: options?.statusOverride ?? error.status, body };
  }

  return {
    status: options?.statusOverride ?? 500,
    body: { request_id: requestId, error: fallbackError },
  };
}
