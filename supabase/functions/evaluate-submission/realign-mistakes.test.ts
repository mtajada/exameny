import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "std/testing/asserts.ts";
import {
  OPENAI_RESPONSES_MODEL,
  type OpenAIResponsesClient,
  type ResponsesRequest,
  type ResponsesResult,
} from "../_shared/openai-responses.ts";
import type { NormalizedMistakeItem } from "../_shared/mistakes.ts";
import { realignMistakeSpans } from "./realign-mistakes.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getAnchorMeta = (
  meta: Record<string, unknown>,
): Record<string, unknown> | undefined =>
  isPlainRecord(meta["anchor_text_adjustment"])
    ? meta["anchor_text_adjustment"]
    : undefined;

function createStubClient(payload: unknown): OpenAIResponsesClient {
  return {
    // deno-lint-ignore require-await
    async generate<T>(
      request: ResponsesRequest<T>,
    ): Promise<ResponsesResult<T>> {
      return {
        kind: "completed",
        data: request.parse(payload),
        model: OPENAI_RESPONSES_MODEL,
        latencyMs: 12,
        usage: null,
      };
    },
  };
}

function createOutcomeClient(
  outcome: Exclude<ResponsesResult<never>, { kind: "completed" }>,
): OpenAIResponsesClient {
  return {
    // deno-lint-ignore require-await
    async generate<T>(
      _request: ResponsesRequest<T>,
    ): Promise<ResponsesResult<T>> {
      return outcome;
    },
  };
}

function buildMistake(
  overrides: Partial<NormalizedMistakeItem> = {},
): NormalizedMistakeItem {
  return {
    categoryCode: "GR",
    categoryId: 1,
    featureTags: ["VERB_FORM"],
    primaryTagCode: "VERB_FORM",
    primaryTagId: 10,
    anchorText: "I",
    anchorStart: 0,
    anchorEnd: 1,
    suggestedCorrection: null,
    explanation: "Example",
    suggestedTag: null,
    meta: {},
    ...overrides,
  };
}

Deno.test("realignMistakeSpans adjusts offsets when model returns aligned span", async () => {
  const submissionText = "I can write well.";
  const items = [buildMistake({
    anchorText: submissionText.slice(0, 1),
    anchorStart: 0,
    anchorEnd: 1,
    meta: {
      anchor_text_adjustment: {
        originalAnchorText: "can",
        normalizedOriginal: "can",
        normalizedTarget: "i",
        distance: 3,
        strategy: "levenshtein",
      },
    },
  })];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: 2,
        anchorEnd: 5,
        matchedText: "can",
        notes: "snapped",
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "test",
    submissionText,
    items,
  });

  const [adjusted] = result.items;
  assertEquals(adjusted.anchorStart, 2);
  assertEquals(adjusted.anchorEnd, 5);
  assertEquals(adjusted.anchorText, "can");
  assertEquals(result.metrics.aligned, 1);
  assertEquals(result.metrics.correctionRatio, 1);
  assertEquals(result.metrics.fallbackCount, 0);
  const anchorMeta = getAnchorMeta(adjusted.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "aligned");
  assertEquals(anchorMeta?.["adjustedAnchorStart"], 2);
  assertEquals(anchorMeta?.["reportedAnchorText"], "can");
});

Deno.test("realignMistakeSpans preserves offsets when model reports unchanged", async () => {
  const submissionText = "He writes well.";
  const items = [buildMistake({
    anchorText: submissionText.slice(3, 9),
    anchorStart: 3,
    anchorEnd: 9,
  })];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "unchanged",
        anchorStart: 3,
        anchorEnd: 9,
        matchedText: submissionText.slice(3, 9),
        notes: null,
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "unchanged",
    submissionText,
    items,
  });

  const [adjusted] = result.items;
  assertEquals(adjusted.anchorStart, 3);
  assertEquals(adjusted.anchorEnd, 9);
  assertEquals(result.metrics.unchanged, 1);
  assertEquals(result.metrics.correctionRatio, 0);
  assertEquals(result.metrics.fallbackCount, 0);
  const anchorMeta = getAnchorMeta(adjusted.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "unchanged");
});

Deno.test("realignMistakeSpans marks invalid ranges when suggestion is outside window", async () => {
  const submissionText = "This sentence has an error.";
  const items = [buildMistake({
    anchorText: submissionText.slice(5, 13),
    anchorStart: 5,
    anchorEnd: 13,
  })];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: 50,
        anchorEnd: 60,
        matchedText: "invalid",
        notes: null,
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "invalid",
    submissionText,
    items,
  });

  const [adjusted] = result.items;
  assertStrictEquals(adjusted.anchorStart, 5);
  assertStrictEquals(adjusted.anchorEnd, 13);
  assertEquals(result.metrics.invalid, 1);
  assertEquals(result.metrics.correctionRatio, 0);
  assertEquals(result.metrics.fallbackCount, 1);
  const anchorMeta = getAnchorMeta(adjusted.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "invalid");
});

Deno.test("realignMistakeSpans records not_found without altering span", async () => {
  const submissionText = "Multiple words appear more than once words.";
  const items = [buildMistake({
    anchorText: "words",
    anchorStart: 8,
    anchorEnd: 13,
  })];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "not_found",
        anchorStart: 8,
        anchorEnd: 13,
        matchedText: "words",
        notes: null,
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "not-found",
    submissionText,
    items,
  });

  const [adjusted] = result.items;
  assertStrictEquals(adjusted.anchorStart, 8);
  assertStrictEquals(adjusted.anchorEnd, 13);
  assertEquals(result.metrics.notFound, 1);
  assertEquals(result.metrics.correctionRatio, 0);
  assertEquals(result.metrics.fallbackCount, 1);
  const anchorMeta = getAnchorMeta(adjusted.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "not_found");
  assertEquals(anchorMeta?.["strategy"], "substring");
  assertEquals(typeof anchorMeta?.["distance"], "number");
  assertEquals(typeof anchorMeta?.["normalizedOriginal"], "string");
  assertEquals(typeof anchorMeta?.["normalizedTarget"], "string");
});

Deno.test("realignMistakeSpans reserves original spans after fallback to prevent overlaps", async () => {
  const submissionText = "alpha beta gamma delta epsilon zeta";
  const firstSpanText = "alpha";
  const secondSpanText = "epsilon";
  const firstSpanStart = submissionText.indexOf(firstSpanText);
  const firstSpanEnd = firstSpanStart + firstSpanText.length;
  const secondSpanStart = submissionText.indexOf(secondSpanText);
  const secondSpanEnd = secondSpanStart + secondSpanText.length;
  const items = [
    buildMistake({
      anchorText: firstSpanText,
      anchorStart: firstSpanStart,
      anchorEnd: firstSpanEnd,
    }),
    buildMistake({
      anchorText: secondSpanText,
      anchorStart: secondSpanStart,
      anchorEnd: secondSpanEnd,
    }),
  ];

  const overlapStart = firstSpanStart + 1;
  const overlapEnd = overlapStart + secondSpanText.length;
  const overlapText = submissionText.slice(overlapStart, overlapEnd);

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "not_found",
        anchorStart: firstSpanStart,
        anchorEnd: firstSpanEnd,
        matchedText: firstSpanText,
        notes: null,
      },
      {
        id: "mistake_1",
        status: "aligned",
        anchorStart: overlapStart,
        anchorEnd: overlapEnd,
        matchedText: overlapText,
        notes: null,
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "reserve-overlap",
    submissionText,
    items,
  });

  const [first, second] = result.items;
  assertStrictEquals(first.anchorStart, firstSpanStart);
  assertStrictEquals(first.anchorEnd, firstSpanEnd);
  assertStrictEquals(second.anchorStart, secondSpanStart);
  assertStrictEquals(second.anchorEnd, secondSpanEnd);
  assertEquals(result.metrics.notFound, 1);
  assertEquals(result.metrics.invalid, 1);
  assertEquals(result.metrics.fallbackCount, 2);
  const firstMeta = getAnchorMeta(first.meta);
  assertEquals(firstMeta?.["realignmentStatus"], "not_found");
  const secondMeta = getAnchorMeta(second.meta);
  assertEquals(secondMeta?.["realignmentStatus"], "invalid");
  assertEquals(secondMeta?.["realignmentNotes"], "overlap");
});

Deno.test("realignMistakeSpans aligns spans containing multi-byte characters", async () => {
  const submissionText = "La canción está lista.";
  const expectedText = "canción";
  const expectedStart = submissionText.indexOf(expectedText);
  const expectedEnd = expectedStart + expectedText.length;
  const items = [buildMistake({
    anchorText: submissionText.slice(0, 2),
    anchorStart: 0,
    anchorEnd: 2,
    meta: {
      anchor_text_adjustment: {
        originalAnchorText: "cancion",
        reportedAnchorText: "cancion",
        normalizedOriginal: "cancion",
        normalizedTarget: "la",
        distance: 5,
        strategy: "levenshtein",
      },
    },
  })];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: expectedStart,
        anchorEnd: expectedEnd,
        matchedText: expectedText,
        notes: "multi-byte match",
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "multibyte",
    submissionText,
    items,
  });

  const [adjusted] = result.items;
  assertEquals(adjusted.anchorStart, expectedStart);
  assertEquals(adjusted.anchorEnd, expectedEnd);
  assertEquals(adjusted.anchorText, expectedText);
  assertEquals(result.metrics.aligned, 1);
  assertEquals(result.metrics.correctionRatio, 1);
  const anchorMeta = getAnchorMeta(adjusted.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "aligned");
  assertEquals(anchorMeta?.["adjustedAnchorStart"], expectedStart);
  assertEquals(anchorMeta?.["adjustedAnchorEnd"], expectedEnd);
  assertEquals(anchorMeta?.["reportedAnchorText"], "cancion");
});

Deno.test("realignMistakeSpans falls back to original span when very short submissions produce invalid suggestions", async () => {
  const submissionText = "Hi";
  const items = [buildMistake({
    anchorText: submissionText,
    anchorStart: 0,
    anchorEnd: submissionText.length,
  })];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: 5,
        anchorEnd: 8,
        matchedText: submissionText,
        notes: null,
      },
    ],
  });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "short-submission",
    submissionText,
    items,
  });

  const [adjusted] = result.items;
  assertEquals(adjusted.anchorStart, 0);
  assertEquals(adjusted.anchorEnd, submissionText.length);
  assertEquals(result.metrics.invalid, 1);
  assertEquals(result.metrics.fallbackCount, 1);
  assertEquals(result.metrics.aligned, 0);
  const anchorMeta = getAnchorMeta(adjusted.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "invalid");
  assertEquals(anchorMeta?.["realignmentNotes"], "invalid_span");
});

Deno.test("realignMistakeSpans throws when model repeats ids", async () => {
  const submissionText = "Hello world!";
  const items = [
    buildMistake({
      anchorText: "Hello",
      anchorStart: 0,
      anchorEnd: 5,
    }),
    buildMistake({
      anchorText: "world",
      anchorStart: 6,
      anchorEnd: 11,
    }),
  ];

  const client = createStubClient({
    items: [
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: 0,
        anchorEnd: 5,
        matchedText: "Hello",
        notes: null,
      },
      {
        id: "mistake_0",
        status: "aligned",
        anchorStart: 6,
        anchorEnd: 11,
        matchedText: "world",
        notes: null,
      },
    ],
  });

  await assertRejects(
    () =>
      realignMistakeSpans({
        aiClient: client,
        requestId: "duplicate-id",
        submissionText,
        items,
      }),
    Error,
    "inconsistent ids",
  );
});

Deno.test("realignMistakeSpans marks skipped status when submission text is empty", async () => {
  const submissionText = "";
  const items = [buildMistake()];
  const client = createStubClient({ items: [] });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "skip-empty",
    submissionText,
    items,
  });

  assertEquals(result.metrics.skipped, 1);
  assertStrictEquals(result.metrics.correctionRatio, null);
  const [updated] = result.items;
  const anchorMeta = getAnchorMeta(updated.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "skipped");
  assertEquals(
    anchorMeta?.["realignmentNotes"],
    "skipped_empty_submission_text",
  );
  assertEquals(anchorMeta?.["strategy"], "substring");
  assertEquals(anchorMeta?.["distance"], 0);
  assertEquals(typeof anchorMeta?.["normalizedOriginal"], "string");
  assertEquals(typeof anchorMeta?.["normalizedTarget"], "string");
});

Deno.test("realignMistakeSpans marks skipped status when submission text exceeds limit", async () => {
  const submissionText = "a".repeat(6_001);
  const items = [buildMistake({
    anchorText: submissionText.slice(0, 1),
    anchorStart: 0,
    anchorEnd: 1,
  })];
  const client = createStubClient({ items: [] });

  const result = await realignMistakeSpans({
    aiClient: client,
    requestId: "skip-long",
    submissionText,
    items,
  });

  assertEquals(result.metrics.skipped, 1);
  assertStrictEquals(result.metrics.correctionRatio, null);
  const [updated] = result.items;
  const anchorMeta = getAnchorMeta(updated.meta);
  assertEquals(anchorMeta?.["realignmentStatus"], "skipped");
  assertEquals(
    anchorMeta?.["realignmentNotes"],
    "skipped_submission_text_too_long",
  );
  assertEquals(anchorMeta?.["strategy"], "substring");
  assertEquals(anchorMeta?.["distance"], 0);
  assertEquals(typeof anchorMeta?.["normalizedOriginal"], "string");
  assertEquals(typeof anchorMeta?.["normalizedTarget"], "string");
});

Deno.test("realignMistakeSpans surfaces an incomplete Responses outcome", async () => {
  const client = createOutcomeClient({
    kind: "incomplete",
    reason: "max_output_tokens",
    model: OPENAI_RESPONSES_MODEL,
    latencyMs: 9,
    usage: null,
  });

  await assertRejects(
    () =>
      realignMistakeSpans({
        aiClient: client,
        requestId: "incomplete",
        submissionText: "I write clearly.",
        items: [buildMistake()],
      }),
    Error,
    "incomplete",
  );
});

Deno.test("realignMistakeSpans surfaces a refusal Responses outcome", async () => {
  const client = createOutcomeClient({
    kind: "refusal",
    model: OPENAI_RESPONSES_MODEL,
    latencyMs: 8,
    usage: null,
  });

  await assertRejects(
    () =>
      realignMistakeSpans({
        aiClient: client,
        requestId: "refusal",
        submissionText: "I write clearly.",
        items: [buildMistake()],
      }),
    Error,
    "refused",
  );
});

Deno.test("realignMistakeSpans surfaces a failed Responses outcome", async () => {
  const client = createOutcomeClient({
    kind: "failed",
    code: "network_error",
    retryable: true,
    httpStatus: null,
    model: OPENAI_RESPONSES_MODEL,
    latencyMs: 11,
    usage: null,
  });

  await assertRejects(
    () =>
      realignMistakeSpans({
        aiClient: client,
        requestId: "failed",
        submissionText: "I write clearly.",
        items: [buildMistake()],
      }),
    Error,
    "network_error",
  );
});
