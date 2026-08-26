import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type TaskContext,
  validateExerciseResponse,
  type ValidationResult,
} from "./ruoe-types.ts";

export interface TaskMetadataRecord {
  taskTypeId: number;
  taskCode: string;
  taskName: string;
  taskDescription: string | null;
  exam: {
    id: number;
    code: string;
    name: string;
  };
  level: {
    id: number;
    code: string;
    name: string;
  };
}

export interface PersistExerciseParams {
  taskTypeId: number;
  academyId: number;
  authorId?: string | null;
  exerciseData: unknown;
  teacherTheme?: string | null;
  teacherSkillFocus?: string | null;
}

const TASK_METADATA_SELECTION = `
  id,
  task_code,
  name,
  description,
  exam_types!inner(id, code, name),
  levels!inner(id, code, name)
`;

function createLogger(requestId: string) {
  return (...args: unknown[]) => {
    const event = typeof args[0] === "string" ? args[0] : "diagnostic_event";
    console.log("[ruoe-service]", { request_id: requestId, event });
  };
}

export async function fetchTaskMetadata(
  supabase: SupabaseClient,
  taskTypeId: number,
  traceId: string,
): Promise<TaskMetadataRecord> {
  const log = createLogger(traceId);
  log("fetchTaskMetadata", { taskTypeId });

  const { data, error } = await supabase
    .from("exam_task_types")
    .select(TASK_METADATA_SELECTION)
    .eq("id", taskTypeId)
    .maybeSingle();

  if (error || !data) {
    log("metadataLookupFailed", error ?? "not found");
    throw new Error(`Task metadata not found for taskTypeId=${taskTypeId}`);
  }

  const exam = Array.isArray(data.exam_types)
    ? data.exam_types[0]
    : data.exam_types;
  const level = Array.isArray(data.levels) ? data.levels[0] : data.levels;

  return {
    taskTypeId: data.id,
    taskCode: data.task_code,
    taskName: data.name,
    taskDescription: data.description ?? null,
    exam: {
      id: exam.id,
      code: exam.code,
      name: exam.name,
    },
    level: {
      id: level.id,
      code: level.code,
      name: level.name,
    },
  };
}

export function toTaskContext(
  record: TaskMetadataRecord,
  teacherTheme?: string | null,
  teacherSkillFocus?: string | null,
): TaskContext {
  return {
    taskTypeId: record.taskTypeId,
    taskCode: record.taskCode,
    taskName: record.taskName,
    levelName: record.level.name,
    levelCode: record.level.code,
    examName: record.exam.name,
    examTypeId: record.exam.id,
    levelId: record.level.id,
    teacherTheme: teacherTheme ?? null,
    teacherSkillFocus: teacherSkillFocus ?? null,
  };
}

export function validateRuoeExercise(
  taskCode: string,
  payload: unknown,
): ValidationResult {
  return validateExerciseResponse(payload, taskCode);
}

export async function persistExercise(
  supabase: SupabaseClient,
  params: PersistExerciseParams,
  traceId: string,
): Promise<number> {
  const log = createLogger(traceId);
  log("persistExercise", { taskTypeId: params.taskTypeId });

  const { data, error } = await supabase.rpc("create_ruoe_exercise_from_json", {
    p_task_type_id: params.taskTypeId,
    p_academy_id: params.academyId,
    p_author_id: params.authorId ?? null,
    p_exercise_data: params.exerciseData,
    p_teacher_theme: params.teacherTheme ?? null,
    p_teacher_skill_focus: params.teacherSkillFocus ?? null,
  });

  if (error) {
    log("persistError", error);
    throw new Error(`Database error: ${error.message}`);
  }

  const exerciseId = typeof data === "number"
    ? data
    : Array.isArray(data)
    ? Number(data[0])
    : Number(data);
  if (!exerciseId || Number.isNaN(exerciseId)) {
    throw new Error(
      "Failed to persist R&UoE exercise: RPC returned invalid identifier",
    );
  }

  return exerciseId;
}

const STRICT_MCQ_TASKS = new Set([
  "B2_LANG_MC_CLOZE",
  "C1_LANG_MC_CLOZE",
  "C2_LANG_MC_CLOZE",
  "B2_READ_MCQ",
  "C1_READ_MCQ",
  "C2_READ_MCQ",
]);

export function requiresStrictMcqIntegrity(taskCode: string): boolean {
  return STRICT_MCQ_TASKS.has(taskCode);
}

export async function verifyMcqIntegrity(
  supabase: SupabaseClient,
  taskCode: string,
  exerciseId: number,
  traceId: string,
): Promise<void> {
  if (!requiresStrictMcqIntegrity(taskCode)) return;

  const log = createLogger(traceId);
  log("verifyMcqIntegrity", { exerciseId, taskCode });

  const { data: questions, error: questionError } = await supabase
    .from("ruoe_questions")
    .select("id")
    .eq("exercise_id", exerciseId);

  if (questionError || !questions) {
    throw new Error(
      `Integrity check failed: unable to load questions for exercise ${exerciseId}`,
    );
  }

  const questionIds = questions.map((row) => row.id);
  if (questionIds.length === 0) {
    throw new Error(
      `Integrity check failed: exercise ${exerciseId} contains no questions`,
    );
  }

  const { data: options, error: optionsError } = await supabase
    .from("ruoe_options")
    .select("question_id, is_correct")
    .in("question_id", questionIds);

  if (optionsError || !options) {
    throw new Error(
      `Integrity check failed: unable to load options for exercise ${exerciseId}`,
    );
  }

  const stats = new Map<number, { count: number; correct: number }>();
  questionIds.forEach((id) => stats.set(id, { count: 0, correct: 0 }));

  for (const option of options) {
    const entry = stats.get(option.question_id);
    if (!entry) continue;
    entry.count += 1;
    if (option.is_correct === true) {
      entry.correct += 1;
    }
  }

  const invalid = Array.from(stats.entries()).filter(([, value]) =>
    value.count !== 4 || value.correct !== 1
  );
  if (invalid.length > 0) {
    log("integrityViolation", invalid);
    throw new Error(
      "Persisted MCQ exercise must have exactly 4 options and 1 correct option per question",
    );
  }
}
