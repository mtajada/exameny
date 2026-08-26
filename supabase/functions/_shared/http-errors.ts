export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export const ADMIN_FORBIDDEN_COPY =
  "This action is only available to academy or platform administrators.";

export function buildAdminForbiddenError(details?: unknown): HttpError {
  return new HttpError(403, ADMIN_FORBIDDEN_COPY, details);
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError && typeof error.status === "number";
}

export interface PostgrestError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: string | number;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isPostgrestError(value: unknown): value is PostgrestError {
  if (!isPlainRecord(value)) {
    return false;
  }
  return "message" in value || "code" in value || "details" in value;
}

export function extractPostgrestErrorCode(
  error: PostgrestError,
): string | null {
  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (message.length > 0) {
    return message;
  }
  const code = typeof error.code === "string" ? error.code.trim() : "";
  return code.length > 0 ? code : null;
}

export function parseKeyValueDetail(
  detail: string | null | undefined,
): Record<string, string> {
  if (!detail || typeof detail !== "string") {
    return {};
  }
  return detail
    .split(/\s+/)
    .map((chunk) => chunk.split("="))
    .filter(([key, value]) => key.length > 0 && value !== undefined)
    .reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
      const key = rawKey.trim();
      const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
      if (key.length > 0 && value.length > 0) {
        acc[key] = value;
      }
      return acc;
    }, {});
}
