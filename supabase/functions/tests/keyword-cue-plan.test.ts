import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "std/testing/asserts.ts";

import { keywordCueBankByLevel } from "../_shared/keyword-cue-bank.ts";
import { keywordCueSkillFocusMap } from "../_shared/keyword-cue-skill-focus.ts";
import {
  applySkillFocusCueFilter,
  assertKeywordCueIntegrity,
  selectKeywordCuePlan,
} from "../_shared/keyword-cue-plan.ts";
import type { KeywordCue } from "../_shared/keyword-cue-types.ts";

Deno.test("assertKeywordCueIntegrity accepts well-formed cues", () => {
  const cue = keywordCueBankByLevel.B2[0];
  assertKeywordCueIntegrity(cue);
});

Deno.test("assertKeywordCueIntegrity accepts cues whose keywords include apostrophes", () => {
  const cue = keywordCueBankByLevel.C1.find((entry) =>
    entry.keyword.includes("'")
  );
  assert(cue, "expected apostrophe keyword in C1 cue bank");
  assertKeywordCueIntegrity(cue);
});

Deno.test("assertKeywordCueIntegrity normalises smart apostrophes to ASCII", () => {
  const cue = keywordCueBankByLevel.C1.find((entry) =>
    entry.keyword.includes("'")
  );
  assert(cue, "expected apostrophe keyword in C1 cue bank");
  const curlyKeywordCue: KeywordCue = {
    ...cue,
    keyword: cue.keyword.replace("'", "\u2019"),
  };
  assertKeywordCueIntegrity(curlyKeywordCue);
});

Deno.test("assertKeywordCueIntegrity rejects cues missing the keyword in variants", () => {
  const cue = keywordCueBankByLevel.B2[0];
  const invalid: KeywordCue = {
    ...cue,
    variants: cue.variants.map(() => "ANY ATTENTION"),
  };
  assertThrows(() => assertKeywordCueIntegrity(invalid));
});

Deno.test("assertKeywordCueIntegrity enforces level word windows", () => {
  const cue = keywordCueBankByLevel.B2[1];
  const invalid: KeywordCue = {
    ...cue,
    variants: ["IS NO POINT IN DOING THIS COMPLEX TASK"],
  };
  assertThrows(() => assertKeywordCueIntegrity(invalid));
});

Deno.test("assertKeywordCueIntegrity counts contractions when enforcing windows", () => {
  const cue: KeywordCue = {
    id: "TEST_CONTRACTION_WINDOW",
    keyword: "CAN'T",
    operator: "contraction window guard",
    frames: ["_______, verify limits"],
    variants: ["CAN'T POSSIBLY HAVE DONE THAT"],
    level: "B2",
  };
  assertThrows(() => assertKeywordCueIntegrity(cue));
});

Deno.test("assertKeywordCueIntegrity rejects frames whose boundaries overlap variants", () => {
  const cue: KeywordCue = {
    id: "TEST_FRAME_OVERLAP",
    keyword: "LIFT",
    operator: "give someone a lift",
    frames: ["give her a _______ she"],
    variants: ["GIVE HER A LIFT"],
    level: "C1",
  };
  assertThrows(() => assertKeywordCueIntegrity(cue));
});

Deno.test("assertKeywordCueIntegrity rejects frames that reuse variant tokens after the gap", () => {
  const cue: KeywordCue = {
    id: "TEST_INTERNAL_RIGHT_OVERLAP",
    keyword: "NEVERTHELESS",
    operator: "internal overlap probe",
    frames: ["_______ he continued working"],
    variants: ["NEVERTHELESS HE CONTINUED WORKING"],
    level: "C2",
  };
  assertThrows(() => assertKeywordCueIntegrity(cue));
});

Deno.test("assertKeywordCueIntegrity rejects frames that reuse variant tokens before the gap", () => {
  const cue: KeywordCue = {
    id: "TEST_INTERNAL_LEFT_OVERLAP",
    keyword: "EMPHASISED",
    operator: "internal overlap probe",
    frames: ["During training they more emphasised _______ patience."],
    variants: ["THEY FINALLY MORE EMPHASISED"],
    level: "C1",
  };
  assertThrows(() => assertKeywordCueIntegrity(cue));
});

Deno.test("selectKeywordCuePlan avoids consecutive keyword and operator repeats", () => {
  const cues = keywordCueBankByLevel.C1;
  const plan = selectKeywordCuePlan({
    cues,
    questionCount: 6,
    seed: "cue-plan-test",
  });
  assertEquals(plan.entries.length, 6);
  for (let i = 1; i < plan.entries.length; i += 1) {
    const prev = plan.entries[i - 1];
    const current = plan.entries[i];
    assertNotEquals(
      current.keyword,
      prev.keyword,
      "keywords should not repeat consecutively",
    );
    assertNotEquals(
      current.operator.toLowerCase(),
      prev.operator.toLowerCase(),
      "operators should not repeat consecutively",
    );
  }
});

Deno.test("selectKeywordCuePlan preserves apostrophes when returning entries", () => {
  const cue = keywordCueBankByLevel.C1.find((entry) =>
    entry.keyword.includes("'")
  );
  assert(cue, "expected apostrophe keyword in C1 cue bank");
  const plan = selectKeywordCuePlan({
    cues: [cue],
    questionCount: 1,
    seed: "apostrophe-test",
  });
  assertEquals(plan.entries.length, 1);
  assertEquals(plan.entries[0].keyword, cue.keyword);
});

Deno.test("selectKeywordCuePlan surfaces metadata when diversity fallback is required", () => {
  const cue: KeywordCue = {
    id: "TEST_DIVERSITY_FALLBACK",
    keyword: "TEST",
    operator: "diversity fallback probe",
    frames: ["This _______ example"],
    variants: ["TEST KEY WORD"],
    level: "C1",
  };
  const originalWarn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const plan = selectKeywordCuePlan({
      cues: [cue],
      questionCount: 2,
      seed: "diversity-fallback",
    });
    assertEquals(plan.entries.length, 2);
    assertEquals(plan.metadata.fallbackToFullBank, true);
    assert(
      warnings.length > 0,
      "expected diversity fallback warning to be logged",
    );
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("applySkillFocusCueFilter biases to focus when sufficient cues exist", () => {
  const baseCues = keywordCueBankByLevel.C1;
  // metadata fields should confirm we honoured the requested focus without falling back
  const filtered = applySkillFocusCueFilter("inversion", baseCues, 6);
  assertEquals(filtered.appliedTag, "inversion");
  assertEquals(filtered.requestedTag, "inversion");
  assertEquals(filtered.fallbackApplied, false);
  assert(filtered.cues.length >= 6, "should return enough cues for selection");
});

Deno.test("applySkillFocusCueFilter retains focus cues even when quantity is below question count", () => {
  const baseCues = keywordCueBankByLevel.C2;
  const filtered = applySkillFocusCueFilter("inversion", baseCues, 25);
  assertEquals(filtered.appliedTag, "inversion");
  assertEquals(filtered.requestedTag, "inversion");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length > 0,
    "should retain the available inversion cues",
  );
  filtered.cues.forEach((cue) => assertEquals(cue.level, "C2"));
});

Deno.test("applySkillFocusCueFilter enforces level restrictions specified in the skill focus map", () => {
  const baseCues = keywordCueBankByLevel.B2;
  const filtered = applySkillFocusCueFilter("inversion", baseCues, 4);
  assertEquals(filtered.appliedTag, undefined);
  assertEquals(filtered.requestedTag, "inversion");
  assertEquals(filtered.fallbackApplied, true);
  assertEquals(filtered.matchedCount, 0);
  assertEquals(filtered.cues, baseCues);
});

Deno.test("applySkillFocusCueFilter honours reported speech focus for B2", () => {
  const baseCues = keywordCueBankByLevel.B2;
  const filtered = applySkillFocusCueFilter("reported speech", baseCues, 6);
  assertEquals(filtered.requestedTag, "reported-speech");
  assertEquals(filtered.appliedTag, "reported-speech");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length >= 6,
    "should supply at least six reported speech cues",
  );
  filtered.cues.forEach((cue) => assertEquals(cue.level, "B2"));
});

Deno.test("applySkillFocusCueFilter provides sufficient B2 conditional cues", () => {
  const baseCues = keywordCueBankByLevel.B2;
  const filtered = applySkillFocusCueFilter("conditionals", baseCues, 6);
  assertEquals(filtered.requestedTag, "conditionals");
  assertEquals(filtered.appliedTag, "conditionals");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length >= 6,
    "should supply at least six conditional cues",
  );
  filtered.cues.forEach((cue) => assertEquals(cue.level, "B2"));
});

Deno.test("applySkillFocusCueFilter normalises trailing punctuation in skill focus requests", () => {
  const baseCues = keywordCueBankByLevel.B2;
  const filtered = applySkillFocusCueFilter(" conditionals! ", baseCues, 6);
  assertEquals(filtered.requestedTag, "conditionals");
  assertEquals(filtered.appliedTag, "conditionals");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length >= 6,
    "should supply at least six conditional cues",
  );
});

Deno.test("applySkillFocusCueFilter retains critical C1 modality cues", () => {
  const baseCues = keywordCueBankByLevel.C1;
  const filtered = applySkillFocusCueFilter("modality", baseCues, 6);
  assertEquals(filtered.requestedTag, "modality");
  assertEquals(filtered.appliedTag, "modality");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length >= 6,
    "should supply at least six C1 modality cues",
  );
  assert(
    filtered.cues.some((cue) => cue.id === "C1_CANT_CANT_HAVE_BEEN_PLEASED"),
    "modality filter should include C1_CANT_CANT_HAVE_BEEN_PLEASED",
  );
  assert(
    filtered.cues.some((cue) => cue.operator === "can't have been"),
    'modality filter should retain the "can\'t have been" operator',
  );
});

Deno.test("applySkillFocusCueFilter strips punctuation-induced hyphens from normalised tags", () => {
  const baseCues = keywordCueBankByLevel.C1;
  const filtered = applySkillFocusCueFilter("Inversion???", baseCues, 5);
  assertEquals(filtered.requestedTag, "inversion");
  assertEquals(filtered.appliedTag, "inversion");
  assertEquals(filtered.fallbackApplied, false);
});

Deno.test("applySkillFocusCueFilter now supplies sufficient B2 modality cues", () => {
  const baseCues = keywordCueBankByLevel.B2;
  const filtered = applySkillFocusCueFilter("modality", baseCues, 6);
  assertEquals(filtered.requestedTag, "modality");
  assertEquals(filtered.appliedTag, "modality");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length >= 6,
    "should surface at least six B2 modality cues",
  );
  filtered.cues.forEach((cue) => assertEquals(cue.level, "B2"));
});

Deno.test("applySkillFocusCueFilter now supplies sufficient C2 modality cues", () => {
  const baseCues = keywordCueBankByLevel.C2;
  const filtered = applySkillFocusCueFilter("modality", baseCues, 6);
  assertEquals(filtered.requestedTag, "modality");
  assertEquals(filtered.appliedTag, "modality");
  assertEquals(filtered.fallbackApplied, false);
  assert(
    filtered.cues.length >= 6,
    "should surface at least six C2 modality cues",
  );
  filtered.cues.forEach((cue) => assertEquals(cue.level, "C2"));
});

Deno.test("applySkillFocusCueFilter flags fallback when tag is unmapped", () => {
  const baseCues = keywordCueBankByLevel.C1;
  const filtered = applySkillFocusCueFilter("unknown-focus", baseCues, 5);
  assertEquals(filtered.appliedTag, undefined);
  assertEquals(filtered.requestedTag, "unknown-focus");
  assertEquals(filtered.fallbackApplied, true);
  assertEquals(filtered.matchedCount, 0);
  assertEquals(filtered.cues, baseCues);
});

Deno.test("selectKeywordCuePlan metadata preserves provided filtered counts", () => {
  const cues = keywordCueBankByLevel.C1.slice(0, 10);
  const filteredCount = 3;
  const totalAvailable = 42;
  const plan = selectKeywordCuePlan({
    cues,
    questionCount: 6,
    seed: "metadata-retention",
    skillFocusTag: "modality",
    filterStats: { filteredCount, totalAvailable },
  });
  assertEquals(plan.metadata.appliedSkillFocusTag, "modality");
  assertEquals(plan.metadata.filteredCount, filteredCount);
  assertEquals(plan.metadata.totalAvailable, totalAvailable);
});

Deno.test("skill focus cue map references valid cue identifiers", () => {
  const cueIndex = new Map<string, KeywordCue>();
  for (const levelCues of Object.values(keywordCueBankByLevel)) {
    for (const cue of levelCues ?? []) {
      cueIndex.set(cue.id, cue);
    }
  }

  for (const [tag, entry] of Object.entries(keywordCueSkillFocusMap)) {
    for (const cueId of entry.cueIds ?? []) {
      assert(
        cueIndex.has(cueId),
        `skill focus "${tag}" references missing cue "${cueId}"`,
      );
    }
  }
});

Deno.test("keyword cue bank passes integrity validation", () => {
  for (const levelCues of Object.values(keywordCueBankByLevel)) {
    for (const cue of levelCues ?? []) {
      assertKeywordCueIntegrity(cue);
    }
  }
});

Deno.test("applySkillFocusCueFilter restricts to cue IDs when operators are absent", () => {
  const baseCues = keywordCueBankByLevel.C1;
  const targetCue = baseCues.find((cue) =>
    cue.id === "C1_RATHER_WOULD_RATHER_YOU"
  );
  const tag = "test-skill-focus-id-only";
  assert(targetCue, "expected test cue to exist");

  keywordCueSkillFocusMap[tag] = { cueIds: [targetCue.id] };
  try {
    const filtered = applySkillFocusCueFilter(tag, baseCues, 1);
    // when the tag is matched exactly, the metadata must reflect the tag and the focused cue list
    assertEquals(filtered.appliedTag, tag);
    assertEquals(filtered.requestedTag, tag);
    assertEquals(filtered.fallbackApplied, false);
    assertEquals(filtered.cues.length, 1);
    assertEquals(filtered.cues[0].id, targetCue.id);
  } finally {
    delete keywordCueSkillFocusMap[tag];
  }
});
