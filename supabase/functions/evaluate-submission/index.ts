// supabase/functions/evaluate-submission/index.ts

// --- Imports & Bootstrap ---
import { serve } from "std/http/server.ts";
import { createCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";
import {
  getServiceRoleClient,
  resolveSupabasePublishableKey,
} from "../_shared/auth.ts";
import {
  createOpenAIResponsesClientFromEnv,
  OPENAI_RESPONSES_MODEL,
  type TokenUsage,
} from "../_shared/openai-responses.ts";
import { assertRateLimit, enforceRateLimit } from "../_shared/rate-limit.ts";
import {
  areE2EFixturesEnabled,
  isLocalSupabaseUrl,
} from "../_shared/runtime-mode.ts";
import {
  MistakeValidationError,
  SHORT_SUBMISSION_WORD_THRESHOLD,
  validateShortSubmissionMistakes,
} from "../_shared/mistakes.ts";
import {
  type NormalizedMistakesV2Result,
  type NormalizedMistakeV2Item,
  normalizeMistakesPayloadV2,
} from "../_shared/mistakes-v2.ts";
import { toPublicMistakesV2Metrics } from "../_shared/mistakes-v2-metrics.ts";
import { buildEvaluationPrompt, type EvaluationPromptData } from "./prompt.ts";
import { evaluationSchema } from "./mistakes-v2.schema.ts";
import {
  EVALUATION_RESPONSES_JSON_SCHEMA,
  type EvaluationResponsesPayload,
  parseEvaluationResponsesPayload,
} from "./responses-contract.ts";

// --- Environment & Constants ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = resolveSupabasePublishableKey();
const EXAMENY_SUPABASE_SECRET_KEY = Deno.env.get("EXAMENY_SUPABASE_SECRET_KEY");

const IS_LOCAL_DEVELOPMENT = isLocalSupabaseUrl(SUPABASE_URL);
const E2E_FIXTURES_ENABLED = areE2EFixturesEnabled({
  supabaseUrl: SUPABASE_URL,
  appEnv: Deno.env.get("APP_ENV"),
  fixturesFlag: Deno.env.get("E2E_FIXTURES_ENABLED"),
});

const USER_RATE_LIMIT_MAX = Number(
  Deno.env.get("EVALUATE_SUBMISSION_LIMIT_PER_USER") ?? "30",
);
const USER_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("EVALUATE_SUBMISSION_LIMIT_USER_WINDOW_MS") ?? (60 * 60 * 1000),
);
const ACADEMY_RATE_LIMIT_MAX = Number(
  Deno.env.get("EVALUATE_SUBMISSION_LIMIT_PER_ACADEMY") ?? "300",
);
const ACADEMY_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("EVALUATE_SUBMISSION_LIMIT_ACADEMY_WINDOW_MS") ??
    (60 * 60 * 1000),
);
const FORCE_RATE_LIMIT_MAX = Number(
  Deno.env.get("EVALUATE_SUBMISSION_FORCE_LIMIT_PER_USER") ?? "10",
);
const FORCE_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("EVALUATE_SUBMISSION_FORCE_LIMIT_USER_WINDOW_MS") ??
    (60 * 60 * 1000),
);

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    "FATAL: Missing SUPABASE_URL or EXAMENY_SUPABASE_PUBLISHABLE_KEY for evaluate-submission.",
  );
  Deno.exit(1);
}

if (!EXAMENY_SUPABASE_SECRET_KEY) {
  console.error(
    "FATAL: Missing EXAMENY_SUPABASE_SECRET_KEY for evaluate-submission (server-only persistence).",
  );
  Deno.exit(1);
}

function createUserClient(authorization: string) {
  return createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

const SCORE_DECIMALS = 1;
const SCORE_FRACTION_PATTERN = /(\d+(?:[.,]\d+)?)(\s*\/\s*)(\d+(?:[.,]\d+)?)/u;

// --- Interfaces ---
interface RequestPayload {
  submissionId: string; // UUID
  modelName?: string; // Optional override for dev harness (DEV project only)
  force?: boolean; // Optional override to bypass cached results
  debugMetrics?: boolean; // Optional override to include internal metrics (DEV project only)
}

interface AiCriterionEvaluation {
  criterionName: string;
  score: string;
  feedback: string;
}
interface AiEvaluationResult {
  overallScore: string;
  criteriaEvaluation: AiCriterionEvaluation[];
  overallCommentary: string;
}

interface AssignedPromptRelation {
  prompt_text: string | null;
}

interface ExamTypeDetails {
  id: number;
  name: string;
  max_score: number;
}

interface LevelDetails {
  id: number;
  name: string;
}

interface ExamTaskTypeRelation {
  id: number;
  name: string;
  exam_types: ExamTypeDetails | ExamTypeDetails[] | null;
  levels: LevelDetails | LevelDetails[] | null;
}

interface MembershipRelation {
  academy_id: number | string | null;
  status: string | null;
  user_id: string | null;
}

interface SubmissionContextRow {
  student_id: string;
  student_membership_id: number | string | null;
  submission_text: string | null;
  word_count: number | null;
  ai_generated_prompt_text: string | null;
  assigned_prompts: AssignedPromptRelation[] | null;
  exam_task_types: ExamTaskTypeRelation | ExamTaskTypeRelation[] | null;
  academy_memberships: MembershipRelation | MembershipRelation[] | null;
}

interface TaskCriterionLinkRow {
  criterion_id: number;
}

interface EvaluationCriterionRow {
  id: number;
  name: string;
  description: string | null;
  criterion_code: string;
}

interface BandDescriptorRow {
  score: number | string;
  descriptor_text: string;
  criterion: { name: string } | { name: string }[] | null;
}

interface ErrorCategoryRow {
  id: number;
  code: string;
}

interface ErrorTagRow {
  id: number;
  code: string;
  category_id: number;
}

interface EvaluationRow {
  ai_overall_score: string | null;
  ai_criteria_evaluation: AiCriterionEvaluation[] | null;
  ai_overall_commentary: string | null;
  ai_mistakes_summary: Record<string, unknown> | null;
  ai_mistakes_status: string | null;
  ai_mistakes_error: string | null;
  ai_mistakes_items_v2: unknown;
  ai_mistakes_metrics_v2: unknown;
}

function getFirstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function normalizeBigintId(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isNaN(parsedValue) ? null : parsedValue;
  }

  return null;
}

function computeWordCountFromText(
  text: string | null | undefined,
): number | null {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function formatScoreFractionText(
  raw: string,
  decimals = SCORE_DECIMALS,
): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  return trimmed.replace(
    SCORE_FRACTION_PATTERN,
    (
      match,
      numeratorRaw: string,
      separator: string,
      denominatorRaw: string,
    ) => {
      const numerator = Number.parseFloat(numeratorRaw.replace(",", "."));
      const denominator = Number.parseFloat(denominatorRaw.replace(",", "."));
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
        return match;
      }
      return `${numerator.toFixed(decimals)}${separator}${
        denominator.toFixed(decimals)
      }`;
    },
  );
}

function normalizeModelName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) {
    return trimmed.slice(0, 80);
  }
  return trimmed;
}

function buildDevE2eFixtureResponse(params: {
  requestedModelName: string | null;
  criteria: EvaluationPromptData["criteria"];
  submissionText: string;
}): Record<string, unknown> | null {
  if (!E2E_FIXTURES_ENABLED) return null;
  const requestedModelName = params.requestedModelName;
  if (!requestedModelName || !requestedModelName.startsWith("e2e-fixture:")) {
    return null;
  }

  const fixtureMode = requestedModelName.slice("e2e-fixture:".length).trim() ||
    "mistakes-v2";
  const trimmedSubmission = params.submissionText.trim();
  const desiredAnchor = "I like bananas";
  const anchorBefore = trimmedSubmission.includes(desiredAnchor)
    ? desiredAnchor
    : trimmedSubmission.slice(0, Math.min(30, trimmedSubmission.length));

  const resolvedAnchorStart = params.submissionText.indexOf(anchorBefore);
  const anchorStart = resolvedAnchorStart >= 0 ? resolvedAnchorStart : 0;
  const anchorEnd = Math.min(
    params.submissionText.length,
    anchorStart + anchorBefore.length,
  );

  const criteriaEvaluation = params.criteria.map((criterion) => ({
    criterionName: criterion.name,
    score: "4/5",
    feedback: `Fixture feedback for ${criterion.name}.`,
  }));

  const baseExplanation = fixtureMode.toLowerCase() === "mistakes-v2"
    ? "E2E fixture regenerated mistakes."
    : `E2E fixture regenerated mistakes (${fixtureMode}).`;

  const baseItem: Record<string, unknown> = {
    category: "GR",
    featureTags: ["ARTICLE"],
    anchorPatch: {
      before: anchorBefore.length >= 3 ? anchorBefore : "I like",
      after: null,
      contextBefore: "",
      contextAfter: "",
    },
    explanation: baseExplanation,
    suggestedTag: null,
  };

  let items: Record<string, unknown>[];

  switch (fixtureMode.toLowerCase()) {
    case "missing-suggestedtag":
    case "extra-keys":
    case "legacy-offsets": {
      items = [{
        ...baseItem,
        explanation:
          `E2E fixture normalized to the strict Responses contract (${fixtureMode}).`,
      }];
      break;
    }
    case "discarded-regression": {
      // Preserve the multi-item regression scenario with the public strict contract.
      const wordRegex = /\b[A-Za-z]{4,}\b/g;
      const matches = Array.from(params.submissionText.matchAll(wordRegex));
      const picked: Array<{ word: string; start: number; end: number }> = [];
      for (const match of matches) {
        const word = match[0];
        if (!word) continue;
        const start = match.index ?? -1;
        if (start < 0) continue;
        if (
          params.submissionText.indexOf(word) !==
            params.submissionText.lastIndexOf(word)
        ) continue;
        if (picked.some((entry) => entry.word === word)) continue;
        picked.push({ word, start, end: start + word.length });
        if (picked.length >= 5) break;
      }

      const fallback = {
        word: anchorBefore,
        start: anchorStart,
        end: anchorEnd,
      };
      const anchors = picked.length > 0 ? picked : [fallback];

      items = anchors.map((anchor, index) => ({
        category: "GR",
        featureTags: ["ARTICLE"],
        anchorPatch: {
          before: anchor.word,
          after: null,
          contextBefore: "",
          contextAfter: "",
        },
        explanation: `E2E discarded regression item ${index + 1}.`,
        suggestedTag: null,
      }));
      break;
    }
    default: {
      items = [baseItem];
    }
  }

  return {
    evaluation: {
      overallScore: "4/5",
      criteriaEvaluation,
      overallCommentary: "E2E fixture overall commentary.",
    },
    mistakes: {
      items,
    },
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMetricNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parseCachedMetrics(value: unknown): {
  resolverVersion: number | null;
  submissionTextHash: string | null;
  submissionCharCount: number | null;
  submissionWordCount: number | null;
} {
  if (!isPlainRecord(value)) {
    return {
      resolverVersion: null,
      submissionTextHash: null,
      submissionCharCount: null,
      submissionWordCount: null,
    };
  }

  const resolverVersion = normalizeMetricNumber(value.resolverVersion);
  const submissionCharCount = normalizeMetricNumber(
    value.submission_char_count ?? value.submissionCharCount,
  );
  const submissionWordCount = normalizeMetricNumber(
    value.submission_word_count ?? value.submissionWordCount,
  );
  const submissionTextHash = typeof value.submission_text_hash === "string"
    ? value.submission_text_hash
    : null;

  return {
    resolverVersion,
    submissionTextHash,
    submissionCharCount,
    submissionWordCount,
  };
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isSubmissionTextUnchanged(
  metrics: ReturnType<typeof parseCachedMetrics>,
  submissionText: string,
  submissionWordCount: number | null,
): boolean {
  const currentHash = hashText(submissionText);
  if (metrics.submissionTextHash) {
    return metrics.submissionTextHash === currentHash;
  }

  if (
    metrics.submissionCharCount === null ||
    metrics.submissionWordCount === null || submissionWordCount === null
  ) {
    return false;
  }

  return metrics.submissionCharCount === submissionText.length &&
    metrics.submissionWordCount === submissionWordCount;
}

function countAnchorResolutionStatuses(items: NormalizedMistakeV2Item[]) {
  let anchored = 0;
  let ambiguous = 0;
  let notFound = 0;
  let invalid = 0;

  for (const item of items) {
    switch (item.anchorResolution.status) {
      case "anchored":
        anchored += 1;
        break;
      case "ambiguous":
        ambiguous += 1;
        break;
      case "not_found":
        notFound += 1;
        break;
      case "invalid":
        invalid += 1;
        break;
    }
  }

  return { anchored, ambiguous, notFound, invalid };
}

function hasCachedMistakesWarnings(evaluation: EvaluationRow): boolean {
  const status = typeof evaluation.ai_mistakes_status === "string"
    ? evaluation.ai_mistakes_status
    : null;
  if (status === "failed" || status === "completed_with_warnings") return true;

  const rawError = typeof evaluation.ai_mistakes_error === "string"
    ? evaluation.ai_mistakes_error.trim()
    : "";
  if (rawError.length > 0) return true;

  const items = Array.isArray(evaluation.ai_mistakes_items_v2)
    ? (evaluation.ai_mistakes_items_v2 as NormalizedMistakeV2Item[])
    : null;

  if (items) {
    const counts = countAnchorResolutionStatuses(items);
    const unhighlightable = counts.ambiguous + counts.notFound + counts.invalid;
    if (unhighlightable > 0) return true;
  }

  const metricsRecord = isPlainRecord(evaluation.ai_mistakes_metrics_v2)
    ? evaluation.ai_mistakes_metrics_v2
    : null;
  const total = metricsRecord
    ? normalizeMetricNumber(metricsRecord.total)
    : null;
  if (total !== null) {
    const keptCount = items ? items.length : 0;
    if (Math.max(0, total - keptCount) > 0) return true;
  }

  return false;
}

function isValidEvaluationResult(
  data: unknown,
  expectedCriteriaNames: string[],
): boolean {
  if (!data || typeof data !== "object") return false;

  const candidate = data as Partial<AiEvaluationResult>;
  if (
    typeof candidate.overallScore !== "string" ||
    typeof candidate.overallCommentary !== "string"
  ) {
    return false;
  }

  if (
    !Array.isArray(candidate.criteriaEvaluation) ||
    candidate.criteriaEvaluation.length !== expectedCriteriaNames.length
  ) {
    return false;
  }

  for (let index = 0; index < expectedCriteriaNames.length; index += 1) {
    const item = candidate.criteriaEvaluation[index];
    if (!item || typeof item !== "object") return false;
    const evaluationEntry = item as Partial<AiCriterionEvaluation>;
    if (
      typeof evaluationEntry.criterionName !== "string" ||
      typeof evaluationEntry.score !== "string" ||
      typeof evaluationEntry.feedback !== "string"
    ) {
      return false;
    }

    if (evaluationEntry.criterionName !== expectedCriteriaNames[index]) {
      return false;
    }
  }

  return true;
}

function mapAnchoredMistakeForRpc(
  item: NormalizedMistakeV2Item,
  submissionText: string,
) {
  if (item.anchorResolution.status !== "anchored") {
    return null;
  }

  const { start, end } = item.anchorResolution;
  return {
    category_id: item.categoryId,
    category_code: item.category,
    tag_id: item.primaryTagId,
    tag_code: item.primaryTag,
    anchor_text: submissionText.slice(start, end),
    anchor_start: start,
    anchor_end: end,
    suggested_correction: item.suggestedCorrection,
    explanation: item.explanation,
    meta: item.meta,
  };
}

function mapMistakesForResponse(
  normalized: NormalizedMistakesV2Result | null,
  submissionText: string,
  metricsDebug?: Record<string, unknown> | null,
) {
  if (!normalized) return null;

  return {
    items: normalized.items.map((item) => {
      const resolution = item.anchorResolution;
      let anchorStart: number | null = null;
      let anchorEnd: number | null = null;
      let anchorText: string | null = null;
      if (resolution.status === "anchored") {
        anchorStart = resolution.start;
        anchorEnd = resolution.end;
        anchorText = submissionText.slice(resolution.start, resolution.end);
      }
      return {
        category: item.category,
        featureTags: item.featureTags,
        anchorPatch: item.anchorPatch,
        anchorResolution: item.anchorResolution,
        anchorText,
        anchorStart,
        anchorEnd,
        suggestedCorrection: item.suggestedCorrection,
        explanation: item.explanation,
        suggestedTag: item.suggestedTag,
        meta: item.meta,
      };
    }),
    summary: normalized.summary,
    metrics: normalized.metrics,
    ...(metricsDebug ? { metricsDebug } : {}),
  };
}

function appendMetricsWarning(
  payload: Record<string, unknown> | null,
  warning: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!payload) return payload;
  const existing = Array.isArray(payload.warnings) ? payload.warnings : [];
  return { ...payload, warnings: [...existing, warning] };
}

// --- Main Handler ---
serve(async (req) => {
  const corsHeaders = createCorsHeaders(req);
  const jsonResponse = <T extends Record<string, unknown>>(
    status: number,
    payload: T,
  ): Response => (
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  );

  const requestStartTime = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(
    `[${requestId}] [evaluate-submission] Request Start: ${req.method} `,
  );

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(
      `[${requestId}] [evaluate-submission] Missing or invalid Authorization header.`,
    );
    return jsonResponse(401, { error: "Authentication required." });
  }

  const supabaseClient = createUserClient(authHeader);

  const [
    { data: userResult, error: userError },
    { data: academyId, error: academyError },
    { data: role, error: roleError },
  ] = await Promise.all([
    supabaseClient.auth.getUser(),
    supabaseClient.rpc("get_my_academy_id_from_jwt"),
    supabaseClient.rpc("get_my_role_from_jwt"),
  ]);

  if (userError || !userResult?.user) {
    console.warn(
      `[${requestId}] [evaluate-submission] Unable to fetch authenticated user.`,
    );
    return jsonResponse(401, { error: "Authentication required." });
  }

  if (academyError) {
    console.error(
      `[${requestId}] [evaluate-submission] Failed to resolve academy context.`,
    );
    return jsonResponse(500, { error: "Could not determine academy context." });
  }

  if (roleError) {
    console.error(
      `[${requestId}] [evaluate-submission] Failed to resolve user role.`,
    );
    return jsonResponse(500, { error: "Could not determine user role." });
  }

  const userId = userResult.user.id;
  const resolvedRole = typeof role === "string" ? role : null;
  const resolvedAcademyId = normalizeBigintId(academyId);

  if (academyId != null && resolvedAcademyId === null) {
    console.warn(
      `[${requestId}] [evaluate-submission] Received non-numeric academy id from auth metadata:`,
    );
  }

  const allowedRoles = new Set([
    "student",
    "teacher",
    "academy_admin",
    "platform_owner",
    "super_admin",
  ]);

  if (!resolvedRole || !allowedRoles.has(resolvedRole)) {
    console.warn(
      `[${requestId}] [evaluate-submission] Unsupported role context.`,
    );
    return jsonResponse(403, {
      error: "Your account is not allowed to evaluate submissions.",
    });
  }

  let submissionId: string;
  let requestedModelName: string | null = null;
  let requestedForce = false;
  let forceEvaluation = false;
  let includeDebugMetrics = false;
  let isFixtureRequest = false;
  try {
    const body: RequestPayload = await req.json();
    submissionId = body.submissionId;
    requestedModelName = normalizeModelName(body.modelName);
    requestedForce = body.force === true;
    includeDebugMetrics = IS_LOCAL_DEVELOPMENT && body.debugMetrics === true;
    isFixtureRequest = E2E_FIXTURES_ENABLED &&
      typeof requestedModelName === "string" &&
      requestedModelName.startsWith("e2e-fixture:");
    forceEvaluation = requestedForce && resolvedRole !== "student";
    if (!submissionId || typeof submissionId !== "string") {
      throw new Error("Invalid input: submissionId (string uuid) is required.");
    }
    console.log(
      `[${requestId}] [evaluate-submission] Processing evaluation for submissionId: `,
    );
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : "Invalid JSON payload";
    console.error(
      `[${requestId}] [evaluate-submission] Failed to parse request body:`,
    );
    return jsonResponse(400, { error: message });
  }

  try {
    const dbQueryStartTime = Date.now();
    console.log(
      `[${requestId}] [evaluate-submission] Fetching submission context for ID: `,
    );

    const { data: submissionQueryData, error: submissionQueryError } =
      await supabaseClient
        .from("submissions")
        .select(`
        student_id,
        student_membership_id,
        submission_text,
        word_count,
        ai_generated_prompt_text,
        assigned_prompts ( prompt_text ),
        exam_task_types!inner (
          id,
          name,
          exam_types!inner (
            id,
            name,
            max_score
          ),
          levels!inner (
            id,
            name
          )
        ),
        academy_memberships:academy_memberships!inner (
          academy_id,
          status,
          user_id
        )
      `)
        .eq("id", submissionId)
        .single<SubmissionContextRow>();

    if (submissionQueryError) {
      console.error(
        `[${requestId}] [evaluate-submission] DB Error fetching submission data:`,
      );
      throw new Error(
        `DB Error fetching submission data: ${submissionQueryError.message}`,
      );
    }

    if (!submissionQueryData) {
      console.warn(
        `[${requestId}] [evaluate-submission] Submission not found for ID: `,
      );
      return jsonResponse(404, { error: "Submission not found." });
    }

    const taskTypeDetails = getFirstRelation(
      submissionQueryData.exam_task_types,
    );
    const examDetails = taskTypeDetails
      ? getFirstRelation(taskTypeDetails.exam_types)
      : null;
    const levelDetails = taskTypeDetails
      ? getFirstRelation(taskTypeDetails.levels)
      : null;
    if (!taskTypeDetails || !examDetails || !levelDetails) {
      console.warn(
        `[${requestId}] [evaluate-submission] Submission or critical task details not found for ID: `,
      );
      return jsonResponse(404, {
        error: "Submission or its associated task details not found.",
      });
    }

    const studentMembershipId = normalizeBigintId(
      submissionQueryData.student_membership_id,
    );
    const membershipRecord = getFirstRelation(
      submissionQueryData.academy_memberships,
    );

    if (!membershipRecord || studentMembershipId === null) {
      console.error(
        `[${requestId}] [evaluate-submission] Submission  is missing membership context.`,
      );
      return jsonResponse(500, {
        error: "Submission is missing membership context.",
      });
    }

    const membershipUserId = typeof membershipRecord.user_id === "string"
      ? membershipRecord.user_id
      : null;
    const membershipStatus = typeof membershipRecord.status === "string"
      ? membershipRecord.status
      : null;

    if (!membershipUserId) {
      console.warn(
        `[${requestId}] [evaluate-submission] Submission  belongs to an unclaimed membership.`,
      );
      return jsonResponse(409, {
        error: "Submission membership is not claimed.",
      });
    }

    if (!membershipStatus) {
      console.error(
        `[${requestId}] [evaluate-submission] Submission  has invalid membership status.`,
        membershipRecord.status,
      );
      return jsonResponse(500, {
        error: "Submission has invalid membership status.",
      });
    }

    const isOwner = membershipUserId === userId;
    const isPlatformAdmin = resolvedRole === "platform_owner" ||
      resolvedRole === "super_admin";
    const isStaff = isPlatformAdmin || resolvedRole === "teacher" ||
      resolvedRole === "academy_admin";
    const isMembershipActive = membershipStatus === "active";
    const studentAcademyId = normalizeBigintId(membershipRecord.academy_id);

    if (membershipRecord.academy_id != null && studentAcademyId === null) {
      console.warn(
        `[${requestId}] [evaluate-submission] Student membership academy id is not numeric:`,
      );
    }

    if (!isMembershipActive && !isPlatformAdmin) {
      console.warn(
        `[${requestId}] [evaluate-submission] Submission  has inactive membership.`,
        { membershipStatus },
      );
      return jsonResponse(403, {
        error: "Submission membership is not active.",
      });
    }

    if (!isOwner) {
      if (!isStaff) {
        console.warn(
          `[${requestId}] [evaluate-submission] User  attempted to evaluate submission  without ownership.`,
        );
        return jsonResponse(403, {
          error: "You are not allowed to evaluate this submission.",
        });
      }
      if (
        !isPlatformAdmin &&
        (resolvedAcademyId === null || studentAcademyId === null ||
          resolvedAcademyId !== studentAcademyId)
      ) {
        console.warn(
          `[${requestId}] [evaluate-submission] Staff academy mismatch. Staff academy=, student academy=.`,
        );
        return jsonResponse(403, {
          error:
            "You are not allowed to evaluate submissions from another academy.",
        });
      }
    }

    const originalPromptText = submissionQueryData.ai_generated_prompt_text ||
      getFirstRelation(submissionQueryData.assigned_prompts)?.prompt_text ||
      "[Original Task Prompt Information Unavailable]";

    const rawSubmissionText = submissionQueryData.submission_text;
    const submissionText = rawSubmissionText ?? "";
    const dbWordCount = typeof submissionQueryData.word_count === "number"
      ? submissionQueryData.word_count
      : null;
    const computedWordCount = computeWordCountFromText(rawSubmissionText);
    const resolvedWordCount = computedWordCount ??
      (dbWordCount !== null && dbWordCount > 0 ? dbWordCount : null);

    const promptContextData: EvaluationPromptData = {
      submissionText,
      wordCount: resolvedWordCount ?? (dbWordCount ?? 0),
      originalPromptText,
      taskTypeName: taskTypeDetails.name,
      examName: examDetails.name,
      levelName: levelDetails.name,
      maxScore: examDetails.max_score ?? 5,
      criteria: [],
      descriptors: [],
    };
    console.log(
      `[${requestId}] [evaluate-submission] Evaluation context resolved.`,
    );

    const submissionTextHash = hashText(submissionText);
    let bypassCache = forceEvaluation || isFixtureRequest;
    let cachedEvaluation: EvaluationRow | null = null;

    if (!bypassCache || (requestedForce && resolvedRole === "student")) {
      const { data: evaluationRow, error: evaluationError } =
        await supabaseClient
          .from("evaluations")
          .select(
            "ai_overall_score, ai_criteria_evaluation, ai_overall_commentary, ai_mistakes_summary, ai_mistakes_status, ai_mistakes_error, ai_mistakes_items_v2, ai_mistakes_metrics_v2",
          )
          .eq("submission_id", submissionId)
          .maybeSingle<EvaluationRow>();

      if (evaluationError) {
        console.warn(
          `[${requestId}] [evaluate-submission] Unable to read cached evaluation.`,
        );
      } else {
        cachedEvaluation = evaluationRow ?? null;
      }
    }

    const cachedMetrics = parseCachedMetrics(
      cachedEvaluation?.ai_mistakes_metrics_v2,
    );
    const hasCachedItems = Array.isArray(
      cachedEvaluation?.ai_mistakes_items_v2,
    );
    const hasCachedEvaluation =
      typeof cachedEvaluation?.ai_overall_score === "string" &&
      Array.isArray(cachedEvaluation?.ai_criteria_evaluation) &&
      typeof cachedEvaluation?.ai_overall_commentary === "string";

    const cachedEvaluationPayload = hasCachedEvaluation && cachedEvaluation
      ? {
        overallScore: cachedEvaluation.ai_overall_score ?? "",
        criteriaEvaluation: cachedEvaluation.ai_criteria_evaluation ?? [],
        overallCommentary: cachedEvaluation.ai_overall_commentary ?? "",
      }
      : null;

    const studentForceAllowed = requestedForce &&
      resolvedRole === "student" &&
      cachedEvaluationPayload !== null &&
      cachedEvaluation !== null &&
      hasCachedMistakesWarnings(cachedEvaluation);

    const preserveEvaluation = studentForceAllowed
      ? cachedEvaluationPayload
      : null;

    if (studentForceAllowed) {
      console.log(
        `[${requestId}] [evaluate-submission] Student requested force; regenerating mistakes analysis while preserving evaluation.`,
      );
      bypassCache = true;
    }

    if (
      !bypassCache &&
      cachedEvaluation &&
      cachedEvaluation.ai_mistakes_status === "completed" &&
      hasCachedItems &&
      hasCachedEvaluation &&
      cachedMetrics.resolverVersion === 2 &&
      isSubmissionTextUnchanged(
        cachedMetrics,
        submissionText,
        resolvedWordCount,
      )
    ) {
      console.log(
        `[${requestId}] [evaluate-submission] Reusing cached v2 mistakes (resolverVersion=2).`,
      );

      const cachedItems = cachedEvaluation
        .ai_mistakes_items_v2 as NormalizedMistakeV2Item[];
      const cachedSummary = isPlainRecord(cachedEvaluation.ai_mistakes_summary)
        ? cachedEvaluation.ai_mistakes_summary
        : { byCategory: {}, byTag: {} };
      const cachedMetricsRecord =
        isPlainRecord(cachedEvaluation.ai_mistakes_metrics_v2)
          ? cachedEvaluation.ai_mistakes_metrics_v2
          : null;
      const fallbackCounts = countAnchorResolutionStatuses(cachedItems);
      const fallbackMetrics: NormalizedMistakesV2Result["metrics"] = {
        total: cachedItems.length,
        anchored: fallbackCounts.anchored,
        ambiguous: fallbackCounts.ambiguous,
        not_found: fallbackCounts.notFound,
        invalid: fallbackCounts.invalid,
        resolverDurationMs: 0,
        resolverVersion: 2,
      };
      const publicCachedMetrics = toPublicMistakesV2Metrics(
        cachedMetricsRecord,
        fallbackMetrics,
      );

      const cachedNormalized: NormalizedMistakesV2Result = {
        items: cachedItems,
        summary: cachedSummary as NormalizedMistakesV2Result["summary"],
        metrics: publicCachedMetrics,
      };

      return jsonResponse(200, {
        message: "Evaluation completed successfully.",
        evaluation: {
          overallScore: cachedEvaluation.ai_overall_score ?? "",
          criteriaEvaluation: cachedEvaluation.ai_criteria_evaluation ?? [],
          overallCommentary: cachedEvaluation.ai_overall_commentary ?? "",
        },
        mistakes: mapMistakesForResponse(
          cachedNormalized,
          submissionText,
          includeDebugMetrics ? cachedMetricsRecord : null,
        ),
        mistakesStatus: "completed",
        mistakesError: cachedEvaluation.ai_mistakes_error ?? null,
      });
    }

    if (!isFixtureRequest) {
      const academyRateKey = resolvedAcademyId ?? "platform";
      const rateLimitResults = await Promise.all([
        enforceRateLimit(["evaluate-submission", "user", userId], {
          maxRequests: USER_RATE_LIMIT_MAX,
          windowMs: USER_RATE_LIMIT_WINDOW_MS,
        }),
        enforceRateLimit(["evaluate-submission", "academy", academyRateKey], {
          maxRequests: ACADEMY_RATE_LIMIT_MAX,
          windowMs: ACADEMY_RATE_LIMIT_WINDOW_MS,
        }),
        ...(forceEvaluation || studentForceAllowed
          ? [
            enforceRateLimit(["evaluate-submission", "force", userId], {
              maxRequests: FORCE_RATE_LIMIT_MAX,
              windowMs: FORCE_RATE_LIMIT_WINDOW_MS,
            }),
          ]
          : []),
      ]);

      rateLimitResults.forEach(assertRateLimit);
    }

    const taskTypeId = taskTypeDetails.id;
    const { data: criteriaLinks, error: criteriaLinksError } =
      await supabaseClient
        .from("task_criteria_link")
        .select("criterion_id")
        .eq("task_type_id", taskTypeId);

    if (criteriaLinksError) {
      throw new Error(
        `DB Error fetching criteria links: ${criteriaLinksError.message}`,
      );
    }
    if (!criteriaLinks || criteriaLinks.length === 0) {
      throw new Error(
        `No evaluation criteria are linked to task_type_id: ${taskTypeId}.`,
      );
    }

    const criteriaIds = criteriaLinks.map((link) => link.criterion_id);
    const { data: fetchedCriteria, error: criteriaError } = await supabaseClient
      .from("evaluation_criteria")
      .select("id, name, description, criterion_code")
      .in("id", criteriaIds);

    if (criteriaError) {
      throw new Error(
        `DB Error fetching criteria details: ${criteriaError.message}`,
      );
    }
    if (!fetchedCriteria || fetchedCriteria.length === 0) {
      throw new Error("Evaluation criteria details could not be fetched.");
    }
    const criteriaById = new Map<number, EvaluationCriterionRow>(
      fetchedCriteria.map((criterion) => [criterion.id, criterion]),
    );
    const orderedCriteria: EvaluationCriterionRow[] = [];
    for (const criterionId of criteriaIds) {
      const criterion = criteriaById.get(criterionId);
      if (!criterion) {
        console.error(
          `[${requestId}] [evaluate-submission] Missing evaluation criterion details.`,
        );
        continue;
      }
      orderedCriteria.push(criterion);
    }

    if (orderedCriteria.length !== criteriaIds.length) {
      throw new Error(
        "Mismatch between linked evaluation criteria and fetched records.",
      );
    }

    promptContextData.criteria = orderedCriteria;
    console.log(
      `[${requestId}] [evaluate-submission] Fetched ${promptContextData.criteria.length} criteria.`,
    );

    const examTypeId = examDetails.id;
    const levelId = levelDetails.id;
    const { data: descriptorData, error: descriptorError } =
      await supabaseClient
        .from("band_descriptors")
        .select(
          `score, descriptor_text, criterion: evaluation_criteria!inner (name)`,
        )
        .eq("exam_type_id", examTypeId)
        .eq("level_id", levelId)
        .in("criterion_id", criteriaIds);

    if (descriptorError) {
      console.warn(
        `[${requestId}] [evaluate-submission] Warning: DB Error fetching band descriptors: `,
      );
    }

    promptContextData.descriptors = (descriptorData ?? [])
      .map((descriptor) => {
        const criterionName = getFirstRelation(descriptor.criterion)?.name;
        if (!criterionName) {
          return null;
        }

        const rawScore = descriptor.score;
        const numericScore = typeof rawScore === "number"
          ? rawScore
          : Number.parseFloat(rawScore);
        if (!Number.isFinite(numericScore)) {
          console.warn(
            `[${requestId}] [evaluate-submission] Ignoring descriptor with invalid score value.`,
          );
          return null;
        }

        return {
          criterion_name: criterionName,
          score: numericScore,
          descriptor_text: descriptor.descriptor_text,
        };
      })
      .filter((
        descriptor,
      ): descriptor is EvaluationPromptData["descriptors"][number] =>
        descriptor !== null
      );
    promptContextData.descriptors.sort((a, b) => a.score - b.score);
    const descriptorQueryDurationMs = Date.now() - dbQueryStartTime;
    const descriptorCount = promptContextData.descriptors.length;
    console.log(
      `[${requestId}] [evaluate-submission] Band descriptors fetched.`,
      {
        descriptor_count: descriptorCount,
        duration_ms: descriptorQueryDurationMs,
      },
    );

    const [
      { data: errorCategories, error: categoryError },
      { data: errorTags, error: tagError },
    ] = await Promise.all([
      supabaseClient
        .from("error_categories")
        .select("id, code")
        .returns<ErrorCategoryRow[]>(),
      supabaseClient
        .from("error_tags")
        .select("id, code, category_id")
        .returns<ErrorTagRow[]>(),
    ]);

    if (categoryError) {
      throw new Error(
        `DB Error fetching error categories: ${categoryError.message}`,
      );
    }
    if (tagError) {
      throw new Error(`DB Error fetching error tags: ${tagError.message}`);
    }
    if (!errorCategories || errorCategories.length === 0) {
      throw new Error("Error categories catalog is empty.");
    }
    if (!errorTags || errorTags.length === 0) {
      throw new Error("Error tags catalog is empty.");
    }

    const categoriesByCode = new Map<string, ErrorCategoryRow>(
      errorCategories.map((entry) => [entry.code.toUpperCase(), entry]),
    );
    const tagsByCode = new Map<string, ErrorTagRow>(
      errorTags.map((entry) => [entry.code.toUpperCase(), entry]),
    );

    const evalPrompt = buildEvaluationPrompt(promptContextData);
    console.log(
      `[${requestId}] [evaluate-submission] Evaluation instructions prepared.`,
    );

    if (requestedModelName && !isFixtureRequest) {
      console.warn(
        `[${requestId}] [evaluate-submission] Ignoring modelName override outside dev project.`,
      );
    }

    const fixtureResponse = buildDevE2eFixtureResponse({
      requestedModelName,
      criteria: promptContextData.criteria,
      submissionText: promptContextData.submissionText,
    });

    let parsedResponse: EvaluationResponsesPayload;
    let aiCallDuration = 0;
    let responseUsage: TokenUsage | null = null;

    if (fixtureResponse) {
      console.log(
        `[${requestId}] [evaluate-submission] Using dev E2E fixture response.`,
      );
      parsedResponse = parseEvaluationResponsesPayload(fixtureResponse);
    } else {
      console.log(
        `[${requestId}] [evaluate-submission] Calling OpenAI Responses for evaluation.`,
      );
      const responsesClient = createOpenAIResponsesClientFromEnv();
      const responseResult = await responsesClient.generate({
        instructions: evalPrompt.systemPrompt,
        input: [{ role: "user", content: evalPrompt.userPrompt }],
        schemaName: "exameny_evaluation_v1",
        schema: EVALUATION_RESPONSES_JSON_SCHEMA,
        parse: parseEvaluationResponsesPayload,
        reasoningEffort: "high",
        maxOutputTokens: 8_000,
        timeoutMs: 60_000,
      });

      aiCallDuration = responseResult.latencyMs;
      responseUsage = responseResult.usage;

      switch (responseResult.kind) {
        case "completed":
          parsedResponse = responseResult.data;
          break;
        case "incomplete":
          throw Object.assign(
            new Error(`AI response was incomplete (${responseResult.reason}).`),
            { status: 502, code: "OPENAI_RESPONSE_INCOMPLETE" },
          );
        case "refusal":
          throw Object.assign(
            new Error("AI declined to evaluate this submission."),
            { status: 422, code: "OPENAI_RESPONSE_REFUSAL" },
          );
        case "failed": {
          const status = responseResult.code === "rate_limited"
            ? 429
            : responseResult.code === "timeout"
            ? 504
            : 502;
          throw Object.assign(
            new Error(`AI evaluation failed (${responseResult.code}).`),
            { status, code: responseResult.code },
          );
        }
      }
    }

    const unexpectedRootKeysCount = 0;
    const strictSchemaOk = true;

    const expectedCriteriaNames = promptContextData.criteria.map((criterion) =>
      criterion.name
    );
    let evaluationResult: AiEvaluationResult;

    if (preserveEvaluation) {
      evaluationResult = preserveEvaluation;
    } else {
      const evaluationParse = evaluationSchema.safeParse(
        parsedResponse.evaluation,
      );
      if (!evaluationParse.success) {
        console.error(
          `[${requestId}] [evaluate-submission] Evaluation payload failed schema validation.`,
        );
        throw new Error("AI evaluation payload failed validation.");
      }

      const rawEvaluation = evaluationParse.data;
      if (!isValidEvaluationResult(rawEvaluation, expectedCriteriaNames)) {
        console.error(
          `[${requestId}] [evaluate-submission] Evaluation payload failed validation.`,
        );
        throw new Error("AI evaluation payload failed validation.");
      }
      evaluationResult = rawEvaluation;
    }

    const normalizedEvaluationResult: AiEvaluationResult = {
      ...evaluationResult,
      overallScore: formatScoreFractionText(evaluationResult.overallScore),
      criteriaEvaluation: evaluationResult.criteriaEvaluation.map((item) => ({
        ...item,
        score: formatScoreFractionText(item.score),
      })),
    };

    let normalizedMistakes: NormalizedMistakesV2Result | null = null;
    let mistakesStatus: "completed" | "failed" = "completed";
    let mistakesErrorMessage: string | null = null;
    let metricsV2Payload: Record<string, unknown> | null = null;

    try {
      normalizedMistakes = normalizeMistakesPayloadV2(parsedResponse.mistakes, {
        submissionText: promptContextData.submissionText,
        categoriesByCode,
        tagsByCode,
      });

      metricsV2Payload = {
        ...normalizedMistakes.metrics,
        strict_schema_ok: strictSchemaOk,
        unexpected_root_keys_count: unexpectedRootKeysCount,
        model_name: OPENAI_RESPONSES_MODEL,
        tokens: responseUsage,
        ai_call_duration_ms: aiCallDuration,
        submission_word_count: resolvedWordCount ?? null,
        submission_char_count: promptContextData.submissionText.length,
        submission_text_hash: submissionTextHash,
      };

      const resolverTotal = normalizedMistakes.metrics.total;
      const resolverAnchoredCount = normalizedMistakes.metrics.anchored;
      const resolverAmbiguousCount = normalizedMistakes.metrics.ambiguous;
      const resolverNotFoundCount = normalizedMistakes.metrics.not_found;
      const resolverInvalidCount = normalizedMistakes.metrics.invalid;
      const resolverDurationMs = normalizedMistakes.metrics.resolverDurationMs;
      const aiCallDurationMs = aiCallDuration;
      console.log(`[${requestId}] [evaluate-submission][mistakes_v2]`, {
        resolver_total: resolverTotal,
        resolver_anchored_count: resolverAnchoredCount,
        resolver_ambiguous_count: resolverAmbiguousCount,
        resolver_not_found_count: resolverNotFoundCount,
        resolver_invalid_count: resolverInvalidCount,
        resolver_duration_ms: resolverDurationMs,
        resolver_version: normalizedMistakes.metrics.resolverVersion,
        unexpected_root_keys_count: unexpectedRootKeysCount,
        model_name: OPENAI_RESPONSES_MODEL,
        ai_call_duration_ms: aiCallDurationMs,
        submission_word_count: metricsV2Payload.submission_word_count ?? null,
        submission_char_count: metricsV2Payload.submission_char_count ?? null,
      });
    } catch (mistakeError) {
      if (mistakeError instanceof MistakeValidationError) {
        mistakesStatus = "failed";
        mistakesErrorMessage = mistakeError.message;
        normalizedMistakes = null;
        console.warn(
          `[${requestId}] [evaluate-submission] Mistakes normalization failed: `,
        );
      } else {
        throw mistakeError;
      }
    }

    if (
      normalizedMistakes && resolvedWordCount !== null &&
      resolvedWordCount < SHORT_SUBMISSION_WORD_THRESHOLD
    ) {
      const validation = validateShortSubmissionMistakes(
        normalizedMistakes.items.map((item) => ({
          categoryCode: item.category,
          featureTags: item.featureTags,
        })),
        resolvedWordCount,
      );
      if (!validation.ok) {
        console.warn(
          `[${requestId}] [evaluate-submission] Short submission safeguard triggered.`,
          { wordCount: resolvedWordCount },
        );
        metricsV2Payload = appendMetricsWarning(metricsV2Payload, {
          code: "short_submission_policy_violation",
          word_count: resolvedWordCount,
          offending_categories: validation.offendingItems.map((item) =>
            item.categoryCode
          ),
          offending_tags: validation.offendingItems.map((item) =>
            item.featureTags
          ),
        });
      }
    }

    console.log(
      `[${requestId}] [evaluate-submission] AI response parsed successfully. Mistakes status: ${mistakesStatus}.`,
    );

    const evaluationPayload = {
      overallScore: normalizedEvaluationResult.overallScore,
      criteriaEvaluation: normalizedEvaluationResult.criteriaEvaluation,
      overallCommentary: normalizedEvaluationResult.overallCommentary,
    };

    const anchoredMistakes = normalizedMistakes
      ? normalizedMistakes.items
        .map((item) =>
          mapAnchoredMistakeForRpc(item, promptContextData.submissionText)
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
      : [];

    const rpcMistakesPayload = normalizedMistakes
      ? {
        status: "completed",
        items: anchoredMistakes,
        summary: normalizedMistakes.summary,
        items_v2: normalizedMistakes.items,
        metrics_v2: metricsV2Payload ?? normalizedMistakes.metrics,
      }
      : {
        status: "failed",
        items: [],
        summary: { byCategory: {}, byTag: {} },
        error: mistakesErrorMessage,
      };

    console.log(
      `[${requestId}] [evaluate-submission] Saving evaluation and mistakes via RPC 'save_eval_and_mistakes'...`,
    );
    const serviceClient = getServiceRoleClient();
    const { error: rpcError } = await serviceClient.rpc(
      "save_eval_and_mistakes",
      {
        p_submission_id: submissionId,
        p_eval: evaluationPayload,
        p_mistakes: rpcMistakesPayload,
        p_actor_user_id: userId,
        p_actor_academy_id: resolvedAcademyId,
      },
    );

    if (rpcError) {
      console.error(
        `[${requestId}] [evaluate-submission] Error calling RPC 'save_eval_and_mistakes':`,
      );
      throw new Error(
        `Failed to save evaluation results transactionally: ${rpcError.message}`,
      );
    }
    console.log(
      `[${requestId}] [evaluate-submission] Evaluation and mistakes persisted successfully via RPC.`,
    );

    return jsonResponse(200, {
      message: "Evaluation completed successfully.",
      evaluation: normalizedEvaluationResult,
      mistakes: mapMistakesForResponse(
        normalizedMistakes,
        promptContextData.submissionText,
        includeDebugMetrics ? metricsV2Payload : null,
      ),
      mistakesStatus,
      mistakesError: mistakesErrorMessage,
    });
  } catch (error: unknown) {
    const errorRecord = isPlainRecord(error) ? error : null;
    const rawMessage = errorRecord && typeof errorRecord.message === "string"
      ? errorRecord.message
      : error instanceof Error
      ? error.message
      : "Internal Server Error during evaluation.";
    const statusFromRecord =
      errorRecord && typeof errorRecord.status === "number"
        ? errorRecord.status
        : undefined;
    const code = errorRecord && typeof errorRecord.code === "string"
      ? errorRecord.code
      : undefined;
    const fallbackStatus =
      (code === "PGRST116" || rawMessage.includes("not found")) ? 404 : 500;
    const status = statusFromRecord ?? fallbackStatus;

    const normalizedMessage = (() => {
      if (status === 429) {
        return "AI rate limit exceeded. Please try again shortly.";
      }
      const lower = rawMessage.toLowerCase();
      if (
        status === 504 || lower.includes("timeout") ||
        lower.includes("timed out")
      ) {
        return "AI request timed out. Please try again.";
      }
      return rawMessage;
    })();

    if (status === 429 || status === 504) {
      console.warn(
        `[${requestId}] [evaluate-submission] Request failed (${status}):`,
      );
    } else {
      console.error(`[${requestId}] [evaluate-submission] Unhandled error:`);
    }

    return jsonResponse(status, { error: normalizedMessage });
  } finally {
    const durationMs = Date.now() - requestStartTime;
    console.log(
      `[${requestId}] [evaluate-submission] Request ended.`,
      { duration_ms: durationMs },
    );
  }
});
