export type RuoELayoutKey =
  | "ruoe-mc-cloze"
  | "ruoe-open-cloze"
  | "ruoe-word-formation"
  | "ruoe-keyword-transformation"
  | "ruoe-reading-mcq"
  | "ruoe-gapped-text"
  | "ruoe-multiple-matching"
  | "ruoe-cross-text";

export const LAYOUT_TO_FUNCTION: Record<RuoELayoutKey, string> = {
  "ruoe-mc-cloze": "generate-ruoe-mc-cloze",
  "ruoe-open-cloze": "generate-ruoe-open-cloze",
  "ruoe-word-formation": "generate-ruoe-word-formation",
  "ruoe-keyword-transformation": "generate-ruoe-keyword-transformation",
  "ruoe-reading-mcq": "generate-ruoe-reading-mcq",
  "ruoe-gapped-text": "generate-ruoe-gapped-text",
  "ruoe-multiple-matching": "generate-ruoe-multiple-matching",
  "ruoe-cross-text": "generate-ruoe-cross-text",
};

const TASK_TO_LAYOUT: Record<string, RuoELayoutKey> = {
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

export const ALL_RUOE_TASK_CODES = Object.keys(TASK_TO_LAYOUT);

export function getRuoELayoutKey(taskCode: string): RuoELayoutKey {
  const key = TASK_TO_LAYOUT[taskCode.toUpperCase()];
  if (!key) {
    throw new Error(`Unknown R&UoE task code: ${taskCode}`);
  }
  return key;
}

export function getRuoEFunctionName(taskCode: string): string {
  const layout = getRuoELayoutKey(taskCode);
  return LAYOUT_TO_FUNCTION[layout];
}

export function getLayoutByFunction(
  functionName: string,
): RuoELayoutKey | undefined {
  return (Object.keys(LAYOUT_TO_FUNCTION) as RuoELayoutKey[]).find((layout) =>
    LAYOUT_TO_FUNCTION[layout] === functionName
  );
}
