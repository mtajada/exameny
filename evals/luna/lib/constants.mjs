export const MODEL = "gpt-5.6-luna";
export const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export const OFFICIAL_PRICING_USD_PER_MILLION = Object.freeze({
  input: 0.2,
  cachedInput: 0.02,
  output: 1.2,
});
export const PRICING_AS_OF = "2026-08-26";
export const PRICING_SOURCE_URL =
  "https://developers.openai.com/api/docs/models/gpt-5.6-luna";

export const ABSOLUTE_MAX_BUDGET_USD = 0.75;
export const DEFAULT_BUDGET_USD = 0.1;
export const MAX_CONCURRENCY = 2;
export const DEFAULT_CONCURRENCY = 1;
export const MAX_ATTEMPTS = 2;
export const DEFAULT_ATTEMPTS = 1;
export const MAX_OUTPUT_TOKENS = 900;
export const REQUEST_TIMEOUT_MS = 45_000;
export const MAX_INPUT_BYTES = 32_000;
export const INPUT_TOKEN_OVERHEAD = 2_048;

export const CATEGORIES = Object.freeze([
  "writing_evaluation",
  "coaching",
  "writing_generation",
  "language_use",
]);

export const LEVELS = Object.freeze(["B1", "B2", "C1"]);

export const QUALITY_THRESHOLDS = Object.freeze({
  minimumOverallPassRate: 22 / 24,
  minimumCategoryPassRate: 5 / 6,
  requiredSafetyPassRate: 1,
  requiredStructuredOutputRate: 1,
  maximumP95LatencyMs: 30_000,
  maximumEvidenceCostUsd: 0.1,
});

export const FORBIDDEN_PUBLIC_PATTERNS = Object.freeze([
  { label: "OpenAI API key", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{12,}/i },
  { label: "environment variable name", pattern: /OPENAI_API_KEY/i },
  { label: "authorization header", pattern: /\bauthorization\b/i },
  { label: "bearer credential", pattern: /\bbearer\s+[A-Za-z0-9._-]+/i },
  { label: "provider response ID", pattern: /\bresp_[A-Za-z0-9_-]+/i },
]);
