import {
  getCachedPromptTemplate,
  loadPromptTemplate,
  type PromptTemplate,
  renderPrompt,
} from "../_shared/prompt-loader.ts";

export interface RealignPromptTokens extends Record<string, string> {
  submissionText: string;
  mistakesJson: string;
}

async function loadRealignPromptTemplate(): Promise<PromptTemplate> {
  const promptUrl = new URL("./prompt-lite.md", import.meta.url);
  try {
    return await loadPromptTemplate(promptUrl);
  } catch (error) {
    if (
      error instanceof Deno.errors.NotFound ||
      error instanceof Deno.errors.PermissionDenied
    ) {
      console.warn(
        "[evaluate-submission][realign] Falling back to the bundled template.",
      );
      return getCachedPromptTemplate("evaluate-submission-prompt-lite");
    }
    throw error;
  }
}

const REALIGN_PROMPT_TEMPLATE: PromptTemplate =
  await loadRealignPromptTemplate();

export function buildRealignPrompt(
  tokens: RealignPromptTokens,
): { systemPrompt: string; userPrompt: string } {
  return renderPrompt(REALIGN_PROMPT_TEMPLATE, tokens, { strict: true });
}
