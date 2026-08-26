import {
  createOpenAIResponsesClientFromEnv,
  type StrictJsonSchema,
} from "../supabase/functions/_shared/openai-responses.ts";

const CONFIRMATION = "--confirm-live-adapter-smoke";

interface SmokePayload {
  readonly ok: boolean;
}

const smokeSchema: StrictJsonSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
  required: ["ok"],
  additionalProperties: false,
  description: "Minimal acknowledgement for the Exameny Responses adapter",
};

function parseSmokePayload(value: unknown): SmokePayload {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("The smoke response did not match the expected contract");
  }

  const ok = Reflect.get(value, "ok");
  if (Object.keys(value).length !== 1 || typeof ok !== "boolean") {
    throw new Error("The smoke response did not match the expected contract");
  }

  return { ok };
}

if (!Deno.args.includes(CONFIRMATION)) {
  console.error(
    `Live adapter smoke not run. Pass ${CONFIRMATION} to authorise one bounded API request.`,
  );
  Deno.exit(2);
}

const client = createOpenAIResponsesClientFromEnv(Deno.env, {
  timeoutMs: 45_000,
});

const result = await client.generate({
  instructions: "Return the structured acknowledgement only.",
  input: "Set ok to true.",
  schemaName: "exameny_adapter_smoke",
  schema: smokeSchema,
  parse: parseSmokePayload,
  reasoningEffort: "none",
  maxOutputTokens: 64,
});

const verified = result.kind === "completed" && result.data.ok === true;
const summary: Record<string, unknown> = {
  status: verified ? "passed" : "failed",
  outcome: result.kind,
  model: result.model,
  latencyMs: result.latencyMs,
  usage: result.usage,
};

if (result.kind === "failed") summary.failureCode = result.code;
if (result.kind === "incomplete") summary.incompleteReason = result.reason;

console.log(JSON.stringify(summary));
if (!verified) Deno.exit(1);
