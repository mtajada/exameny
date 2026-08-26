import {
  createOpenAIResponsesClient,
  type FetchLike,
  type ResponsesObservation,
  type ResponsesRequest,
  type StrictJsonSchema,
} from "../_shared/openai-responses.ts";

const TEST_SCHEMA: StrictJsonSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

interface TestPayload {
  readonly answer: string;
}

function parseTestPayload(value: unknown): TestPayload {
  if (!isRecord(value) || typeof value.answer !== "string") {
    throw new Error("Invalid test payload");
  }
  return { answer: value.answer };
}

function request(
  input = "private-input-marker",
): ResponsesRequest<TestPayload> {
  return {
    input,
    instructions: "private-instructions-marker",
    schemaName: "test_payload",
    schema: TEST_SCHEMA,
    parse: parseTestPayload,
    reasoningEffort: "low",
    maxOutputTokens: 256,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function responsePayload(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    id: "resp_must_not_escape",
    status: "completed",
    output: [
      {
        id: "msg_must_not_escape",
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({ answer: "ok" }),
        }],
      },
    ],
    usage: {
      input_tokens: 11,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 18,
    },
    ...overrides,
  };
}

Deno.test("completed: sends Luna, store=false, strict schema and returns parsed data", async () => {
  let sentBody: unknown = null;
  let sentAuthorization = "";
  let observation: ResponsesObservation | null = null;
  const fetchImpl: FetchLike = (_input, init) => {
    sentAuthorization = new Headers(init.headers).get("Authorization") ?? "";
    sentBody = typeof init.body === "string" ? JSON.parse(init.body) : null;
    return Promise.resolve(jsonResponse(responsePayload()));
  };
  const client = createOpenAIResponsesClient(
    { apiKey: "synthetic-test-key", observe: (event) => observation = event },
    { fetch: fetchImpl },
  );

  const result = await client.generate(request());

  assertEquals(result.kind, "completed");
  if (result.kind !== "completed") throw new Error("Expected completed");
  assertEquals(result.data, { answer: "ok" });
  assertEquals(result.usage?.totalTokens, 18);
  assert(isRecord(sentBody));
  assertEquals(sentBody.model, "gpt-5.6-luna");
  assertEquals(sentBody.store, false);
  assert(isRecord(sentBody.text) && isRecord(sentBody.text.format));
  assertEquals(sentBody.text.format.strict, true);
  assertEquals(sentAuthorization, "Bearer synthetic-test-key");

  const observationJson = JSON.stringify(observation);
  for (
    const forbidden of [
      "private-input-marker",
      "private-instructions-marker",
      "synthetic-test-key",
      "resp_must_not_escape",
      "msg_must_not_escape",
      '"answer":"ok"',
    ]
  ) {
    assert(
      !observationJson.includes(forbidden),
      `Observer leaked ${forbidden}`,
    );
  }
});

Deno.test("multimodal: forwards a bounded image input through Responses", async () => {
  let sentBody: unknown = null;
  const fetchImpl: FetchLike = (_input, init) => {
    sentBody = typeof init.body === "string" ? JSON.parse(init.body) : null;
    return Promise.resolve(jsonResponse(responsePayload()));
  };
  const client = createOpenAIResponsesClient(
    { apiKey: "synthetic-test-key" },
    { fetch: fetchImpl },
  );

  const result = await client.generate({
    ...request(),
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "Extract the task" },
        {
          type: "input_image",
          image_url: "data:image/png;base64,c3ludGhldGlj",
          detail: "high",
        },
      ],
    }],
  });

  assertEquals(result.kind, "completed");
  assert(isRecord(sentBody));
  assert(Array.isArray(sentBody.input));
  assertEquals(sentBody.store, false);
});

Deno.test("incomplete: exposes normalized reason and usage without parsing partial output", async () => {
  const fetchImpl: FetchLike = () =>
    Promise.resolve(jsonResponse(responsePayload({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    })));
  const client = createOpenAIResponsesClient({ apiKey: "synthetic" }, {
    fetch: fetchImpl,
  });

  const result = await client.generate(request());

  assertEquals(result.kind, "incomplete");
  if (result.kind !== "incomplete") throw new Error("Expected incomplete");
  assertEquals(result.reason, "max_output_tokens");
  assertEquals(result.usage?.inputTokens, 11);
});

Deno.test("failed: classifies provider terminal failure without returning provider text or IDs", async () => {
  const fetchImpl: FetchLike = () =>
    Promise.resolve(jsonResponse(responsePayload({
      status: "failed",
      error: { code: "server_error", message: "private provider detail" },
      output: [],
    })));
  const client = createOpenAIResponsesClient({ apiKey: "synthetic" }, {
    fetch: fetchImpl,
  });

  const result = await client.generate(request());

  assertEquals(result.kind, "failed");
  if (result.kind !== "failed") throw new Error("Expected failed");
  assertEquals(result.code, "provider_failed");
  assertEquals(result.retryable, true);
  assert(!JSON.stringify(result).includes("private provider detail"));
  assert(!JSON.stringify(result).includes("resp_must_not_escape"));
});

Deno.test("refusal: classifies refusal before attempting JSON parsing", async () => {
  const fetchImpl: FetchLike = () =>
    Promise.resolve(jsonResponse(responsePayload({
      output: [{
        id: "msg_refusal",
        type: "message",
        content: [{ type: "refusal", refusal: "private refusal text" }],
      }],
    })));
  const client = createOpenAIResponsesClient({ apiKey: "synthetic" }, {
    fetch: fetchImpl,
  });

  const result = await client.generate(request());

  assertEquals(result.kind, "refusal");
  assert(!JSON.stringify(result).includes("private refusal text"));
});

Deno.test("empty: completed response without text becomes an explicit failure", async () => {
  const fetchImpl: FetchLike = () =>
    Promise.resolve(jsonResponse(responsePayload({ output: [] })));
  const client = createOpenAIResponsesClient({ apiKey: "synthetic" }, {
    fetch: fetchImpl,
  });

  const result = await client.generate(request());

  assertEquals(result.kind, "failed");
  if (result.kind !== "failed") throw new Error("Expected failed");
  assertEquals(result.code, "empty_output");
});

Deno.test("429: classifies rate limiting as retryable and does not consume the response body", async () => {
  const fetchImpl: FetchLike = () =>
    Promise.resolve(jsonResponse(
      { error: { message: "private rate-limit body" } },
      429,
    ));
  const client = createOpenAIResponsesClient({ apiKey: "synthetic" }, {
    fetch: fetchImpl,
  });

  const result = await client.generate(request());

  assertEquals(result.kind, "failed");
  if (result.kind !== "failed") throw new Error("Expected failed");
  assertEquals(result.code, "rate_limited");
  assertEquals(result.retryable, true);
  assertEquals(result.httpStatus, 429);
  assert(!JSON.stringify(result).includes("private rate-limit body"));
});

Deno.test("timeout: aborts the request and returns a retryable timeout failure", async () => {
  const fetchImpl: FetchLike = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  const client = createOpenAIResponsesClient(
    { apiKey: "synthetic", timeoutMs: 5 },
    { fetch: fetchImpl },
  );

  const result = await client.generate(request());

  assertEquals(result.kind, "failed");
  if (result.kind !== "failed") throw new Error("Expected failed");
  assertEquals(result.code, "timeout");
  assertEquals(result.retryable, true);
});

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
