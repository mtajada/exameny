import type {
  OpenAIResponsesClient,
  ResponsesRequest,
  ResponsesResult,
} from "../_shared/openai-responses.ts";
import {
  CHAT_ASSISTANCE_SCHEMA,
  createChatAssistanceResponse,
  parseChatAssistancePayload,
} from "./ai.ts";

class CapturingClient implements OpenAIResponsesClient {
  request: ResponsesRequest<unknown> | null = null;

  constructor(private readonly result: ResponsesResult<unknown>) {}

  generate<T>(request: ResponsesRequest<T>): Promise<ResponsesResult<T>> {
    this.request = request as ResponsesRequest<unknown>;
    return Promise.resolve(this.result as ResponsesResult<T>);
  }
}

Deno.test("runtime parser accepts only one non-empty answer field", () => {
  assertEquals(parseChatAssistancePayload({ answer: "  Helpful hint.  " }), {
    answer: "Helpful hint.",
  });

  assertThrows(() => parseChatAssistancePayload({ answer: "" }));
  assertThrows(() => parseChatAssistancePayload({ answer: 42 }));
  assertThrows(() =>
    parseChatAssistancePayload({ answer: "Hint", unexpected: true })
  );
});

Deno.test("delegates to Responses with strict schema and bounded coaching settings", async () => {
  const client = new CapturingClient({
    kind: "completed",
    model: "gpt-5.6-luna",
    latencyMs: 12,
    usage: null,
    data: { answer: "Try checking the verb form." },
  });

  const result = await createChatAssistanceResponse({
    client,
    instructions: "safe coaching instructions",
    input: [{ role: "user", content: "untrusted learner data" }],
    maxOutputTokens: 420,
  });

  assertEquals(result.kind, "completed");
  assert(client.request !== null);
  assertEquals(client.request.schemaName, "exameny_chat_assistance");
  assertEquals(client.request.schema, CHAT_ASSISTANCE_SCHEMA);
  assertEquals(client.request.reasoningEffort, "low");
  assertEquals(client.request.maxOutputTokens, 420);
  assertEquals(client.request.instructions, "safe coaching instructions");
  assertEquals(client.request.parse({ answer: "  concise  " }), {
    answer: "concise",
  });
});

Deno.test("preserves every explicit non-completed Responses outcome", async () => {
  const outcomes: ResponsesResult<unknown>[] = [
    {
      kind: "incomplete",
      model: "gpt-5.6-luna",
      latencyMs: 1,
      usage: null,
      reason: "max_output_tokens",
    },
    {
      kind: "refusal",
      model: "gpt-5.6-luna",
      latencyMs: 1,
      usage: null,
    },
    {
      kind: "failed",
      model: "gpt-5.6-luna",
      latencyMs: 1,
      usage: null,
      code: "network_error",
      retryable: true,
      httpStatus: null,
    },
  ];

  for (const expected of outcomes) {
    const client = new CapturingClient(expected);
    const actual = await createChatAssistanceResponse({
      client,
      instructions: "instructions",
      input: [{ role: "user", content: "data" }],
      maxOutputTokens: 128,
    });
    assertEquals(actual.kind, expected.kind);
  }
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

function assertThrows(action: () => unknown): void {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, "Expected action to throw");
}
