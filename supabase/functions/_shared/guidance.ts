const CONTROL_CHAR_RANGE =
  "\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F";
export const CONTROL_CHAR_REGEX = new RegExp(`[${CONTROL_CHAR_RANGE}]`, "g");

export const DEFAULT_MAX_GUIDANCE_LENGTH = 450;

export interface GuidanceSanitization {
  value: string | null;
  hadInput: boolean;
  rawLength: number;
  trimmedLength: number;
  removedControlCharacters: boolean;
}

export interface GuidanceAssessment {
  sanitized: GuidanceSanitization;
  isValid: boolean;
  errorCode?: "empty_after_trim" | "too_long";
  errorMessage?: string;
}

export function sanitizeGuidance(raw: unknown): GuidanceSanitization {
  if (typeof raw !== "string") {
    return {
      value: null,
      hadInput: false,
      rawLength: 0,
      trimmedLength: 0,
      removedControlCharacters: false,
    };
  }

  const rawLength = raw.length;
  const stripped = raw.replace(CONTROL_CHAR_REGEX, "");
  const removedChars = stripped.length !== rawLength;
  const trimmed = stripped.trim();

  return {
    value: trimmed.length > 0 ? trimmed : null,
    hadInput: rawLength > 0,
    rawLength,
    trimmedLength: trimmed.length,
    removedControlCharacters: removedChars,
  };
}

export function assessGuidance(
  raw: unknown,
  maxLength = DEFAULT_MAX_GUIDANCE_LENGTH,
): GuidanceAssessment {
  const sanitized = sanitizeGuidance(raw);

  if (sanitized.hadInput && sanitized.trimmedLength === 0) {
    return {
      sanitized,
      isValid: false,
      errorCode: "empty_after_trim",
      errorMessage: "Guidance must include visible characters.",
    };
  }

  if (sanitized.trimmedLength > maxLength) {
    return {
      sanitized,
      isValid: false,
      errorCode: "too_long",
      errorMessage: `Guidance exceeds ${maxLength} characters.`,
    };
  }

  return {
    sanitized,
    isValid: true,
  };
}

export async function hashGuidance(value: string, bytes = 16): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const view = new Uint8Array(buffer).slice(0, bytes);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function guidanceToLogString(result: GuidanceAssessment): string {
  const parts: string[] = [];
  parts.push(`length=${result.sanitized.trimmedLength}`);
  if (result.sanitized.removedControlCharacters) {
    parts.push("sanitized");
  }
  if (result.errorCode) {
    parts.push(`error=${result.errorCode}`);
  }
  return parts.join(" ");
}
