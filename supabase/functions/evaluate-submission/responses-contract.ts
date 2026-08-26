import { z } from "zod";

import type { StrictJsonSchema } from "../_shared/openai-responses.ts";
import { ALLOWED_FEATURE_TAGS, ALLOWED_MISTAKE_CATEGORIES } from "./prompt.ts";

const nullableStringJsonSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

const criterionJsonSchema = {
  type: "object",
  properties: {
    criterionName: { type: "string", minLength: 1 },
    score: { type: "string", minLength: 1 },
    feedback: { type: "string", minLength: 1 },
  },
  required: ["criterionName", "score", "feedback"],
  additionalProperties: false,
} as const;

/**
 * The canonical mistake contract shared by evaluation and the local harness.
 * Every field is required because OpenAI Structured Outputs strict mode does
 * not permit optional object properties. Nullable fields remain explicit.
 */
export const MISTAKE_ITEM_JSON_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...ALLOWED_MISTAKE_CATEGORIES] },
    featureTags: {
      type: "array",
      items: { type: "string", enum: [...ALLOWED_FEATURE_TAGS] },
    },
    anchorPatch: {
      type: "object",
      properties: {
        before: { type: "string", minLength: 1 },
        after: {
          anyOf: [
            { type: "string" },
            { type: "null" },
          ],
        },
        contextBefore: { type: "string" },
        contextAfter: { type: "string" },
      },
      required: ["before", "after", "contextBefore", "contextAfter"],
      additionalProperties: false,
    },
    explanation: { type: "string", minLength: 1 },
    suggestedTag: nullableStringJsonSchema,
  },
  required: [
    "category",
    "featureTags",
    "anchorPatch",
    "explanation",
    "suggestedTag",
  ],
  additionalProperties: false,
} as const;

export const EVALUATION_RESPONSES_JSON_SCHEMA = {
  type: "object",
  properties: {
    evaluation: {
      type: "object",
      properties: {
        overallScore: { type: "string", minLength: 1 },
        criteriaEvaluation: {
          type: "array",
          items: criterionJsonSchema,
        },
        overallCommentary: {
          type: "string",
          minLength: 1,
        },
      },
      required: [
        "overallScore",
        "criteriaEvaluation",
        "overallCommentary",
      ],
      additionalProperties: false,
    },
    mistakes: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: MISTAKE_ITEM_JSON_SCHEMA,
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  required: ["evaluation", "mistakes"],
  additionalProperties: false,
} as const satisfies StrictJsonSchema;

export const HARNESS_RESPONSES_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: MISTAKE_ITEM_JSON_SCHEMA,
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const satisfies StrictJsonSchema;

export const REALIGN_RESPONSES_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          status: {
            type: "string",
            enum: ["aligned", "unchanged", "not_found"],
          },
          anchorStart: { type: "integer", minimum: 0 },
          anchorEnd: { type: "integer", minimum: 0 },
          matchedText: { type: "string" },
          notes: nullableStringJsonSchema,
        },
        required: [
          "id",
          "status",
          "anchorStart",
          "anchorEnd",
          "matchedText",
          "notes",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const satisfies StrictJsonSchema;

const criterionSchema = z.object({
  criterionName: z.string().min(1).max(160),
  score: z.string().min(1).max(40),
  feedback: z.string().min(1).max(2_000),
}).strict();

const responseMistakeItemSchema = z.object({
  category: z.enum(ALLOWED_MISTAKE_CATEGORIES),
  featureTags: z.array(z.enum(ALLOWED_FEATURE_TAGS)).max(8),
  anchorPatch: z.object({
    before: z.string().min(1).max(120).refine(
      (value) => value.trim().length >= 3,
      "anchorPatch.before must contain at least 3 non-whitespace characters",
    ),
    after: z.string().max(120).nullable(),
    contextBefore: z.string().max(40),
    contextAfter: z.string().max(40),
  }).strict(),
  explanation: z.string().min(1).max(2_000),
  suggestedTag: z.string().max(120).nullable(),
}).strict();

const evaluationResponsesSchema = z.object({
  evaluation: z.object({
    overallScore: z.string().min(1).max(40),
    criteriaEvaluation: z.array(criterionSchema).max(24),
    overallCommentary: z.string().min(1).max(4_000),
  }).strict(),
  mistakes: z.object({
    items: z.array(responseMistakeItemSchema).max(30),
  }).strict(),
}).strict();

const harnessResponsesSchema = z.object({
  items: z.array(responseMistakeItemSchema).max(30),
}).strict();

const realignItemSchema = z.object({
  id: z.string().min(1).max(80),
  status: z.enum(["aligned", "unchanged", "not_found"]),
  anchorStart: z.number().int().nonnegative(),
  anchorEnd: z.number().int().nonnegative(),
  matchedText: z.string().max(400),
  notes: z.string().max(240).nullable(),
}).strict().superRefine((item, context) => {
  if (item.status !== "not_found" && item.anchorEnd <= item.anchorStart) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "aligned spans require anchorEnd greater than anchorStart",
      path: ["anchorEnd"],
    });
  }
});

const realignResponsesSchema = z.object({
  items: z.array(realignItemSchema).max(30),
}).strict();

export type EvaluationResponsesPayload = z.infer<
  typeof evaluationResponsesSchema
>;
export type HarnessResponsesPayload = z.infer<typeof harnessResponsesSchema>;
export type RealignResponsesPayload = z.infer<typeof realignResponsesSchema>;
export type RealignResponseItem = RealignResponsesPayload["items"][number];

export function parseEvaluationResponsesPayload(
  value: unknown,
): EvaluationResponsesPayload {
  return evaluationResponsesSchema.parse(value);
}

export function parseHarnessResponsesPayload(
  value: unknown,
): HarnessResponsesPayload {
  return harnessResponsesSchema.parse(value);
}

export function parseRealignResponsesPayload(
  value: unknown,
): RealignResponsesPayload {
  return realignResponsesSchema.parse(value);
}
