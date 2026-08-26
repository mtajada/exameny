// supabase/functions/get-chat-assistance/index.ts

// --- Imports & Bootstrap ---
import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as cors from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import type { AuthContext } from "../_shared/auth.ts";
import {
  createOpenAIResponsesClientFromEnv,
  type ResponseInputMessage,
} from "../_shared/openai-responses.ts";
import { assertRateLimit, enforceRateLimit } from "../_shared/rate-limit.ts";
import { resolveClientIpRateLimitKey } from "../_shared/request-ip.ts";
import { HttpError, isHttpError } from "../_shared/http-errors.ts";
import {
  type AssistanceIntent,
  buildRuoESystemPrompt,
  buildRuoEUserPrompt,
  buildUntrustedConversationHistory,
  buildWritingUserPrompt,
  SYSTEM_PROMPT_WRITING,
} from "./prompt.ts";
import { createChatAssistanceResponse } from "./ai.ts";
import {
  ensureActiveMembershipForAcademy,
  resolveActiveAcademyIdFromMetadata,
} from "../_shared/membership-context.ts";

const USER_RATE_LIMIT_MAX = Number(
  Deno.env.get("CHAT_ASSIST_LIMIT_PER_USER") ?? "100",
);
const USER_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("CHAT_ASSIST_LIMIT_USER_WINDOW_MS") ?? (60 * 60 * 1000),
);
const IP_RATE_LIMIT_MAX = Number(
  Deno.env.get("CHAT_ASSIST_LIMIT_PER_IP") ?? "120",
);
const IP_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("CHAT_ASSIST_LIMIT_IP_WINDOW_MS") ?? (60 * 60 * 1000),
);

const ALLOWED_ROLES = new Set([
  "student",
  "teacher",
  "academy_admin",
  "platform_owner",
  "super_admin",
]);
const PRIVILEGED_ROLES = new Set([
  "teacher",
  "academy_admin",
  "platform_owner",
  "super_admin",
]);
const ALLOWED_ROLES_LIST = Array.from(ALLOWED_ROLES);

// --- Interfaces ---
interface ConversationMessage {
  role: "user" | "model" | "assistant";
  parts: Array<{ text: string }>;
}

interface RuoEContext {
  exerciseId: number;
  exerciseTitle: string;
  exerciseContent: string;
  taskType: string;
  taskTypeName: string;
  examType: number;
  levelId: number;
  allQuestions: Array<{
    id: number;
    order: number;
    questionText: string | null;
    correctAnswers: string[];
    explanation: string | null;
  }>;
  allOptions: Array<{
    id: number;
    questionId: number;
    letter: string;
    text: string;
    isCorrect: boolean;
    feedback: string | null;
  }>;
  isEvaluated: boolean;
  attemptId: number;
  totalQuestions: number;
  answeredQuestions: number;
  currentQuestion?: {
    id: number;
    order: number;
    questionText: string | null;
    userAnswer: string | null;
  } | null;
  userAnswers: Record<number, string>;
  evaluationResults?: Record<number, boolean>;
  correctAnswersData?: Record<number, string[]>;
  explanations?: Record<number, string>;
  score?: number;
  maxScore?: number;
}

interface RequestPayload {
  userQuery: string;
  currentDraftText?: string;
  originalPromptText?: string;
  taskTypeId: number;
  examId: number;
  levelId: number;
  conversationHistory?: ConversationMessage[];
  ruoeContext?: RuoEContext;
  assistanceIntent?: AssistanceIntent;
}

interface TaskMetadata {
  examName: string;
  levelName: string;
  taskTypeName: string;
}

interface Criterion {
  name: string;
  description?: string | null;
}

interface Descriptor {
  criterion_name: string;
  score: number;
  descriptor_text: string;
}

type SupabaseRelationValue<T> = T | T[] | null | undefined;

function normalizeRelationValue<T>(value: SupabaseRelationValue<T>): T | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry != null) {
        return entry;
      }
    }
    return null;
  }
  return value ?? null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function determineAssistanceIntent(
  value: unknown,
  ctx?: RuoEContext | null,
): AssistanceIntent {
  if (value === "ruoe_clarification" && ctx?.isEvaluated) {
    return "ruoe_clarification";
  }
  return "general";
}

function coerceCriterion(value: unknown): Criterion | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = coerceCriterion(entry);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { name?: unknown; description?: unknown };
  const name = toStringOrNull(record.name);
  if (!name) {
    return null;
  }

  const rawDescription = record.description;
  let description: string | null = null;
  if (typeof rawDescription === "string") {
    description = rawDescription;
  }

  return { name, description };
}

// --- Helpers ---

const PARAGRAPH_KEYWORDS = [
  "paragraph",
  "para",
  "párrafo",
  "parrafo",
  "section",
  "sección",
  "seccion",
];
const QUESTION_KEYWORDS = [
  "question",
  "gap",
  "blank",
  "item",
  "hueco",
  "pregunta",
];

const ORDINAL_WORD_TO_NUMBER: Record<string, number> = {
  // English
  first: 1,
  one: 1,
  "1st": 1,
  second: 2,
  two: 2,
  "2nd": 2,
  third: 3,
  three: 3,
  "3rd": 3,
  fourth: 4,
  four: 4,
  "4th": 4,
  fifth: 5,
  five: 5,
  "5th": 5,
  sixth: 6,
  six: 6,
  "6th": 6,
  seventh: 7,
  seven: 7,
  "7th": 7,
  eighth: 8,
  eight: 8,
  "8th": 8,
  ninth: 9,
  nine: 9,
  "9th": 9,
  tenth: 10,
  ten: 10,
  "10th": 10,
  eleventh: 11,
  eleven: 11,
  "11th": 11,
  twelfth: 12,
  twelve: 12,
  "12th": 12,
  // Spanish (accents removed later)
  primer: 1,
  primera: 1,
  primero: 1,
  uno: 1,
  segunda: 2,
  segundo: 2,
  dos: 2,
  tercera: 3,
  tercero: 3,
  tres: 3,
  cuarta: 4,
  cuarto: 4,
  cuatro: 4,
  quinta: 5,
  quinto: 5,
  cinco: 5,
  sexta: 6,
  sexto: 6,
  seis: 6,
  séptima: 7,
  septima: 7,
  séptimo: 7,
  septimo: 7,
  siete: 7,
  octava: 8,
  octavo: 8,
  ocho: 8,
  novena: 9,
  noveno: 9,
  nueve: 9,
  décima: 10,
  decima: 10,
  décimo: 10,
  decimo: 10,
  diez: 10,
  undécima: 11,
  undecima: 11,
  undécimo: 11,
  undecimo: 11,
  once: 11,
  duodécima: 12,
  duodecima: 12,
  duodécimo: 12,
  duodecimo: 12,
  doce: 12,
};

const ORDINAL_PATTERN = Object.keys(ORDINAL_WORD_TO_NUMBER)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

interface FocusSignals {
  paragraphs: number[];
  questions: number[];
  intents: string[];
}

function extractFocusSignals(text: string): FocusSignals {
  if (!text) {
    return { paragraphs: [], questions: [], intents: [] };
  }

  const paragraphs = collectIndices(text, PARAGRAPH_KEYWORDS);
  const questions = collectIndices(text, QUESTION_KEYWORDS);

  const intents: string[] = [];
  if (
    /(explain|summary|summarize|clarify|understand|meaning|para?phrase|overview|simple terms|simplify)/i
      .test(text)
  ) {
    intents.push("explanation / paraphrasing request");
  }
  if (/(compare|difference|relate|contrast)/i.test(text)) {
    intents.push("comparison request");
  }

  return { paragraphs, questions, intents };
}

function collectIndices(text: string, keywords: string[]): number[] {
  const results = new Set<number>();
  const lower = text.toLowerCase();

  keywords.forEach((keyword) => {
    const escapedKeyword = escapeRegExp(keyword.toLowerCase());
    const pattern =
      `${escapedKeyword}\\s*(?:\\(|#|n[°º.-]?|:)?\\s*(\\d{1,2}|${ORDINAL_PATTERN})`;
    const regex = new RegExp(pattern, "giu");

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lower)) !== null) {
      const raw = removeDiacritics(match[1]);
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        results.add(numeric);
        continue;
      }
      const mapped = ORDINAL_WORD_TO_NUMBER[raw] ??
        ORDINAL_WORD_TO_NUMBER[raw.replace(/s$/, "")];
      if (mapped) {
        results.add(mapped);
      }
    }
  });

  return Array.from(results).filter((n) => n > 0 && Number.isFinite(n)).sort((
    a,
    b,
  ) => a - b);
}

function detectRequestedFocus(
  userQuery: string,
  ruoeContext?: RuoEContext | null,
  conversationHistory?: ConversationMessage[] | null,
): string | null {
  const primarySignals = extractFocusSignals(userQuery);
  if (!isSignalsEmpty(primarySignals)) {
    return summariseFocus(primarySignals, ruoeContext);
  }

  if (conversationHistory && conversationHistory.length > 0) {
    for (let i = conversationHistory.length - 1; i >= 0; i -= 1) {
      const message = conversationHistory[i];
      if (message.role !== "user") continue;
      const text = (message.parts ?? []).map((part) => part.text).join(" ")
        .trim();
      if (!text) continue;
      const historySignals = extractFocusSignals(text);
      if (!isSignalsEmpty(historySignals)) {
        return summariseFocus(
          historySignals,
          ruoeContext,
          "carried from previous student request",
        );
      }
    }
  }

  return null;
}

function isSignalsEmpty(signals: FocusSignals): boolean {
  return signals.paragraphs.length === 0 && signals.questions.length === 0 &&
    signals.intents.length === 0;
}

function summariseFocus(
  signals: FocusSignals,
  ruoeContext?: RuoEContext | null,
  originNote?: string,
): string {
  const parts: string[] = [];

  if (signals.paragraphs.length > 0) {
    const label = signals.paragraphs.map((n) => `Paragraph ${n}`).join(", ");
    parts.push(`mentions ${label}`);
  }
  if (signals.questions.length > 0) {
    const label = signals.questions.map((n) => `Question ${n}`).join(", ");
    parts.push(`mentions ${label}`);
  }
  if (signals.intents.length > 0) {
    parts.push(`intent: ${signals.intents.join("; ")}`);
  }

  if (ruoeContext && signals.questions.length > 0) {
    const matchingOrders = ruoeContext.allQuestions
      .filter((q) => signals.questions.includes(q.order))
      .map((q) => q.order)
      .sort((a, b) => a - b);
    if (matchingOrders.length > 0) {
      parts.push(`available in catalogue: Q${matchingOrders.join(", Q")}`);
    }
  }

  if (originNote) {
    parts.push(originNote);
  }

  return parts.join(" | ");
}

function createRequestLogger() {
  // Log fixed event labels only: never learner/provider content, identifiers,
  // request payloads, response payloads, error objects, or credentials.
  return (event: string) => console.log("[get-chat-assistance]", event);
}

async function fetchTaskMetadata(
  client: SupabaseClient,
  params: { taskTypeId: number; examId: number; levelId: number },
): Promise<TaskMetadata> {
  const log = createRequestLogger();
  log("[DB] fetchTaskMetadata");

  const { data, error } = await client
    .from("exam_task_types")
    .select(`
      name,
      examType: exam_types!inner(name),
      level: levels!inner(name)
    `)
    .eq("id", params.taskTypeId)
    .eq("exam_types.id", params.examId)
    .eq("levels.id", params.levelId)
    .maybeSingle();

  if (error) {
    log("[DB Error] task metadata");
    throw new HttpError(500, "Failed to load task metadata", error);
  }

  if (!data) {
    throw new HttpError(
      404,
      "Task metadata not found for the provided context",
    );
  }

  const examTypeRelation = normalizeRelationValue(
    data.examType as SupabaseRelationValue<{ name?: unknown }>,
  );
  const levelRelation = normalizeRelationValue(
    data.level as SupabaseRelationValue<{ name?: unknown }>,
  );

  return {
    examName: toStringOrNull(examTypeRelation?.name) ?? "Unknown exam",
    levelName: toStringOrNull(levelRelation?.name) ?? "Unknown level",
    taskTypeName: data.name,
  };
}

async function fetchCriteria(
  client: SupabaseClient,
  taskTypeId: number,
): Promise<Criterion[]> {
  const log = createRequestLogger();
  log("[DB] fetchCriteria");

  const { data, error } = await client
    .from("task_criteria_link")
    .select("evaluation_criteria(name, description)")
    .eq("task_type_id", taskTypeId);

  if (error) {
    log("[DB Error] criteria lookup");
    throw new HttpError(500, "Failed to load evaluation criteria", error);
  }

  const rows = (data ?? []) as Array<{ evaluation_criteria?: unknown }>;

  return rows
    .map((item) => coerceCriterion(item.evaluation_criteria))
    .filter((criterion): criterion is Criterion => criterion !== null);
}

async function fetchDescriptors(
  client: SupabaseClient,
  params: { examId: number; levelId: number },
): Promise<Descriptor[]> {
  const log = createRequestLogger();
  log("[DB] fetchDescriptors");

  const { data, error } = await client
    .from("band_descriptors")
    .select(`
      score,
      descriptor_text,
      criterion: evaluation_criteria!inner(name)
    `)
    .eq("exam_type_id", params.examId)
    .eq("level_id", params.levelId)
    .limit(20);

  if (error) {
    log("[DB Error] descriptor lookup");
    throw new HttpError(500, "Failed to load band descriptors", error);
  }

  const rows = (data ?? []) as Array<{
    score: number;
    descriptor_text: string;
    criterion?: unknown;
  }>;

  return rows
    .map((descriptor) => {
      const criterion = coerceCriterion(descriptor.criterion);
      if (!criterion) {
        return null;
      }

      return {
        criterion_name: criterion.name,
        score: descriptor.score,
        descriptor_text: descriptor.descriptor_text,
      } satisfies Descriptor;
    })
    .filter((descriptor): descriptor is Descriptor => descriptor !== null);
}

function isPrivilegedRole(role: string | null | undefined): boolean {
  if (!role) {
    return false;
  }
  return PRIVILEGED_ROLES.has(role);
}

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[-]?\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

async function ensureRuoeAccess(
  client: SupabaseClient,
  authContext: AuthContext,
  ruoeContext: RuoEContext,
): Promise<void> {
  const log = createRequestLogger();

  if (typeof ruoeContext.exerciseId !== "number") {
    throw new HttpError(400, "ruoeContext.exerciseId must be provided");
  }

  const { data: exercise, error: exerciseError } = await client
    .from("ruoe_exercises")
    .select("id, academy_id")
    .eq("id", ruoeContext.exerciseId)
    .maybeSingle();

  if (exerciseError) {
    log("[DB Error] exercise lookup");
    throw new HttpError(
      500,
      "Failed to load RUoE exercise metadata",
      exerciseError,
    );
  }

  if (!exercise) {
    throw new HttpError(404, "RUoE exercise not found");
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
  const userRole = authContext.profile.role;
  const sameAcademy = exercise.academy_id !== null &&
    exercise.academy_id === resolvedAcademyId;
  if (!isPrivilegedRole(userRole) && !sameAcademy) {
    throw new HttpError(403, "RUoE exercise is not accessible for this user");
  }

  if (ruoeContext.attemptId) {
    const { data: attempt, error: attemptError } = await client
      .from("ruoe_user_attempts")
      .select("id, student_id, membership_id, exercise_id")
      .eq("id", ruoeContext.attemptId)
      .maybeSingle();

    if (attemptError) {
      log("[DB Error] attempt lookup");
      throw new HttpError(
        500,
        "Failed to validate RUoE attempt access",
        attemptError,
      );
    }

    if (!attempt) {
      throw new HttpError(404, "RUoE attempt not found");
    }

    if (attempt.exercise_id !== ruoeContext.exerciseId) {
      throw new HttpError(
        400,
        "RUoE attempt does not belong to the provided exercise",
      );
    }

    const attemptMembershipId = parseNumericId(attempt.membership_id);
    const isAttemptOwner = attempt.student_id === authContext.user.id ||
      (membership.membershipId !== null &&
        attemptMembershipId !== null &&
        attemptMembershipId === membership.membershipId);

    if (!isPrivilegedRole(userRole) && !isAttemptOwner) {
      throw new HttpError(403, "RUoE attempt does not belong to this user");
    }
  }
}

// --- Main Handler ---
serve(async (req) => {
  const requestId = crypto.randomUUID().substring(0, 12);
  const log = createRequestLogger();
  const baseCorsHeaders = cors.createCorsHeaders(req);
  const jsonHeaders = {
    ...baseCorsHeaders,
    "Content-Type": "application/json",
  };
  const respond = (status: number, body: Record<string, unknown>) => {
    const payload = { requestId, ...body };
    return new Response(JSON.stringify(payload), {
      status,
      headers: jsonHeaders,
    });
  };

  if (req.method === "OPTIONS") {
    try {
      cors.ensureAllowedOrigin(req);
      return new Response("ok", { headers: baseCorsHeaders });
    } catch (error) {
      if (isHttpError(error)) {
        return new Response(error.message, {
          status: error.status,
          headers: baseCorsHeaders,
        });
      }
      log("[CORS] preflight error");
      return new Response("forbidden", {
        status: 403,
        headers: baseCorsHeaders,
      });
    }
  }

  try {
    cors.ensureAllowedOrigin(req);

    if (req.method !== "POST") {
      return respond(405, { error: "Method not allowed" });
    }

    const authContext = await requireAuth(req, {
      allowedRoles: ALLOWED_ROLES_LIST,
      requireAcademy: true,
      academyOptionalRoles: ["platform_owner", "super_admin"], // platform roles operate without academy linkage
    });

    const ipRateKey = resolveClientIpRateLimitKey(req.headers);

    const [userRate, ipRate] = await Promise.all([
      enforceRateLimit(["get-chat-assistance", "user", authContext.user.id], {
        maxRequests: USER_RATE_LIMIT_MAX,
        windowMs: USER_RATE_LIMIT_WINDOW_MS,
      }),
      enforceRateLimit(["get-chat-assistance", "ip", ipRateKey], {
        maxRequests: IP_RATE_LIMIT_MAX,
        windowMs: IP_RATE_LIMIT_WINDOW_MS,
      }),
    ]);

    assertRateLimit(userRate);
    assertRateLimit(ipRate);

    let body: RequestPayload;
    try {
      body = await req.json();
    } catch {
      log("[Request] invalid JSON");
      return respond(400, { error: "Invalid JSON payload" });
    }

    const {
      userQuery,
      currentDraftText,
      originalPromptText,
      taskTypeId,
      examId,
      levelId,
      conversationHistory,
      ruoeContext,
    } = body;

    if (typeof userQuery !== "string" || userQuery.trim().length === 0) {
      return respond(400, { error: "userQuery is required" });
    }

    if (
      !Number.isInteger(taskTypeId) || !Number.isInteger(examId) ||
      !Number.isInteger(levelId)
    ) {
      return respond(400, {
        error: "taskTypeId, examId, and levelId must be valid integers",
      });
    }

    const trimmedQuery = userQuery.trim();
    log("[Request] payload accepted");

    const taskMetadata = await fetchTaskMetadata(authContext.supabase, {
      taskTypeId,
      examId,
      levelId,
    });

    const [criteria, descriptors] = await Promise.all([
      fetchCriteria(authContext.supabase, taskTypeId),
      fetchDescriptors(authContext.supabase, { examId, levelId }),
    ]);

    if (ruoeContext) {
      await ensureRuoeAccess(authContext.supabase, authContext, ruoeContext);
    }

    let systemPromptText: string;
    let userPromptText: string;
    let assistanceIntent: AssistanceIntent = "general";

    if (ruoeContext) {
      assistanceIntent = determineAssistanceIntent(
        body.assistanceIntent,
        ruoeContext,
      );
      const mode = ruoeContext.isEvaluated
        ? "post-evaluation"
        : "pre-evaluation";
      systemPromptText = buildRuoESystemPrompt({ mode, assistanceIntent });
      const requestedFocus = detectRequestedFocus(
        trimmedQuery,
        ruoeContext,
        conversationHistory,
      );
      userPromptText = buildRuoEUserPrompt({
        userQuery: trimmedQuery,
        ruoeContext,
        criteria,
        descriptors,
        examName: taskMetadata.examName,
        levelName: taskMetadata.levelName,
        taskTypeName: taskMetadata.taskTypeName,
        requestedFocus,
        assistanceIntent,
      });
    } else {
      systemPromptText = SYSTEM_PROMPT_WRITING;
      userPromptText = buildWritingUserPrompt({
        userQuery: trimmedQuery,
        currentDraftText: currentDraftText || "",
        originalPromptText: originalPromptText || "",
        criteria,
        descriptors,
        examName: taskMetadata.examName,
        levelName: taskMetadata.levelName,
        taskTypeName: taskMetadata.taskTypeName,
      });
    }

    const input: ResponseInputMessage[] = [];
    const historyPrompt = buildUntrustedConversationHistory(
      conversationHistory,
    );
    if (historyPrompt) {
      input.push({ role: "user", content: historyPrompt });
    }

    input.push({ role: "user", content: userPromptText });

    log("[AI] invoking");

    try {
      const maxTokens = ruoeContext
        ? (ruoeContext.isEvaluated
          ? (assistanceIntent === "ruoe_clarification" ? 520 : 420)
          : 380)
        : 420;
      const client = createOpenAIResponsesClientFromEnv();
      const result = await createChatAssistanceResponse({
        client,
        instructions: systemPromptText,
        input,
        maxOutputTokens: maxTokens,
      });

      switch (result.kind) {
        case "completed":
          log("[AI] completed");
          return respond(200, { responseText: result.data.answer });
        case "incomplete":
          log("[AI] incomplete");
          return respond(502, {
            error:
              "AI Service Error: The coaching response was incomplete. Please try again.",
          });
        case "refusal":
          log("[AI] refusal");
          return respond(502, {
            error:
              "AI Service Error: The coaching request could not be completed safely.",
          });
        case "failed":
          log("[AI] failed");
          return respond(502, {
            error: result.retryable
              ? "AI Service Error: The coaching service is temporarily unavailable. Please try again."
              : "AI Service Error: The coaching request could not be completed.",
          });
      }
    } catch {
      log("[AI] invocation error");
      return respond(502, {
        error: "AI Service Error: The coaching service is unavailable.",
      });
    }
  } catch (error) {
    if (isHttpError(error)) {
      return respond(error.status, { error: error.message });
    }
    log("[Unhandled] error");
    return respond(500, { error: "Internal Server Error" });
  } finally {
    log("[Request] completed");
  }
});

// --- Log de inicialización ---
console.log(
  "get-chat-assistance Edge Function initialized and awaiting requests...",
);
