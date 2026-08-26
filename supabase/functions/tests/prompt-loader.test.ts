import { assertEquals, assertThrows } from "std/testing/asserts.ts";

import {
  loadPromptTemplate,
  parsePromptSource,
  renderPrompt,
  renderTemplate,
} from "../_shared/prompt-loader.ts";

const SAMPLE_SOURCE = `---
system_prompt: >
  You are a writing coach for {{examName}}.
cache_hint: writing-base
---
Generate a prompt for {{taskName}} at level {{levelCode}}.`;

Deno.test("parsePromptSource extracts front matter and body", () => {
  const template = parsePromptSource(SAMPLE_SOURCE, "sample.md");
  assertEquals(
    template.frontMatter.system_prompt.trim(),
    "You are a writing coach for {{examName}}.",
  );
  assertEquals(template.frontMatter.cache_hint, "writing-base");
  assertEquals(
    template.body.trim(),
    "Generate a prompt for {{taskName}} at level {{levelCode}}.",
  );
});

Deno.test("renderTemplate substitutes tokens and ignores missing by default", () => {
  const rendered = renderTemplate("Hello {{name}} from {{city}}", {
    name: "Alex",
  });
  assertEquals(rendered, "Hello Alex from ");
});

Deno.test("renderTemplate throws in strict mode when token missing", () => {
  assertThrows(
    () => renderTemplate("Value {{missing}}", {}, { strict: true }),
    Error,
    "Missing template token: missing",
  );
});

Deno.test("renderPrompt renders system and user content", () => {
  const template = parsePromptSource(SAMPLE_SOURCE);
  const { systemPrompt, userPrompt } = renderPrompt(template, {
    examName: "B2",
    taskName: "Essay",
    levelCode: "B2",
  });
  assertEquals(systemPrompt.trim(), "You are a writing coach for B2.");
  assertEquals(userPrompt.trim(), "Generate a prompt for Essay at level B2.");
});

Deno.test("loadPromptTemplate reads files from disk", async () => {
  const tempFile = await Deno.makeTempFile({
    dir: new URL(".", import.meta.url).pathname,
    suffix: ".md",
  });
  await Deno.writeTextFile(tempFile, SAMPLE_SOURCE);
  const template = await loadPromptTemplate(tempFile);
  assertEquals(template.frontMatter.cache_hint, "writing-base");
  await Deno.remove(tempFile);
});
