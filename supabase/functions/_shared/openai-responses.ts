/**
 * Server-side-only adapter for Exameny's OpenAI Responses API integration.
 *
 * Privacy invariant: this module never logs prompts, outputs, API response IDs,
 * or the API key. Its optional observer receives only bounded operational data.
 */

export const OPENAI_RESPONSES_MODEL = "gpt-5.6-luna" as const;

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 120_000;

export type ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";
export type ResponseInputRole = "developer" | "system" | "user" | "assistant";

export type ResponseInputContentPart =
  | { readonly type: "input_text"; readonly text: string }
  | {
    readonly type: "input_image";
    readonly image_url: string;
    readonly detail?: "low" | "high" | "auto" | "original";
  };

export interface ResponseInputMessage {
  readonly role: ResponseInputRole;
  readonly content: string | readonly ResponseInputContentPart[];
}

export type ResponseInput = string | readonly ResponseInputMessage[];

/**
 * Structured Outputs requires a top-level object, every property to be listed
 * in `required`, and `additionalProperties: false` on every object node.
 */
export interface StrictJsonSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
  readonly description?: string;
}

export interface ResponsesRequest<T> {
  readonly input: ResponseInput;
  readonly instructions?: string;
  readonly schemaName: string;
  readonly schema: StrictJsonSchema;
  /** Runtime validation at the untrusted network boundary. */
  readonly parse: (value: unknown) => T;
  readonly reasoningEffort?: ReasoningEffort;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

interface ResultBase {
  readonly model: typeof OPENAI_RESPONSES_MODEL;
  readonly latencyMs: number;
  readonly usage: TokenUsage | null;
}

export interface CompletedResult<T> extends ResultBase {
  readonly kind: "completed";
  readonly data: T;
}

export type IncompleteReason =
  | "max_output_tokens"
  | "content_filter"
  | "unknown";

export interface IncompleteResult extends ResultBase {
  readonly kind: "incomplete";
  readonly reason: IncompleteReason;
}

export interface RefusalResult extends ResultBase {
  readonly kind: "refusal";
}

export type FailureCode =
  | "aborted"
  | "authentication_error"
  | "empty_output"
  | "invalid_json"
  | "invalid_provider_response"
  | "network_error"
  | "provider_failed"
  | "provider_http_error"
  | "rate_limited"
  | "request_rejected"
  | "schema_validation_failed"
  | "timeout"
  | "unexpected_status";

export interface FailedResult extends ResultBase {
  readonly kind: "failed";
  readonly code: FailureCode;
  readonly retryable: boolean;
  readonly httpStatus: number | null;
}

export type ResponsesResult<T> =
  | CompletedResult<T>
  | IncompleteResult
  | RefusalResult
  | FailedResult;

export interface ResponsesObservation {
  readonly type: "openai.responses.finished";
  readonly model: typeof OPENAI_RESPONSES_MODEL;
  readonly outcome: ResponsesResult<unknown>["kind"];
  readonly latencyMs: number;
  readonly usage: TokenUsage | null;
  readonly httpStatus: number | null;
  readonly failureCode: FailureCode | null;
}

export interface OpenAIResponsesClientConfig {
  /** Must come from a server-side secret store, never a VITE_ variable. */
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly observe?: (observation: ResponsesObservation) => void;
}

export interface EnvReader {
  get(name: string): string | undefined;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface OpenAIResponsesDependencies {
  /** Test seam. Production should use the default global fetch. */
  readonly fetch?: FetchLike;
  readonly now?: () => number;
}

export interface OpenAIResponsesClient {
  generate<T>(request: ResponsesRequest<T>): Promise<ResponsesResult<T>>;
}

export function createOpenAIResponsesClientFromEnv(
  env: EnvReader = Deno.env,
  overrides: Omit<OpenAIResponsesClientConfig, "apiKey"> = {},
  dependencies: OpenAIResponsesDependencies = {},
): OpenAIResponsesClient {
  const apiKey = env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in the server environment");
  }
  return createOpenAIResponsesClient({ ...overrides, apiKey }, dependencies);
}

export function createOpenAIResponsesClient(
  config: OpenAIResponsesClientConfig,
  dependencies: OpenAIResponsesDependencies = {},
): OpenAIResponsesClient {
  if (!config.apiKey.trim()) {
    throw new Error("A non-empty server-side API key is required");
  }

  const defaultTimeoutMs = normalizeTimeout(
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = dependencies.fetch ?? ((input, init) => fetch(input, init));
  const now = dependencies.now ?? (() => performance.now());

  return {
    async generate<T>(
      request: ResponsesRequest<T>,
    ): Promise<ResponsesResult<T>> {
      validateRequest(request);
      const startedAt = now();
      const timeoutMs = normalizeTimeout(request.timeoutMs ?? defaultTimeoutMs);
      const abortController = new AbortController();
      let timedOut = false;
      let callerAborted = request.signal?.aborted ?? false;
      let httpStatus: number | null = null;

      const onCallerAbort = (): void => {
        callerAborted = true;
        abortController.abort();
      };

      if (request.signal) {
        request.signal.addEventListener("abort", onCallerAbort, { once: true });
      }
      if (callerAborted) {
        abortController.abort();
      }

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, timeoutMs);

      const finish = (result: ResponsesResult<T>): ResponsesResult<T> => {
        emitObservation(config.observe, result, httpStatus);
        return result;
      };

      try {
        const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildRequestBody(request)),
          signal: abortController.signal,
        });
        httpStatus = response.status;

        if (!response.ok) {
          return finish(
            failedFromHttpStatus(response.status, elapsedMs(startedAt, now)),
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return finish(
            failed(
              "invalid_provider_response",
              false,
              elapsedMs(startedAt, now),
              null,
              response.status,
            ),
          );
        }

        return finish(
          classifyPayload(
            payload,
            request.parse,
            elapsedMs(startedAt, now),
            response.status,
          ),
        );
      } catch {
        const latencyMs = elapsedMs(startedAt, now);
        if (timedOut) {
          return finish(failed("timeout", true, latencyMs, null, httpStatus));
        }
        if (callerAborted) {
          return finish(failed("aborted", false, latencyMs, null, httpStatus));
        }
        return finish(
          failed("network_error", true, latencyMs, null, httpStatus),
        );
      } finally {
        clearTimeout(timeoutHandle);
        request.signal?.removeEventListener("abort", onCallerAbort);
      }
    },
  };
}

function buildRequestBody<T>(
  request: ResponsesRequest<T>,
): Readonly<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model: OPENAI_RESPONSES_MODEL,
    store: false,
    input: request.input,
    text: {
      format: {
        type: "json_schema",
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
  };

  if (request.instructions !== undefined) {
    body.instructions = request.instructions;
  }
  if (request.reasoningEffort !== undefined) {
    body.reasoning = { effort: request.reasoningEffort };
  }
  if (request.maxOutputTokens !== undefined) {
    body.max_output_tokens = request.maxOutputTokens;
  }
  return body;
}

function classifyPayload<T>(
  payload: unknown,
  parse: (value: unknown) => T,
  latencyMs: number,
  httpStatus: number,
): ResponsesResult<T> {
  if (!isRecord(payload) || typeof payload.status !== "string") {
    return failed(
      "invalid_provider_response",
      false,
      latencyMs,
      readUsage(payload),
      httpStatus,
    );
  }

  const usage = readUsage(payload.usage);
  if (payload.status === "incomplete") {
    return {
      kind: "incomplete",
      model: OPENAI_RESPONSES_MODEL,
      latencyMs,
      usage,
      reason: readIncompleteReason(payload.incomplete_details),
    };
  }

  if (payload.status === "failed") {
    return failed("provider_failed", true, latencyMs, usage, httpStatus);
  }

  if (payload.status !== "completed") {
    return failed("unexpected_status", false, latencyMs, usage, httpStatus);
  }

  if (containsRefusal(payload.output)) {
    return { kind: "refusal", model: OPENAI_RESPONSES_MODEL, latencyMs, usage };
  }

  const outputText = readOutputText(payload);
  if (!outputText) {
    return failed("empty_output", false, latencyMs, usage, httpStatus);
  }

  let json: unknown;
  try {
    json = JSON.parse(outputText);
  } catch {
    return failed("invalid_json", false, latencyMs, usage, httpStatus);
  }

  try {
    return {
      kind: "completed",
      model: OPENAI_RESPONSES_MODEL,
      latencyMs,
      usage,
      data: parse(json),
    };
  } catch {
    return failed(
      "schema_validation_failed",
      false,
      latencyMs,
      usage,
      httpStatus,
    );
  }
}

function readOutputText(
  payload: Readonly<Record<string, unknown>>,
): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  if (!Array.isArray(payload.output)) {
    return null;
  }

  const chunks: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        isRecord(content) && content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        chunks.push(content.text);
      }
    }
  }
  const combined = chunks.join("").trim();
  return combined || null;
}

function containsRefusal(output: unknown): boolean {
  if (!Array.isArray(output)) return false;
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "refusal") {
        return true;
      }
    }
  }
  return false;
}

function readIncompleteReason(value: unknown): IncompleteReason {
  if (!isRecord(value) || typeof value.reason !== "string") return "unknown";
  if (
    value.reason === "max_output_tokens" || value.reason === "content_filter"
  ) {
    return value.reason;
  }
  return "unknown";
}

function readUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = readNonNegativeInteger(value.input_tokens);
  const outputTokens = readNonNegativeInteger(value.output_tokens);
  const totalTokens = readNonNegativeInteger(value.total_tokens);
  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    return null;
  }

  const cachedInputTokens = isRecord(value.input_tokens_details)
    ? readNonNegativeInteger(value.input_tokens_details.cached_tokens) ?? 0
    : 0;
  const reasoningTokens = isRecord(value.output_tokens_details)
    ? readNonNegativeInteger(value.output_tokens_details.reasoning_tokens) ?? 0
    : 0;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
}

function failedFromHttpStatus(status: number, latencyMs: number): FailedResult {
  if (status === 429) {
    return failed("rate_limited", true, latencyMs, null, status);
  }
  if (status === 401 || status === 403) {
    return failed("authentication_error", false, latencyMs, null, status);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return failed("request_rejected", false, latencyMs, null, status);
  }
  if (status === 408 || status >= 500) {
    return failed("provider_http_error", true, latencyMs, null, status);
  }
  return failed("provider_http_error", false, latencyMs, null, status);
}

function failed(
  code: FailureCode,
  retryable: boolean,
  latencyMs: number,
  usage: TokenUsage | null,
  httpStatus: number | null,
): FailedResult {
  return {
    kind: "failed",
    model: OPENAI_RESPONSES_MODEL,
    latencyMs,
    usage,
    code,
    retryable,
    httpStatus,
  };
}

function emitObservation<T>(
  observer: OpenAIResponsesClientConfig["observe"],
  result: ResponsesResult<T>,
  httpStatus: number | null,
): void {
  if (!observer) return;
  try {
    observer({
      type: "openai.responses.finished",
      model: OPENAI_RESPONSES_MODEL,
      outcome: result.kind,
      latencyMs: result.latencyMs,
      usage: result.usage,
      httpStatus,
      failureCode: result.kind === "failed" ? result.code : null,
    });
  } catch {
    // Observability must never change the user-visible result.
  }
}

function validateRequest<T>(request: ResponsesRequest<T>): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(request.schemaName)) {
    throw new Error(
      "schemaName must contain 1-64 ASCII letters, digits, underscores, or hyphens",
    );
  }
  if (request.maxOutputTokens !== undefined) {
    if (
      !Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0
    ) {
      throw new Error("maxOutputTokens must be a positive integer");
    }
  }
  validateStrictSchemaNode(request.schema);
}

function validateStrictSchemaNode(node: unknown): void {
  if (!isRecord(node)) return;

  if (node.type === "object") {
    if (
      !isRecord(node.properties) || node.additionalProperties !== false ||
      !Array.isArray(node.required)
    ) {
      throw new Error(
        "Every object schema must define properties, required, and additionalProperties=false",
      );
    }
    const required = node.required;
    if (!required.every((entry) => typeof entry === "string")) {
      throw new Error("Every object schema property must be required");
    }
    const propertyNames = Object.keys(node.properties);
    const requiredNames = new Set(required);
    if (
      propertyNames.length !== requiredNames.size ||
      propertyNames.some((name) => !requiredNames.has(name))
    ) {
      throw new Error("Every object schema property must be required");
    }
    for (const property of Object.values(node.properties)) {
      validateStrictSchemaNode(property);
    }
  }

  if (node.type === "array") {
    validateStrictSchemaNode(node.items);
  }

  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const variants = node[keyword];
    if (Array.isArray(variants)) {
      for (const variant of variants) validateStrictSchemaNode(variant);
    }
  }
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}`);
  }
  return Math.round(value);
}

function elapsedMs(startedAt: number, now: () => number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
