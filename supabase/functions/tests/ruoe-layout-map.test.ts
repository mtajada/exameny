import { assertEquals } from "std/testing/asserts.ts";

import {
  ALL_RUOE_TASK_CODES,
  getLayoutByFunction,
  getRuoEFunctionName,
  getRuoELayoutKey,
} from "../_shared/ruoe-layout-map.ts";

const EXPECTED_MAPPINGS: Record<string, string> = {
  B1_LANG_MC_CLOZE: "ruoe-mc-cloze",
  B2_LANG_MC_CLOZE: "ruoe-mc-cloze",
  C1_LANG_MC_CLOZE: "ruoe-mc-cloze",
  C2_LANG_MC_CLOZE: "ruoe-mc-cloze",
  B1_LANG_OPEN_CLOZE: "ruoe-open-cloze",
  B2_LANG_OPEN_CLOZE: "ruoe-open-cloze",
  C1_LANG_OPEN_CLOZE: "ruoe-open-cloze",
  C2_LANG_OPEN_CLOZE: "ruoe-open-cloze",
  B2_LANG_WORD_FORMATION: "ruoe-word-formation",
  C1_LANG_WORD_FORMATION: "ruoe-word-formation",
  C2_LANG_WORD_FORMATION: "ruoe-word-formation",
  B2_LANG_TRANSFORMATION: "ruoe-keyword-transformation",
  C1_LANG_TRANSFORMATION: "ruoe-keyword-transformation",
  C2_LANG_TRANSFORMATION: "ruoe-keyword-transformation",
  B1_READ_MCQ_SHORT: "ruoe-reading-mcq",
  B1_READ_MCQ_LONG: "ruoe-reading-mcq",
  B2_READ_MCQ: "ruoe-reading-mcq",
  C1_READ_MCQ: "ruoe-reading-mcq",
  C2_READ_MCQ: "ruoe-reading-mcq",
  B1_READ_GAPPED_TEXT: "ruoe-gapped-text",
  B2_READ_GAPPED_TEXT: "ruoe-gapped-text",
  C1_READ_GAPPED_TEXT: "ruoe-gapped-text",
  C2_READ_GAPPED_TEXT: "ruoe-gapped-text",
  B1_READ_MULTIPLE_MATCHING: "ruoe-multiple-matching",
  B2_READ_MULTIPLE_MATCHING: "ruoe-multiple-matching",
  C1_READ_MULTIPLE_MATCHING: "ruoe-multiple-matching",
  C2_READ_MULTIPLE_MATCHING: "ruoe-multiple-matching",
  C1_READ_CROSS_TEXT: "ruoe-cross-text",
};

Deno.test("mapping covers all RUoE task codes", () => {
  assertEquals(
    new Set(Object.keys(EXPECTED_MAPPINGS)).size,
    ALL_RUOE_TASK_CODES.length,
  );
  ALL_RUOE_TASK_CODES.forEach((taskCode) => {
    const layout = getRuoELayoutKey(taskCode);
    assertEquals(layout, EXPECTED_MAPPINGS[taskCode]);
  });
});

Deno.test("function name lookup matches layout mapping", () => {
  Object.entries(EXPECTED_MAPPINGS).forEach(([taskCode, layout]) => {
    const functionName = getRuoEFunctionName(taskCode);
    const derivedLayout = getLayoutByFunction(functionName);
    assertEquals(derivedLayout, layout);
  });
});

Deno.test("lookup is case insensitive", () => {
  assertEquals(getRuoELayoutKey("b1_read_mcq_long"), "ruoe-reading-mcq");
});
