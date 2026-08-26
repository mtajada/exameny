import { HttpError } from "./http-errors.ts";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

type RateLimitKeyPart = string | number;

interface RateLimitBackend {
  increment(key: string, ttlMs: number, expiresAt: number): Promise<number>;
}

const RATE_LIMIT_NAMESPACE = "rate-limit";
const encoder = new TextEncoder();
const BASE64_PADDING_REGEX = /=+$/g;

interface UpstashPipelineEntry {
  result?: unknown;
  error?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractUpstashError(value: unknown): string | null {
  if (isRecord(value) && typeof value.error === "string") {
    const message = value.error.trim();
    return message.length > 0 ? message : null;
  }
  return null;
}

function normalizePipelineEntry(value: unknown): UpstashPipelineEntry {
  if (isRecord(value)) {
    const entry: UpstashPipelineEntry = {};
    if ("result" in value) {
      entry.result = value.result;
    }
    if ("error" in value) {
      const rawError = value.error;
      if (typeof rawError === "string") {
        entry.error = rawError.trim();
      } else if (rawError == null) {
        entry.error = null;
      }
    }
    return entry;
  }
  return { result: value };
}

function parsePipelineEntries(value: unknown): UpstashPipelineEntry[] {
  if (Array.isArray(value)) {
    return value.map(normalizePipelineEntry);
  }

  if (isRecord(value) && Array.isArray(value.result)) {
    return value.result.map(normalizePipelineEntry);
  }

  throw new Error("Upstash responded with unexpected pipeline payload");
}

class UpstashRedisBackend implements RateLimitBackend {
  private readonly pipelineUrl: string;
  private readonly authHeader: string;

  constructor(url: string, token: string) {
    const normalizedUrl = normalizeUpstashUrl(url);
    this.pipelineUrl = `${normalizedUrl}/pipeline`;
    this.authHeader = `Bearer ${token}`;
  }

  async increment(
    key: string,
    ttlMs: number,
    expiresAt: number,
  ): Promise<number> {
    const now = Date.now();
    const normalizedTtl = Math.max(ttlMs, 1);
    const remainingWindow = expiresAt - now;
    const ttl = Math.max(Math.min(remainingWindow, normalizedTtl), 1);
    const commands: Array<string[]> = [
      ["INCR", key],
      ["PEXPIRE", key, ttl.toString()],
    ];

    let response: Response;
    try {
      response = await fetch(this.pipelineUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify(commands),
      });
    } catch (error) {
      throw new Error(`Upstash request failed: ${(error as Error).message}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error(
        `Upstash returned invalid JSON (status ${response.status}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const errorMessage = extractUpstashError(body);
    if (!response.ok) {
      const message = errorMessage ?? `HTTP ${response.status}`;
      throw new Error(`Upstash error response: ${message}`);
    }

    const entries = parsePipelineEntries(body);
    if (entries.length === 0) {
      throw new Error("Upstash responded without command results");
    }

    const incrementEntry = entries[0];
    const commandError = incrementEntry.error;
    if (typeof commandError === "string" && commandError.length > 0) {
      throw new Error(`Upstash command error: ${commandError}`);
    }

    const incrementResult = incrementEntry.result;
    let hits: number;
    if (typeof incrementResult === "number") {
      hits = incrementResult;
    } else if (typeof incrementResult === "string") {
      hits = Number(incrementResult);
    } else {
      throw new Error("Upstash responded without a numeric counter value");
    }

    if (!Number.isFinite(hits)) {
      throw new Error("Upstash responded without a numeric counter value");
    }

    return hits;
  }
}

class InMemoryBackend implements RateLimitBackend {
  private readonly counters = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private lastCleanup = 0;
  private warned = false;

  constructor(private readonly warn: boolean) {}

  increment(key: string, ttlMs: number, expiresAt: number): Promise<number> {
    const now = Date.now();
    this.cleanup(now);
    this.emitWarningOnce();

    const normalizedTtl = Math.max(ttlMs, 1);
    const candidateExpiry = Math.min(expiresAt, now + normalizedTtl);
    const entryExpiresAt = Math.max(candidateExpiry, now + 1);

    const existing = this.counters.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: entryExpiresAt });
      return Promise.resolve(1);
    }

    const nextCount = existing.count + 1;
    existing.count = nextCount;
    existing.expiresAt = entryExpiresAt;
    return Promise.resolve(nextCount);
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanup < 30_000) {
      return;
    }
    this.lastCleanup = now;

    for (const [key, entry] of this.counters.entries()) {
      if (entry.expiresAt <= now) {
        this.counters.delete(key);
      }
    }
  }

  private emitWarningOnce(): void {
    if (this.warn && !this.warned) {
      this.warned = true;
      console.warn(
        "[rate-limit] Using in-memory rate limit backend. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production-safe throttling.",
      );
    }
  }
}

let backendInstance: RateLimitBackend | null = null;
let backendFailure: Error | null = null;

function toKeyPart(value: RateLimitKeyPart): string {
  return typeof value === "number" ? value.toString(10) : value;
}

function normalizeUpstashUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("https://")) {
    throw new Error("UPSTASH_REDIS_REST_URL must start with https://");
  }
  new URL(trimmed);
  return trimmed;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    BASE64_PADDING_REGEX,
    "",
  );
}

async function hashKeyParts(keyParts: string[]): Promise<string> {
  const input = encoder.encode(keyParts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return toBase64Url(digest);
}

function createBackend(): RateLimitBackend {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL")?.trim();
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN")?.trim();
  const fallbackExplicitlyEnabled =
    (Deno.env.get("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK") ?? "").trim()
      .toLowerCase() === "true";
  const fallbackEnabled = fallbackExplicitlyEnabled ||
    isLocalSupabaseUrl(Deno.env.get("SUPABASE_URL"));

  if (url && token) {
    return new UpstashRedisBackend(url, token);
  }

  if (fallbackEnabled) {
    return new InMemoryBackend(true);
  }

  throw new Error(
    "Rate limit backend not configured. Provide UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or set RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK=true for local development.",
  );
}

function isLocalSupabaseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" ||
      hostname === "::1";
  } catch (_error) {
    return false;
  }
}

function resolveBackend(): RateLimitBackend {
  if (backendInstance) {
    return backendInstance;
  }
  if (backendFailure) {
    throw backendFailure;
  }
  try {
    backendInstance = createBackend();
    return backendInstance;
  } catch (error) {
    backendFailure = error as Error;
    throw backendFailure;
  }
}

export async function enforceRateLimit(
  keyParts: Array<RateLimitKeyPart>,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const normalizedParts = keyParts.map(toKeyPart);
  const hashedKey = await hashKeyParts(normalizedParts);
  const windowStart = Math.floor(Date.now() / config.windowMs);
  const storageKey =
    `${RATE_LIMIT_NAMESPACE}:${config.windowMs}:${windowStart}:${hashedKey}`;
  const windowResetAt = (windowStart + 1) * config.windowMs;

  let backend: RateLimitBackend;
  try {
    backend = resolveBackend();
  } catch (_error) {
    console.error("[rate-limit] Backend unavailable");
    throw new HttpError(503, "Rate limiting unavailable at this time");
  }

  let hits: number;
  try {
    hits = await backend.increment(storageKey, config.windowMs, windowResetAt);
  } catch (_error) {
    console.error("[rate-limit] Storage failure");
    throw new HttpError(503, "Rate limiting unavailable at this time");
  }

  const remaining = Math.max(config.maxRequests - hits, 0);
  const allowed = hits <= config.maxRequests;

  return {
    allowed,
    remaining,
    resetAt: windowResetAt,
  };
}

export function assertRateLimit(result: RateLimitResult): void {
  if (!result.allowed) {
    throw new HttpError(
      429,
      `Rate limit exceeded. Try again after ${
        new Date(result.resetAt).toISOString()
      }`,
    );
  }
}

// Exposed for Deno tests to reset cached backend state between cases.
export function __resetRateLimitBackendForTests(): void {
  backendInstance = null;
  backendFailure = null;
}
