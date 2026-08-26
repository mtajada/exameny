import YAML from "yaml";

export interface PromptFrontMatter {
  system_prompt: string;
  cache_hint?: string;
  [key: string]: unknown;
}

export interface PromptTemplate {
  frontMatter: PromptFrontMatter;
  body: string;
  sourcePath?: string;
}

export interface RenderOptions {
  strict?: boolean;
  onMissingToken?: (token: string) => string;
}

const TOKEN_REGEX = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function parsePromptSource(
  source: string,
  sourcePath?: string,
): PromptTemplate {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) {
    throw new Error(
      `Prompt file${
        sourcePath ? ` (${sourcePath})` : ""
      } must start with YAML front matter delineated by '---'`,
    );
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    throw new Error(
      `Prompt file${
        sourcePath ? ` (${sourcePath})` : ""
      } is missing closing front matter delimiter`,
    );
  }

  const frontMatterRaw = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trimStart();
  const parsed = YAML.parse(frontMatterRaw) as PromptFrontMatter | null;

  if (
    !parsed || typeof parsed.system_prompt !== "string" ||
    parsed.system_prompt.trim().length === 0
  ) {
    throw new Error(
      `Prompt file${
        sourcePath ? ` (${sourcePath})` : ""
      } must define a non-empty 'system_prompt' field in front matter`,
    );
  }

  return {
    frontMatter: parsed,
    body,
    sourcePath,
  };
}

export async function loadPromptTemplate(
  path: string | URL,
): Promise<PromptTemplate> {
  const content = await Deno.readTextFile(path);
  const sourcePath = path instanceof URL ? path.pathname : path;
  return parsePromptSource(content, sourcePath);
}

export function renderTemplate(
  template: string,
  context: Record<string, string | number | undefined | null>,
  options: RenderOptions = {},
): string {
  return template.replace(TOKEN_REGEX, (_, token: string) => {
    const key = token.trim();
    const value = context[key];
    if (value === undefined || value === null) {
      if (options.strict) {
        throw new Error(`Missing template token: ${key}`);
      }
      return options.onMissingToken ? options.onMissingToken(key) : "";
    }
    return String(value);
  });
}

export function renderPrompt(
  template: PromptTemplate,
  context: Record<string, string | number | undefined | null>,
  options: RenderOptions = {},
) {
  const systemPrompt = renderTemplate(
    template.frontMatter.system_prompt,
    context,
    options,
  );
  const userPrompt = renderTemplate(template.body, context, options);
  return { systemPrompt, userPrompt };
}

export function extractTemplateTokens(template: string): string[] {
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(template)) !== null) {
    tokens.add(match[1].trim());
  }
  return Array.from(tokens);
}

export {
  getCachedPromptTemplate,
  listCachedPromptKeys,
} from "./generated/prompt-cache.ts";
