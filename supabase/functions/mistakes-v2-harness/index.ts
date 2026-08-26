// supabase/functions/mistakes-v2-harness/index.ts

import { serve } from "std/http/server.ts";
import { createCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabasePublishableKey } from "../_shared/auth.ts";
import {
  createOpenAIResponsesClientFromEnv,
  OPENAI_RESPONSES_MODEL,
} from "../_shared/openai-responses.ts";
import {
  HARNESS_RESPONSES_JSON_SCHEMA,
  parseHarnessResponsesPayload,
} from "../evaluate-submission/responses-contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = resolveSupabasePublishableKey();

const MAX_SUBMISSION_LENGTH = 8_000;
const DEFAULT_MAX_ITEMS = 6;

function isLocalSupabaseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" ||
      hostname === "::1";
  } catch {
    return false;
  }
}

const IS_LOCAL_DEVELOPMENT = isLocalSupabaseUrl(SUPABASE_URL);

function jsonResponse(
  corsHeaders: HeadersInit,
  status: number,
  payload: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, index);
    if (at === -1) break;
    hits.push(at);
    index = at + Math.max(1, needle.length);
  }
  return hits;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = new Array<number>(rows * cols);

  for (let i = 0; i < rows; i += 1) matrix[i * cols] = i;
  for (let j = 0; j < cols; j += 1) matrix[j] = j;

  for (let i = 1; i < rows; i += 1) {
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const del = matrix[(i - 1) * cols + j] + 1;
      const ins = matrix[i * cols + (j - 1)] + 1;
      const sub = matrix[(i - 1) * cols + (j - 1)] + cost;
      matrix[i * cols + j] = Math.min(del, ins, sub);
    }
  }

  return matrix[rows * cols - 1];
}

function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return clamp(1 - distance / maxLen, 0, 1);
}

type AnchorResolution =
  | {
    status: "anchored";
    start: number;
    end: number;
    strategy: "composite" | "before_unique" | "context_score";
    confidence: number;
  }
  | {
    status: "ambiguous";
    strategy: "before_multiple" | "context_score";
    candidates: number;
  }
  | { status: "not_found"; strategy: "composite" | "before" }
  | { status: "invalid"; reason: string };

function resolveAnchorPatch(params: {
  submissionText: string;
  before: string;
  contextBefore?: string;
  contextAfter?: string;
}): AnchorResolution {
  const before = params.before ?? "";
  const contextBefore = params.contextBefore ?? "";
  const contextAfter = params.contextAfter ?? "";
  const submissionText = params.submissionText;

  if (before.trim().length < 2) {
    return { status: "invalid", reason: "before_too_short" };
  }

  const composite = contextBefore + before + contextAfter;
  const minContextTotal = 12;
  const contextTotal = contextBefore.length + contextAfter.length;

  if (contextTotal >= minContextTotal && composite.length > before.length) {
    const compositeHits = findAllOccurrences(submissionText, composite);
    if (compositeHits.length === 1) {
      const compositeStart = compositeHits[0];
      const start = compositeStart + contextBefore.length;
      const end = start + before.length;
      return {
        status: "anchored",
        start,
        end,
        strategy: "composite",
        confidence: 1,
      };
    }
    if (compositeHits.length > 1) {
      return {
        status: "ambiguous",
        strategy: "before_multiple",
        candidates: compositeHits.length,
      };
    }
  }

  const beforeHits = findAllOccurrences(submissionText, before);
  if (beforeHits.length === 0) {
    return { status: "not_found", strategy: "before" };
  }

  if (beforeHits.length === 1) {
    const start = beforeHits[0];
    const end = start + before.length;
    return {
      status: "anchored",
      start,
      end,
      strategy: "before_unique",
      confidence: 0.9,
    };
  }

  const expectedBefore = contextBefore;
  const expectedAfter = contextAfter;
  const expectedBeforeLen = expectedBefore.length;
  const expectedAfterLen = expectedAfter.length;

  if (expectedBeforeLen === 0 && expectedAfterLen === 0) {
    return {
      status: "ambiguous",
      strategy: "before_multiple",
      candidates: beforeHits.length,
    };
  }

  const scored = beforeHits.map((start) => {
    const end = start + before.length;
    const actualBefore = expectedBeforeLen > 0
      ? submissionText.slice(Math.max(0, start - expectedBeforeLen), start)
      : "";
    const actualAfter = expectedAfterLen > 0
      ? submissionText.slice(
        end,
        Math.min(submissionText.length, end + expectedAfterLen),
      )
      : "";

    const scoreBefore = expectedBeforeLen > 0
      ? similarityScore(actualBefore, expectedBefore)
      : 1;
    const scoreAfter = expectedAfterLen > 0
      ? similarityScore(actualAfter, expectedAfter)
      : 1;
    const weights = [
      expectedBeforeLen > 0 ? expectedBeforeLen : 0,
      expectedAfterLen > 0 ? expectedAfterLen : 0,
    ];
    const weightSum = weights[0] + weights[1];
    const score = weightSum > 0
      ? (scoreBefore * weights[0] + scoreAfter * weights[1]) / weightSum
      : (scoreBefore + scoreAfter) / 2;

    return { start, end, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const minScore = 0.85;
  const minMargin = 0.08;

  if (!best) {
    return {
      status: "ambiguous",
      strategy: "context_score",
      candidates: beforeHits.length,
    };
  }

  const margin = second ? best.score - second.score : 1;
  if (best.score >= minScore && margin >= minMargin) {
    return {
      status: "anchored",
      start: best.start,
      end: best.end,
      strategy: "context_score",
      confidence: best.score,
    };
  }

  return {
    status: "ambiguous",
    strategy: "context_score",
    candidates: beforeHits.length,
  };
}

interface HarnessRequestPayload {
  submissionText: string;
  maxItems?: number;
}

function buildPrompt(params: { submissionText: string; maxItems: number }) {
  const systemPrompt = [
    "<system>",
    "You are an ESL writing mistake detector for Exameny.",
    "Return JSON only using ASCII quotes. No markdown, no commentary.",
    "Goal: produce mistakes with patch-based anchors (no character indices).",
    "",
    "For each mistake, return:",
    "- category: one of GR, LX, ME, DC, RS, or TA.",
    "- featureTags: zero or more allowed feature tag codes.",
    "- before: exact substring copied from the submission (must exist verbatim).",
    "- after: corrected version for that substring only, or null.",
    "- contextBefore/contextAfter: short exact context, or an empty string.",
    "- explanation: concise, learner-facing feedback.",
    "- suggestedTag: a short optional label, or null.",
    "",
    "Rules:",
    "- Do NOT include anchorStart/anchorEnd.",
    `- Provide at most ${params.maxItems} items.`,
    "- Do not add fields outside the supplied schema.",
    "</system>",
  ].join("\n");

  const userPrompt = [
    "<submission>",
    params.submissionText,
    "</submission>",
    "",
    "Return only data matching the supplied JSON Schema.",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

const responsesClient = createOpenAIResponsesClientFromEnv();

serve(async (req) => {
  const corsHeaders = createCorsHeaders(req);

  if (!IS_LOCAL_DEVELOPMENT) {
    return jsonResponse(corsHeaders, 404, { error: "Not found." });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Method Not Allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error(
      "FATAL: Missing SUPABASE_URL or EXAMENY_SUPABASE_PUBLISHABLE_KEY for mistakes-v2-harness.",
    );
    return jsonResponse(corsHeaders, 500, { error: "Server misconfigured." });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  const startedAt = Date.now();
  console.log("[mistakes-v2-harness] Request start.");

  const authHeader = req.headers.get("Authorization") ??
    req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse(corsHeaders, 401, {
      error: "Authentication required.",
      requestId,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult?.user) {
    console.warn("[mistakes-v2-harness] Invalid user token.");
    return jsonResponse(corsHeaders, 401, {
      error: "Authentication required.",
      requestId,
    });
  }

  let payload: HarnessRequestPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    console.warn("[mistakes-v2-harness] Invalid JSON payload.");
    return jsonResponse(corsHeaders, 400, {
      error: "Invalid JSON payload.",
      requestId,
    });
  }

  const submissionText = typeof payload.submissionText === "string"
    ? payload.submissionText
    : "";
  if (!submissionText.trim()) {
    return jsonResponse(corsHeaders, 400, {
      error: "submissionText is required.",
      requestId,
    });
  }
  if (submissionText.length > MAX_SUBMISSION_LENGTH) {
    return jsonResponse(corsHeaders, 400, {
      error: `submissionText exceeds ${MAX_SUBMISSION_LENGTH} characters.`,
      requestId,
    });
  }

  const maxItems = Number.isFinite(payload.maxItems)
    ? clamp(Math.floor(payload.maxItems as number), 1, 30)
    : DEFAULT_MAX_ITEMS;

  const prompt = buildPrompt({ submissionText, maxItems });
  const responseResult = await responsesClient.generate({
    instructions: prompt.systemPrompt,
    input: [{ role: "user", content: prompt.userPrompt }],
    schemaName: "exameny_mistakes_harness_v1",
    schema: HARNESS_RESPONSES_JSON_SCHEMA,
    parse: parseHarnessResponsesPayload,
    reasoningEffort: "medium",
    maxOutputTokens: 2_048,
    timeoutMs: 45_000,
  });

  let rawItems: ReturnType<typeof parseHarnessResponsesPayload>["items"];
  switch (responseResult.kind) {
    case "completed":
      rawItems = responseResult.data.items.slice(0, maxItems);
      break;
    case "incomplete":
      return jsonResponse(corsHeaders, 502, {
        error: `AI response was incomplete (${responseResult.reason}).`,
        requestId,
      });
    case "refusal":
      return jsonResponse(corsHeaders, 422, {
        error: "AI declined to analyse this submission.",
        requestId,
      });
    case "failed": {
      const status = responseResult.code === "rate_limited"
        ? 429
        : responseResult.code === "timeout"
        ? 504
        : 502;
      return jsonResponse(corsHeaders, status, {
        error: `AI request failed (${responseResult.code}).`,
        requestId,
      });
    }
  }

  const resolvedItems = rawItems.map((item, index) => {
    const anchorPatchCandidate = item.anchorPatch;
    const before = anchorPatchCandidate.before;
    const contextBefore = anchorPatchCandidate.contextBefore;
    const contextAfter = anchorPatchCandidate.contextAfter;

    const resolution = resolveAnchorPatch({
      submissionText,
      before,
      contextBefore,
      contextAfter,
    });

    const anchoredText = resolution.status === "anchored"
      ? submissionText.slice(resolution.start, resolution.end)
      : null;

    return {
      id: `item_${index}`,
      category: item.category,
      featureTags: item.featureTags,
      explanation: item.explanation,
      anchorPatch: {
        before,
        after: anchorPatchCandidate.after ?? null,
        contextBefore,
        contextAfter,
      },
      resolution,
      anchoredText,
    };
  });

  const metrics = resolvedItems.reduce<Record<string, number>>((acc, item) => {
    const key = item.resolution.status ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const durationMs = Date.now() - startedAt;
  const resolvedCount = resolvedItems.length;
  console.log("[mistakes-v2-harness] Completed.", {
    request_id: requestId,
    duration_ms: durationMs,
    resolved_count: resolvedCount,
  });

  return jsonResponse(corsHeaders, 200, {
    requestId,
    durationMs,
    model: OPENAI_RESPONSES_MODEL,
    usage: responseResult.usage,
    metrics,
    items: resolvedItems,
  });
});
