import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createOpenAIResponsesClientFromEnv,
  type ResponsesObservation,
} from "./openai-responses.ts";
import { type PromptTemplate, renderPrompt } from "./prompt-loader.ts";
import { HttpError } from "./http-errors.ts";
import { requireAuth, resolveSupabasePublishableKey } from "./auth.ts";
import { getRuoELayoutKey, LAYOUT_TO_FUNCTION } from "./ruoe-layout-map.ts";
import {
  fetchTaskMetadata,
  persistExercise,
  type PersistExerciseParams,
  type TaskMetadataRecord,
  toTaskContext,
  verifyMcqIntegrity,
} from "./ruoe-service.ts";
import type {
  KeyWordTransformationExercise,
  RUoEExercise,
  TaskContext,
} from "./ruoe-types.ts";
import { collectWordWindowViolations } from "./word-window.ts";
import { normalizeTeacherGuidance } from "./teacher-guidance.ts";
import { createCorsHeaders, ensureAllowedOrigin } from "./cors.ts";
import { assertRateLimit, enforceRateLimit } from "./rate-limit.ts";
import { resolveClientIpRateLimitKey } from "./request-ip.ts";
import {
  getRuoeResponseSchema,
  parseRuoeResponse,
} from "./ruoe-response-contract.ts";
import {
  ensureActiveMembershipForAcademy,
  resolveActiveAcademyIdFromMetadata,
} from "./membership-context.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const EXAMENY_SUPABASE_SECRET_KEY = Deno.env.get("EXAMENY_SUPABASE_SECRET_KEY");
const SUPABASE_PUBLISHABLE_KEY = resolveSupabasePublishableKey();

if (
  !SUPABASE_URL || !EXAMENY_SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY
) {
  console.error(
    "[ruoe-handler] Missing required Supabase environment variables (SUPABASE_URL, EXAMENY_SUPABASE_SECRET_KEY, EXAMENY_SUPABASE_PUBLISHABLE_KEY).",
  );
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL!, EXAMENY_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_RATE_LIMIT_MAX = Number(
  Deno.env.get("RUOE_GENERATION_LIMIT_PER_USER") ?? "30",
);
const USER_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("RUOE_GENERATION_LIMIT_USER_WINDOW_MS") ?? (60 * 60 * 1000),
);
const IP_RATE_LIMIT_MAX = Number(
  Deno.env.get("RUOE_GENERATION_LIMIT_PER_IP") ?? "60",
);
const IP_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("RUOE_GENERATION_LIMIT_IP_WINDOW_MS") ?? (60 * 60 * 1000),
);

type CallerRole = "student" | "teacher" | "academy_admin";

interface CallerContext {
  userId: string;
  role: CallerRole;
  academyId: number;
  membershipId: number | null;
  callerSupabase: SupabaseClient;
}

interface RequestPayload {
  taskTypeId?: number;
  teacherTheme?: unknown;
  teacherSkillFocus?: unknown;
  authorId?: string | null;
}

interface RecentTopicsPayload {
  titles: string[];
  hint: string;
}

interface BuildPromptContextArgs<TExample extends RUoEExercise = RUoEExercise> {
  traceId: string;
  metadata: TaskMetadataRecord;
  taskContext: TaskContext;
  guidanceSummary: string;
  teacherTheme: string | null;
  teacherSkillFocus: string | null;
  examples: TExample[];
  recentTopics: RecentTopicsPayload;
}

interface BuildPromptContextResult {
  tokens: Record<string, string | number>;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
}

const CALLER_ROLES: readonly CallerRole[] = [
  "student",
  "teacher",
  "academy_admin",
] as const;

function isCallerRole(value: unknown): value is CallerRole {
  return typeof value === "string" &&
    CALLER_ROLES.some((role) => role === value);
}

export interface RuoEHandlerConfig<
  TExample extends RUoEExercise = RUoEExercise,
> {
  layout: keyof typeof LAYOUT_TO_FUNCTION;
  template: PromptTemplate;
  buildPromptContext: (
    args: BuildPromptContextArgs<TExample>,
  ) => Promise<BuildPromptContextResult> | BuildPromptContextResult;
  defaultTemperature?: number;
  defaultReasoningEffort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
}

interface HandlerSuccessBody {
  success: true;
  exerciseId: number;
  traceId: string;
  message: string;
}

interface HandlerErrorBody {
  success: false;
  error: string;
  traceId: string;
}

type HandlerResponse = HandlerSuccessBody | HandlerErrorBody;

function createLogger(requestId: string) {
  return (...args: unknown[]) => {
    const event = typeof args[0] === "string" ? args[0] : "diagnostic_event";
    console.log("[ruoe-handler]", { request_id: requestId, event });
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type MembershipStatus = "awaiting_login" | "active" | "inactive";

export interface AuthorMembershipRecord {
  id: number;
  status: MembershipStatus;
}

const isMembershipStatus = (value: string): value is MembershipStatus =>
  value === "awaiting_login" || value === "active" || value === "inactive";

const parseAuthorMembershipRecord = (
  value: unknown,
): AuthorMembershipRecord | null => {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = typeof value.id === "number" ? value.id : null;
  const status =
    typeof value.status === "string" && isMembershipStatus(value.status)
      ? value.status
      : null;
  if (id === null || status === null) {
    return null;
  }
  return { id, status };
};

export interface MembershipQueryResult {
  data: AuthorMembershipRecord | null;
  error: unknown | null;
  [key: string]: unknown;
}

export type AuthorMembershipLoader = () => Promise<MembershipQueryResult>;

export async function ensureAuthorHasActiveMembership(
  loadMembership: AuthorMembershipLoader,
): Promise<AuthorMembershipRecord> {
  const { data, error } = await loadMembership();

  if (error !== null) {
    throw new HttpError(500, "Could not validate author membership.", error);
  }

  if (!data || data.status !== "active") {
    throw new HttpError(403, "Author must belong to the same academy.");
  }

  return data;
}

async function resolveCallerContext(
  req: Request,
  traceId: string,
  jsonHeaders: Record<string, string>,
): Promise<CallerContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: "Authentication required.",
        traceId,
      }),
      { status: 401, headers: jsonHeaders },
    );
  }

  try {
    const authContext = await requireAuth(req, {
      allowedRoles: ["student", "teacher", "academy_admin"],
      requireAcademy: true,
    });

    const callerRole = authContext.profile.role;
    if (!isCallerRole(callerRole)) {
      throw new HttpError(403, "Insufficient permissions for this operation.");
    }

    const resolvedAcademyId = resolveActiveAcademyIdFromMetadata(
      authContext.user,
    );
    if (resolvedAcademyId === null) {
      throw new HttpError(
        403,
        "You must belong to an academy to perform this action.",
      );
    }
    const membership = await ensureActiveMembershipForAcademy(
      authContext.supabase,
      authContext.user,
      resolvedAcademyId,
    );

    return {
      userId: authContext.user.id,
      role: callerRole,
      academyId: resolvedAcademyId,
      membershipId: membership.membershipId,
      callerSupabase: authContext.supabase,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw new Response(
        JSON.stringify({ success: false, error: error.message, traceId }),
        { status: error.status ?? 500, headers: jsonHeaders },
      );
    }
    throw error;
  }
}

async function persistValidatedExercise(
  traceId: string,
  metadata: TaskMetadataRecord,
  caller: CallerContext,
  body: RequestPayload,
  exerciseData: unknown,
  jsonHeaders: Record<string, string>,
  teacherTheme: string | null = null,
  teacherSkillFocus: string | null = null,
): Promise<number> {
  const log = createLogger(traceId);

  const { academyId, role, userId, callerSupabase } = caller;
  if (!academyId) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: "Invalid academy context for exercise creation.",
        traceId,
      }),
      { status: 403, headers: jsonHeaders },
    );
  }

  let authorId: string | null = body.authorId ?? null;

  if (role === "student") {
    if (authorId && authorId !== userId) {
      throw new Response(
        JSON.stringify({
          success: false,
          error: "Students can only author exercises for themselves.",
          traceId,
        }),
        { status: 403, headers: jsonHeaders },
      );
    }
    authorId = userId;
  } else {
    authorId = authorId ?? userId;
    if (authorId !== userId) {
      try {
        await ensureAuthorHasActiveMembership(async () => {
          const result = await supabase
            .from("academy_memberships")
            .select("id, status")
            .eq("user_id", authorId)
            .eq("academy_id", academyId)
            .maybeSingle();

          return {
            data: parseAuthorMembershipRecord(result.data),
            error: result.error ?? null,
          };
        });
      } catch (error) {
        if (error instanceof HttpError) {
          if (error.status >= 500) {
            log("authorMembershipLookupError", error.details ?? error);
          }
          throw new Response(
            JSON.stringify({ success: false, error: error.message, traceId }),
            { status: error.status, headers: jsonHeaders },
          );
        }
        throw error;
      }
    }
  }

  let normalizedExerciseData = exerciseData;
  if (
    isPlainObject(exerciseData) &&
    typeof exerciseData.title === "string"
  ) {
    normalizedExerciseData = {
      ...exerciseData,
      title: exerciseData.title.trim(),
    };
  }

  const persistParams: PersistExerciseParams = {
    taskTypeId: metadata.taskTypeId,
    academyId,
    authorId,
    exerciseData: normalizedExerciseData,
    teacherTheme: teacherTheme ?? null,
    teacherSkillFocus: teacherSkillFocus ?? null,
  };

  const exerciseId = await persistExercise(
    callerSupabase,
    persistParams,
    traceId,
  );
  await verifyMcqIntegrity(supabase, metadata.taskCode, exerciseId, traceId);
  log("persistedExercise", { exerciseId });
  return exerciseId;
}

export function createRuoEHandler<TExample extends RUoEExercise = RUoEExercise>(
  config: RuoEHandlerConfig<TExample>,
) {
  return async function handler(req: Request): Promise<Response> {
    const traceId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const log = createLogger(traceId);
    const baseCorsHeaders = createCorsHeaders(req);
    const jsonHeaders = {
      ...baseCorsHeaders,
      "Content-Type": "application/json",
    };
    const respond = (status: number, body: HandlerResponse): Response =>
      new Response(JSON.stringify(body), { status, headers: jsonHeaders });

    if (req.method === "OPTIONS") {
      try {
        ensureAllowedOrigin(req);
        return new Response("ok", { headers: baseCorsHeaders });
      } catch (error) {
        if (error instanceof HttpError) {
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
    } catch (error) {
      if (error instanceof HttpError) {
        return respond(error.status, {
          success: false,
          error: error.message,
          traceId,
        });
      }
      log("originError", error);
      return respond(403, {
        success: false,
        error: "Origin is not allowed",
        traceId,
      });
    }

    if (req.method !== "POST") {
      return respond(405, {
        success: false,
        error: "Method not allowed",
        traceId,
      });
    }

    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch (error) {
      log("invalidJson", error);
      return respond(400, {
        success: false,
        error: "Invalid JSON payload",
        traceId,
      });
    }

    if (!payload.taskTypeId || !Number.isInteger(payload.taskTypeId)) {
      return respond(400, {
        success: false,
        error: "Missing or invalid taskTypeId.",
        traceId,
      });
    }

    let guidance;
    try {
      guidance = await normalizeTeacherGuidance({
        rawTheme: payload.teacherTheme,
        rawSkillFocus: payload.teacherSkillFocus,
        jsonHeaders,
        traceId,
      });
    } catch (response) {
      if (response instanceof Response) {
        return response;
      }
      throw response;
    }

    log("teacherGuidance", guidance.logs.summary);
    log("teacherGuidance.theme", guidance.logs.theme);
    log("teacherGuidance.skillFocus", guidance.logs.skillFocus);
    log("teacherGuidance.combined", guidance.logs.combined);

    let callerContext: CallerContext;
    try {
      callerContext = await resolveCallerContext(req, traceId, jsonHeaders);
    } catch (response) {
      if (response instanceof Response) {
        return response;
      }
      throw response;
    }

    try {
      const ipRateKey = resolveClientIpRateLimitKey(req.headers);

      const [userRate, ipRate] = await Promise.all([
        enforceRateLimit(["generate-ruoe", "user", callerContext.userId], {
          maxRequests: USER_RATE_LIMIT_MAX,
          windowMs: USER_RATE_LIMIT_WINDOW_MS,
        }),
        enforceRateLimit(["generate-ruoe", "ip", ipRateKey], {
          maxRequests: IP_RATE_LIMIT_MAX,
          windowMs: IP_RATE_LIMIT_WINDOW_MS,
        }),
      ]);

      assertRateLimit(userRate);
      assertRateLimit(ipRate);
    } catch (error) {
      if (error instanceof HttpError) {
        return respond(error.status, {
          success: false,
          error: error.message,
          traceId,
        });
      }
      log("rateLimitError", error);
      return respond(503, {
        success: false,
        error: "Rate limiting unavailable at this time",
        traceId,
      });
    }

    let metadata: TaskMetadataRecord;
    try {
      metadata = await fetchTaskMetadata(supabase, payload.taskTypeId, traceId);
    } catch (error) {
      log("metadataError", error);
      return respond(404, {
        success: false,
        error: "Task metadata not found for the provided context.",
        traceId,
      });
    }

    const expectedLayout = config.layout;
    const derivedLayout = getRuoELayoutKey(metadata.taskCode);
    if (derivedLayout !== expectedLayout) {
      log("layoutMismatch", {
        expectedLayout,
        derivedLayout,
        taskCode: metadata.taskCode,
      });
      return respond(400, {
        success: false,
        error:
          `Task code ${metadata.taskCode} does not belong to layout ${expectedLayout}.`,
        traceId,
      });
    }

    const taskContext = toTaskContext(
      metadata,
      guidance.theme,
      guidance.skillFocus,
    );

    const recentTopics: RecentTopicsPayload = {
      titles: [],
      hint: "",
    };

    try {
      const { data, error } = await supabase
        .from("ruoe_exercises")
        .select("title")
        .eq("academy_id", callerContext.academyId)
        .eq("task_type_id", metadata.taskTypeId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) {
        throw error;
      }

      const titles = (data ?? [])
        .map((
          record,
        ) => (typeof record?.title === "string" ? record.title.trim() : ""))
        .filter((title) => title.length > 0);

      if (titles.length > 0) {
        const uniqueTitles: string[] = [];
        for (const title of titles) {
          if (!uniqueTitles.includes(title)) {
            uniqueTitles.push(title);
          }
        }
        recentTopics.titles = uniqueTitles;
        recentTopics.hint = `Recent topics: ${uniqueTitles.join("; ")}.`;
      }
    } catch (error) {
      log("recentTopicsLookupError", error);
    }

    // The public edition never loads historical examples. Generation starts
    // from the clean-room contract and neutral configuration only.
    const examples: TExample[] = [];

    let promptContext: BuildPromptContextResult;
    try {
      promptContext = await config.buildPromptContext({
        traceId,
        metadata,
        taskContext,
        guidanceSummary: guidance.logs.combined,
        teacherTheme: guidance.theme,
        teacherSkillFocus: guidance.skillFocus,
        examples,
        recentTopics,
      });
    } catch (error) {
      log("promptContextError", error);
      return respond(500, {
        success: false,
        error: "Failed to build AI prompt.",
        traceId,
      });
    }

    const hasTheme = typeof guidance.theme === "string" &&
      guidance.theme.trim().length > 0;
    const hasSkillFocus = typeof guidance.skillFocus === "string" &&
      guidance.skillFocus.trim().length > 0;
    const gatingNote =
      typeof promptContext.tokens.teacherSkillFocusGatingNote === "string"
        ? promptContext.tokens.teacherSkillFocusGatingNote
        : "";
    const themeGatingNote =
      typeof promptContext.tokens.teacherThemeGatingNote === "string"
        ? promptContext.tokens.teacherThemeGatingNote
        : "";
    log("guidanceFlags", {
      hasTheme,
      hasSkillFocus,
      themeGatingNoteApplied: themeGatingNote.length > 0,
      skillFocusGatingNoteApplied: gatingNote.length > 0,
    });

    let systemPrompt: string;
    let userPrompt: string;
    try {
      const rendered = renderPrompt(config.template, promptContext.tokens, {
        strict: true,
      });
      systemPrompt = rendered.systemPrompt;
      userPrompt = rendered.userPrompt;
    } catch (error) {
      log("templateRenderError", error);
      return respond(500, {
        success: false,
        error: "Prompt template rendering failed.",
        traceId,
      });
    }

    const observe = (observation: ResponsesObservation): void => {
      log("openai.responses", observation);
    };
    const aiClient = createOpenAIResponsesClientFromEnv(Deno.env, { observe });

    try {
      const result = await aiClient.generate({
        instructions: systemPrompt,
        input: userPrompt,
        schemaName: `exameny_${config.layout.replaceAll("-", "_")}_v1`,
        schema: getRuoeResponseSchema(config.layout),
        parse: (value) => parseRuoeResponse(metadata.taskCode, value),
        reasoningEffort: promptContext.reasoningEffort ??
          config.defaultReasoningEffort ?? "medium",
        maxOutputTokens: promptContext.maxOutputTokens ??
          config.maxOutputTokens ?? 8_000,
      });

      if (result.kind === "incomplete") {
        return respond(502, {
          success: false,
          error: `AI response incomplete: ${result.reason}`,
          traceId,
        });
      }
      if (result.kind === "refusal") {
        return respond(422, {
          success: false,
          error: "The requested exercise could not be generated safely.",
          traceId,
        });
      }
      if (result.kind === "failed") {
        if (result.code === "rate_limited") {
          return respond(429, {
            success: false,
            error: "AI rate limit exceeded. Please try again shortly.",
            traceId,
          });
        }
        if (result.code === "timeout") {
          return respond(504, {
            success: false,
            error: "AI request timed out. Please try again.",
            traceId,
          });
        }
        log("aiFailure", { code: result.code, retryable: result.retryable });
        return respond(502, {
          success: false,
          error: "AI response did not satisfy the exercise contract.",
          traceId,
        });
      }

      const exerciseData = result.data;
      const isKeywordTransformation = typeof metadata.taskCode === "string" &&
        metadata.taskCode.toUpperCase().endsWith("_LANG_TRANSFORMATION");
      if (isKeywordTransformation) {
        const levelCode = metadata.level?.code ?? null;
        const violations = collectWordWindowViolations(
          exerciseData as KeyWordTransformationExercise,
          levelCode,
        );
        if (violations.length > 0) {
          log("wordWindowFailure", { count: violations.length });
          return respond(502, {
            success: false,
            error: "AI response failed the word-window contract.",
            traceId,
          });
        }
      }

      const exerciseId = await persistValidatedExercise(
        traceId,
        metadata,
        callerContext,
        payload,
        exerciseData,
        jsonHeaders,
        guidance.theme,
        guidance.skillFocus,
      );
      const message =
        `R&UoE exercise created successfully for ${metadata.taskName}`;
      return respond(200, { success: true, exerciseId, message, traceId });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      console.error("[ruoe-handler] Unhandled error");
      return respond(502, {
        success: false,
        error: "AI service is currently unavailable.",
        traceId,
      });
    }
  };
}
