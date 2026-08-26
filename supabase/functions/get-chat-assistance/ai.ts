import type {
  OpenAIResponsesClient,
  ResponseInputMessage,
  ResponsesResult,
  StrictJsonSchema,
} from "../_shared/openai-responses.ts";

export interface ChatAssistancePayload {
  readonly answer: string;
}

export const CHAT_ASSISTANCE_SCHEMA: StrictJsonSchema = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "A concise, safe coaching reply in English.",
    },
  },
  required: ["answer"],
  additionalProperties: false,
};

const MAX_ANSWER_CHARS = 8_000;

export function parseChatAssistancePayload(
  value: unknown,
): ChatAssistancePayload {
  if (!isRecord(value)) {
    throw new Error("Chat assistance output must be an object");
  }

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "answer") {
    throw new Error("Chat assistance output contains unexpected fields");
  }

  if (typeof value.answer !== "string") {
    throw new Error("Chat assistance answer must be a string");
  }

  const answer = value.answer.trim();
  if (!answer || answer.length > MAX_ANSWER_CHARS) {
    throw new Error("Chat assistance answer has an invalid length");
  }

  return { answer };
}

export function createChatAssistanceResponse(params: {
  readonly client: OpenAIResponsesClient;
  readonly instructions: string;
  readonly input: readonly ResponseInputMessage[];
  readonly maxOutputTokens: number;
}): Promise<ResponsesResult<ChatAssistancePayload>> {
  return params.client.generate({
    instructions: params.instructions,
    input: params.input,
    schemaName: "exameny_chat_assistance",
    schema: CHAT_ASSISTANCE_SCHEMA,
    parse: parseChatAssistancePayload,
    reasoningEffort: "low",
    maxOutputTokens: params.maxOutputTokens,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
