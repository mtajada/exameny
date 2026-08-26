const MAX_HEADER_VALUE_LENGTH = 256;
export const UNKNOWN_IP_RATE_LIMIT_KEY = "unknown";

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const segment = Number(part);
    if (!Number.isInteger(segment) || segment < 0 || segment > 255) {
      return false;
    }
  }

  return true;
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(":")) return false;

  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_HEADER_VALUE_LENGTH) return null;

  let candidate = trimmed.replace(/^"+|"+$/g, "");
  if (!candidate) return null;

  if (candidate.toLowerCase() === "unknown") return null;

  if (candidate.startsWith("[")) {
    const closeIndex = candidate.indexOf("]");
    if (closeIndex > 0) {
      candidate = candidate.slice(1, closeIndex);
    }
  } else if (candidate.includes(".") && candidate.includes(":")) {
    const lastColonIndex = candidate.lastIndexOf(":");
    if (lastColonIndex > 0 && lastColonIndex < candidate.length - 1) {
      const maybeIpv4 = candidate.slice(0, lastColonIndex);
      const maybePort = candidate.slice(lastColonIndex + 1);
      if (/^\d{1,5}$/.test(maybePort) && isValidIpv4(maybeIpv4)) {
        candidate = maybeIpv4;
      }
    }
  }

  if (isValidIpv4(candidate) || isValidIpv6(candidate)) {
    return candidate;
  }

  return null;
}

function parseXForwardedFor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_HEADER_VALUE_LENGTH) return null;

  let cursor = 0;
  while (cursor < trimmed.length) {
    const commaIndex = trimmed.indexOf(",", cursor);
    const token = (commaIndex === -1
      ? trimmed.slice(cursor)
      : trimmed.slice(cursor, commaIndex)).trim();
    const candidate = normalizeCandidate(token);
    if (candidate) {
      return candidate;
    }
    if (commaIndex === -1) {
      break;
    }
    cursor = commaIndex + 1;
  }

  return null;
}

function parseForwarded(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_HEADER_VALUE_LENGTH) return null;

  const match = trimmed.match(/(?:^|[,;])\s*for=("[^"]+"|[^;,\s]+)/i);
  if (!match) return null;

  return normalizeCandidate(match[1] ?? "");
}

export function resolveBestEffortClientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    const candidate = normalizeCandidate(cfConnectingIp);
    if (candidate) return candidate;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const candidate = normalizeCandidate(realIp);
    if (candidate) return candidate;
  }

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const candidate = parseXForwardedFor(xForwardedFor);
    if (candidate) return candidate;
  }

  const forwarded = headers.get("forwarded");
  if (forwarded) {
    const candidate = parseForwarded(forwarded);
    if (candidate) return candidate;
  }

  return null;
}

export function resolveClientIpRateLimitKey(headers: Headers): string {
  return resolveBestEffortClientIp(headers) ?? UNKNOWN_IP_RATE_LIMIT_KEY;
}
