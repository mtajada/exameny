import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import {
  createOpenAIResponsesClientFromEnv,
  type ResponsesObservation,
  type StrictJsonSchema,
} from "../_shared/openai-responses.ts";
import {
  getCachedPromptTemplate,
  renderPrompt,
} from "../_shared/prompt-loader.ts";
import {
  buildTeacherSkillFocusGatingNote,
  buildTeacherSkillFocusSection,
  buildTeacherThemeSection,
  formatBulletList,
} from "../_shared/prompt-formatters.ts";
import { getLevelGuidance } from "../_shared/ruoe-layout-config.ts";
import {
  getWritingPromptDetails,
  type WritingPromptDetails,
} from "./metadata.ts";
import { requireAuth } from "../_shared/auth.ts";
import { assertRateLimit, enforceRateLimit } from "../_shared/rate-limit.ts";
import { HttpError, isHttpError } from "../_shared/http-errors.ts";
import { normalizeTeacherGuidance } from "../_shared/teacher-guidance.ts";
import { resolveClientIpRateLimitKey } from "../_shared/request-ip.ts";

const PROMPT_TEMPLATE = getCachedPromptTemplate("generate-writing-exercise");

const USER_RATE_LIMIT_MAX = Number(
  Deno.env.get("WRITE_PROMPT_LIMIT_PER_USER") ?? "30",
);
const USER_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("WRITE_PROMPT_LIMIT_USER_WINDOW_MS") ?? (60 * 60 * 1000),
);
const IP_RATE_LIMIT_MAX = Number(
  Deno.env.get("WRITE_PROMPT_LIMIT_PER_IP") ?? "60",
);
const IP_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("WRITE_PROMPT_LIMIT_IP_WINDOW_MS") ?? (60 * 60 * 1000),
);

const ALLOWED_ROLES = new Set([
  "student",
  "teacher",
  "academy_admin",
  "platform_owner",
  "super_admin",
]);
const ALLOWED_ROLES_LIST = Array.from(ALLOWED_ROLES);

interface RequestPayload {
  taskTypeId?: number;
  examId?: number;
  levelId?: number;
  teacherTheme?: unknown;
  teacherSkillFocus?: unknown;
}

interface TaskMetadata {
  taskTypeId: number;
  taskCode: string;
  taskName: string;
  taskDescription: string | null;
  defaultTimeMinutes: number;
  examId: number;
  examCode: string;
  examName: string;
  levelId: number;
  levelCode: string;
  levelName: string;
}

interface AiResponsePayload {
  promptText: string;
  suggestedTimeMinutes: number;
}

const WRITING_RESPONSE_SCHEMA: StrictJsonSchema = {
  type: "object",
  properties: {
    promptText: { type: "string", minLength: 1 },
    suggestedTimeMinutes: { type: "integer", minimum: 1, maximum: 180 },
  },
  required: ["promptText", "suggestedTimeMinutes"],
  additionalProperties: false,
};

function parseWritingResponse(value: unknown): AiResponsePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.promptText !== "string" ||
    record.promptText.trim().length === 0
  ) {
    throw new Error("promptText must be a non-empty string");
  }
  if (
    typeof record.suggestedTimeMinutes !== "number" ||
    !Number.isInteger(record.suggestedTimeMinutes) ||
    record.suggestedTimeMinutes < 1 ||
    record.suggestedTimeMinutes > 180
  ) {
    throw new Error("suggestedTimeMinutes must be an integer from 1 to 180");
  }
  return {
    promptText: record.promptText,
    suggestedTimeMinutes: record.suggestedTimeMinutes,
  };
}

function getFirstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function resolveSuggestedTime(
  defaultMinutes: number,
  aiValue: unknown,
): number {
  if (typeof aiValue === "number" && Number.isFinite(aiValue) && aiValue > 0) {
    return Math.round(aiValue);
  }
  return Math.round(defaultMinutes);
}

function createTraceLogger(requestId: string) {
  return (...args: unknown[]) => {
    const event = typeof args[0] === "string" ? args[0] : "diagnostic_event";
    console.log("[generate-writing-exercise]", {
      request_id: requestId,
      event,
    });
  };
}

async function fetchTaskMetadata(
  client: SupabaseClient,
  traceId: string,
  payload: Required<Pick<RequestPayload, "taskTypeId" | "examId" | "levelId">>,
): Promise<TaskMetadata> {
  const log = createTraceLogger(traceId);
  log("fetchTaskMetadata", payload);

  const { data, error } = await client
    .from("exam_task_types")
    .select(`
      id,
      task_code,
      name,
      description,
      default_time_minutes,
      exam_types!inner(id, code, name),
      levels!inner(id, code, name)
    `)
    .eq("id", payload.taskTypeId)
    .eq("exam_types.id", payload.examId)
    .eq("levels.id", payload.levelId)
    .maybeSingle();

  if (error || !data) {
    log("metadataLookupFailed", error ?? "not found");
    throw new Error("Task metadata not found for the provided context.");
  }

  const examType = getFirstRecord(data.exam_types);
  const level = getFirstRecord(data.levels);

  if (!examType || !level) {
    log("metadataJoinMissing", { examType, level });
    throw new Error("Task metadata join failed for the provided context.");
  }

  return {
    taskTypeId: data.id,
    taskCode: data.task_code,
    taskName: data.name,
    taskDescription: data.description ?? null,
    defaultTimeMinutes: data.default_time_minutes ?? 30,
    examId: examType.id,
    examCode: examType.code,
    examName: examType.name,
    levelId: level.id,
    levelCode: level.code,
    levelName: level.name,
  };
}

function formatTaskRequirements(
  details: WritingPromptDetails["taskDetails"],
): string {
  return formatBulletList(
    details.format_requirements,
    "- Follow standard task conventions for this exam.",
  );
}

function formatKeywords(details: WritingPromptDetails["taskDetails"]): string {
  if (!details.keywords || details.keywords.trim().length === 0) {
    return "No additional keywords emphasised.";
  }
  return details.keywords.trim();
}

serve(async (req: Request): Promise<Response> => {
  const traceId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const log = createTraceLogger(traceId);
  const baseCorsHeaders = createCorsHeaders(req);
  const jsonHeaders = {
    ...baseCorsHeaders,
    "Content-Type": "application/json",
  };
  const respond = (status: number, body: Record<string, unknown>): Response => {
    const payload = { traceId, ...body };
    return new Response(JSON.stringify(payload), {
      status,
      headers: jsonHeaders,
    });
  };

  if (req.method === "OPTIONS") {
    try {
      ensureAllowedOrigin(req);
      return new Response("ok", { headers: baseCorsHeaders });
    } catch (error) {
      if (isHttpError(error)) {
        return new Response(error.message, {
          status: error.status,
          headers: baseCorsHeaders,
        });
      }
      log("preflightError", error);
      return new Response("forbidden", {
        status: 403,
        headers: baseCorsHeaders,
      });
    }
  }

  try {
    ensureAllowedOrigin(req);

    if (req.method !== "POST") {
      return respond(405, { error: "Method not allowed" });
    }

    const authContext = await requireAuth(req, {
      allowedRoles: ALLOWED_ROLES_LIST,
      requireAcademy: true,
      academyOptionalRoles: ["platform_owner", "super_admin"], // platform roles operate without academy linkage
    });

    const requesterRole = authContext.profile.role;
    if (!requesterRole) {
      throw new HttpError(403, "User role missing from profile");
    }
    if (!ALLOWED_ROLES.has(requesterRole)) {
      throw new HttpError(
        403,
        "User does not have permission to generate prompts",
      );
    }

    const ipRateKey = resolveClientIpRateLimitKey(req.headers);

    const [userRate, ipRate] = await Promise.all([
      enforceRateLimit([
        "generate-writing-exercise",
        "user",
        authContext.user.id,
      ], {
        maxRequests: USER_RATE_LIMIT_MAX,
        windowMs: USER_RATE_LIMIT_WINDOW_MS,
      }),
      enforceRateLimit(["generate-writing-exercise", "ip", ipRateKey], {
        maxRequests: IP_RATE_LIMIT_MAX,
        windowMs: IP_RATE_LIMIT_WINDOW_MS,
      }),
    ]);

    assertRateLimit(userRate);
    assertRateLimit(ipRate);

    let requestPayload: RequestPayload;
    try {
      requestPayload = await req.json();
    } catch (error) {
      log("invalidJson", error);
      return respond(400, { error: "Invalid JSON payload" });
    }

    const { taskTypeId, examId, levelId } = requestPayload;

    if (
      !taskTypeId || !examId || !levelId || !Number.isInteger(taskTypeId) ||
      !Number.isInteger(examId) || !Number.isInteger(levelId)
    ) {
      return respond(400, {
        error: "Missing or invalid taskTypeId, examId, or levelId.",
      });
    }

    let teacherGuidance;
    try {
      teacherGuidance = await normalizeTeacherGuidance({
        rawTheme: requestPayload.teacherTheme,
        rawSkillFocus: requestPayload.teacherSkillFocus,
        jsonHeaders,
        traceId,
      });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      throw error;
    }

    log("teacherGuidance", {
      hasTheme: typeof teacherGuidance.theme === "string" &&
        teacherGuidance.theme.length > 0,
      hasSkillFocus: typeof teacherGuidance.skillFocus === "string" &&
        teacherGuidance.skillFocus.length > 0,
    });

    let metadata: TaskMetadata;
    try {
      metadata = await fetchTaskMetadata(authContext.supabase, traceId, {
        taskTypeId,
        examId,
        levelId,
      });
    } catch (error) {
      log("metadataError", error);
      return respond(404, { error: (error as Error).message });
    }

    let promptDetails: WritingPromptDetails;
    try {
      promptDetails = getWritingPromptDetails(
        metadata.examCode,
        metadata.levelCode,
        metadata.taskCode,
      );
    } catch (error) {
      log("promptMetadataError", error);
      return respond(500, { error: (error as Error).message });
    }

    // The public edition intentionally creates from a blank page. Historical
    // or third-party examples are never loaded into the generation context.
    const preparedExamples = {
      jsonList: "[]",
      summary: "No source examples supplied. Create wholly original material.",
    };
    const hasSkillFocus = typeof teacherGuidance.skillFocus === "string" &&
      teacherGuidance.skillFocus.trim().length > 0;
    const skillFocusGoodBullet = hasSkillFocus
      ? "- The prompt’s scenario, input material, and emphasis are consistently shaped by the Skill Focus without revealing it."
      : "";
    const skillFocusPlanningLine = hasSkillFocus
      ? "If Skill Focus is provided, create up to five internal bullets describing how scenario framing, tone/register cues, required content points, and input materials will reinforce the Skill Focus implicitly. "
      : "";
    const skillFocusChecksLine = hasSkillFocus
      ? "If Skill Focus is provided, confirm it is implicitly reflected throughout the prompt language and inputs (entire prompt); never disclose it. "
      : "";

    const tokens = {
      examName: metadata.examName,
      examCode: metadata.examCode,
      levelName: metadata.levelName,
      levelCode: metadata.levelCode,
      taskName: metadata.taskName,
      taskCode: metadata.taskCode,
      taskDescription: metadata.taskDescription ??
        "No additional description provided.",
      defaultTimeMinutes: metadata.defaultTimeMinutes,
      levelGuidance: getLevelGuidance(metadata.levelCode),
      wordCount: promptDetails.taskDetails.word_count ??
        "Follow the product configuration.",
      examInstructions: promptDetails.examInstructions,
      taskRequirements: formatTaskRequirements(promptDetails.taskDetails),
      styleGuidance: promptDetails.taskDetails.style_guidance,
      keywordsGuidance: formatKeywords(promptDetails.taskDetails),
      examplesJsonList: preparedExamples.jsonList,
      examplesSummary: preparedExamples.summary,
      teacherThemeSection: buildTeacherThemeSection(teacherGuidance.theme),
      teacherSkillFocusSection: buildTeacherSkillFocusSection(
        teacherGuidance.skillFocus,
      ),
      teacherSkillFocusGatingNote: buildTeacherSkillFocusGatingNote(
        hasSkillFocus,
      ),
      teacherSkillFocusGoodBullet: skillFocusGoodBullet,
      teacherSkillFocusPlanningLine: skillFocusPlanningLine,
      teacherSkillFocusChecksLine: skillFocusChecksLine,
    };

    const { systemPrompt, userPrompt } = renderPrompt(PROMPT_TEMPLATE, tokens, {
      strict: true,
    });

    const observe = (observation: ResponsesObservation): void => {
      log("openai.responses", observation);
    };
    const aiClient = createOpenAIResponsesClientFromEnv(Deno.env, { observe });

    try {
      const result = await aiClient.generate({
        instructions: systemPrompt,
        input: userPrompt,
        schemaName: "exameny_writing_prompt_v1",
        schema: WRITING_RESPONSE_SCHEMA,
        parse: parseWritingResponse,
        reasoningEffort: hasSkillFocus ? "high" : "medium",
        maxOutputTokens: 1_200,
      });

      if (result.kind === "incomplete") {
        return respond(502, {
          error: `AI response incomplete: ${result.reason}`,
        });
      }
      if (result.kind === "refusal") {
        return respond(422, {
          error: "The requested prompt could not be generated safely.",
        });
      }
      if (result.kind === "failed") {
        if (result.code === "rate_limited") {
          return respond(429, {
            error: "AI rate limit exceeded. Please try again shortly.",
          });
        }
        if (result.code === "timeout") {
          return respond(504, {
            error: "AI request timed out. Please try again.",
          });
        }
        log("aiFailure", { code: result.code, retryable: result.retryable });
        return respond(502, { error: "AI service is currently unavailable." });
      }

      const parsed = result.data;

      const suggestedTime = resolveSuggestedTime(
        metadata.defaultTimeMinutes,
        parsed.suggestedTimeMinutes,
      );

      return respond(200, {
        promptText: parsed.promptText.trim(),
        suggestedTimeMinutes: suggestedTime,
      });
    } catch (rawError) {
      log("aiError", rawError);
      return respond(502, { error: "AI service is currently unavailable." });
    }
  } catch (error) {
    if (isHttpError(error)) {
      return respond(error.status, { error: error.message });
    }
    log("unhandledError", error);
    return respond(500, { error: "Internal server error" });
  }
});

console.log("generate-writing-exercise Edge Function ready");
