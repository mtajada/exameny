import { z } from "zod";

import { ALLOWED_FEATURE_TAGS, ALLOWED_MISTAKE_CATEGORIES } from "./prompt.ts";

function coerceStringArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

const criterionSchema = z.object({
  criterionName: z.string().min(1),
  score: z.string().min(1),
  feedback: z.string().min(1),
}).strict();

export const evaluationSchema = z.object({
  overallScore: z.string().min(1),
  criteriaEvaluation: z.array(criterionSchema),
  overallCommentary: z.string().min(1),
}).strict();

export const anchorPatchSchema = z.object({
  before: z
    .string()
    .min(1)
    .max(120)
    .refine((value) => value.trim().length >= 3, {
      message:
        "anchorPatch.before must be at least 3 non-whitespace characters.",
    }),
  after: z.string().max(120).nullable().optional(),
  contextBefore: z.string().max(40).optional(),
  contextAfter: z.string().max(40).optional(),
}).strict();

export const anchorPatchSchemaLoose = z.object({
  before: z
    .string()
    .min(1)
    .max(400)
    .refine((value) => value.trim().length >= 3, {
      message:
        "anchorPatch.before must be at least 3 non-whitespace characters.",
    }),
  after: z.string().max(400).nullable().optional(),
  contextBefore: z.string().max(400).nullable().optional(),
  contextAfter: z.string().max(400).nullable().optional(),
});

export const mistakesV2ItemSchema = z.object({
  category: z.enum(ALLOWED_MISTAKE_CATEGORIES),
  featureTags: z.array(z.enum(ALLOWED_FEATURE_TAGS)),
  anchorPatch: anchorPatchSchema,
  explanation: z.string().min(1),
  suggestedTag: z.string().nullable(),
}).strict();

export const mistakesV2ItemSchemaLoose = z.object({
  category: z.string().min(1),
  featureTags: z.preprocess(coerceStringArray, z.array(z.string())),
  anchorPatch: anchorPatchSchemaLoose,
  explanation: z.string().min(1),
  suggestedTag: z.string().nullable().optional(),
});

const summarySchema = z.object({
  byCategory: z.record(z.number().int().nonnegative()),
  byTag: z.record(z.number().int().nonnegative()),
}).strict();

export const mistakesV2Schema = z.object({
  evaluation: evaluationSchema,
  mistakes: z.object({
    items: z.array(mistakesV2ItemSchema),
    summary: summarySchema,
  }).strict(),
}).strict();

export type MistakesV2Payload = z.infer<typeof mistakesV2Schema>;
