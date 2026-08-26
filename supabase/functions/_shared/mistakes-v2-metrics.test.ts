import { assertEquals } from "std/testing/asserts.ts";
import {
  PUBLIC_MISTAKES_V2_METRIC_KEYS,
  toPublicMistakesV2Metrics,
} from "./mistakes-v2-metrics.ts";

Deno.test("toPublicMistakesV2Metrics strips unexpected keys", () => {
  const fallback = {
    total: 3,
    anchored: 1,
    ambiguous: 1,
    not_found: 1,
    invalid: 0,
    resolverDurationMs: 12,
    resolverVersion: 2,
  };

  const candidate = {
    ...fallback,
    model_name: "unexpected-provider-model",
    tokens: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    submission_text_hash: "deadbeef",
    warnings: [{ code: "x" }],
  };

  const result = toPublicMistakesV2Metrics(candidate, fallback);
  assertEquals(
    Object.keys(result).sort(),
    [...PUBLIC_MISTAKES_V2_METRIC_KEYS].sort(),
  );
  assertEquals(result, fallback);
});

Deno.test("toPublicMistakesV2Metrics uses fallback for invalid values", () => {
  const fallback = {
    total: 1,
    anchored: 1,
    ambiguous: 0,
    not_found: 0,
    invalid: 0,
    resolverDurationMs: 5,
    resolverVersion: 2,
  };

  const candidate = {
    total: Number.NaN,
    anchored: "1",
    ambiguous: -2,
    not_found: 0,
    invalid: Infinity,
    resolverDurationMs: -10,
    resolverVersion: 2,
  };

  const result = toPublicMistakesV2Metrics(candidate, fallback);
  assertEquals(result.total, fallback.total);
  assertEquals(result.anchored, fallback.anchored);
  assertEquals(result.invalid, fallback.invalid);
  assertEquals(result.not_found, 0);
  assertEquals(result.ambiguous, 0);
  assertEquals(result.resolverDurationMs, 0);
  assertEquals(result.resolverVersion, 2);
});
