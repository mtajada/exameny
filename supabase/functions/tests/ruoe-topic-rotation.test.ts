import { assert, assertEquals, assertNotEquals } from "std/testing/asserts.ts";

import {
  getRuoETaskPromptConfig,
  getSampleThemesFor,
} from "../_shared/ruoe-layout-config.ts";

Deno.test("getSampleThemesFor returns deterministic, level-scoped rotations", () => {
  const config = getRuoETaskPromptConfig("B2_LANG_MC_CLOZE");
  const levelBank = config.sampleThemesByLevel?.B2 ?? [];
  assert(levelBank.length >= 5, "Expected at least five topics in the B2 bank");

  const seed = "phase5-determinism";
  const first = getSampleThemesFor("B2_LANG_MC_CLOZE", "B2", 5, seed);
  const second = getSampleThemesFor("B2_LANG_MC_CLOZE", "b2", 5, seed);
  assertEquals(
    second,
    first,
    "Same seed and level should yield identical rotation",
  );

  first.forEach((topic) => {
    assert(
      levelBank.includes(topic),
      `Topic "${topic}" should come from the B2 bank`,
    );
  });

  const alternate = getSampleThemesFor(
    "B2_LANG_MC_CLOZE",
    "B2",
    5,
    "phase5-alt-seed",
  );
  assertEquals(
    alternate.length,
    5,
    "Alternate seed should still yield requested count",
  );
  assert(
    alternate.some((topic, index) => topic !== first[index]),
    "Different seed should rotate ordering",
  );

  const defaultSeedSample = getSampleThemesFor("B2_LANG_MC_CLOZE", "B2", 5);
  assertEquals(
    defaultSeedSample.length,
    5,
    "Default seed should fall back to deterministic sample size",
  );
  defaultSeedSample.forEach((topic) => {
    assert(
      levelBank.includes(topic),
      `Topic "${topic}" should come from the B2 bank`,
    );
  });

  const coverageChecks = [
    { taskCode: "B1_LANG_OPEN_CLOZE", level: "B1", minimum: 50 },
    { taskCode: "B1_READ_MCQ_SHORT", level: "B1", minimum: 50 },
    { taskCode: "B2_LANG_MC_CLOZE", level: "B2", minimum: 50 },
    { taskCode: "B2_LANG_WORD_FORMATION", level: "B2", minimum: 50 },
    { taskCode: "B2_READ_GAPPED_TEXT", level: "B2", minimum: 50 },
    { taskCode: "C1_LANG_MC_CLOZE", level: "C1", minimum: 50 },
    { taskCode: "C1_LANG_WORD_FORMATION", level: "C1", minimum: 50 },
    { taskCode: "C1_READ_MCQ", level: "C1", minimum: 50 },
    { taskCode: "C1_READ_CROSS_TEXT", level: "C1", minimum: 50 },
    { taskCode: "C2_LANG_MC_CLOZE", level: "C2", minimum: 50 },
    { taskCode: "C2_LANG_WORD_FORMATION", level: "C2", minimum: 50 },
    { taskCode: "C2_READ_MULTIPLE_MATCHING", level: "C2", minimum: 50 },
  ] as const;

  for (const { taskCode, level, minimum } of coverageChecks) {
    const taskConfig = getRuoETaskPromptConfig(taskCode);
    const bank = taskConfig.sampleThemesByLevel?.[level] ?? [];
    assert(
      bank.length >= minimum,
      `Expected at least ${minimum} topics for ${taskCode} (${level}), found ${bank.length}`,
    );
    const rotation = getSampleThemesFor(
      taskCode,
      level,
      5,
      "phase7-regression",
    );
    assert(rotation.length > 0, `Rotation should not be empty for ${taskCode}`);
    rotation.forEach((topic) => {
      assert(
        bank.includes(topic),
        `Topic "${topic}" for ${taskCode} should come from the level bank`,
      );
    });
  }
});

Deno.test("ruoe-open-cloze uses the generic level topic bank, not the multiple matching bank", () => {
  const mcClozeConfig = getRuoETaskPromptConfig("C1_LANG_MC_CLOZE");
  const openClozeConfig = getRuoETaskPromptConfig("C1_LANG_OPEN_CLOZE");
  const multipleMatchingConfig = getRuoETaskPromptConfig(
    "C1_READ_MULTIPLE_MATCHING",
  );

  assert(
    openClozeConfig.sampleThemesByLevel?.C1,
    "Expected open-cloze C1 topic bank to exist",
  );
  assert(
    mcClozeConfig.sampleThemesByLevel?.C1,
    "Expected MC cloze C1 topic bank to exist",
  );
  assert(
    multipleMatchingConfig.sampleThemesByLevel?.C1,
    "Expected multiple matching C1 topic bank to exist",
  );

  assertEquals(
    openClozeConfig.sampleThemesByLevel?.C1,
    mcClozeConfig.sampleThemesByLevel?.C1,
    "Open cloze should reuse the generic level topic bank",
  );

  assertNotEquals(
    openClozeConfig.sampleThemesByLevel?.C1,
    multipleMatchingConfig.sampleThemesByLevel?.C1,
    "Open cloze must not be wired to the multiple matching topic bank",
  );
});
