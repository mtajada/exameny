import { readFile } from "node:fs/promises";

import { CATEGORIES, LEVELS } from "./constants.mjs";
import { EvalError } from "./errors.mjs";
import { SCHEMAS, assertStrictSchema } from "./schemas.mjs";

const CASES_URL = new URL("../fixtures/cases.json", import.meta.url);
const SUPPORTED_OPERATIONS = new Set([
  "equals",
  "includes",
  "between",
  "minItems",
  "notContains",
]);

export async function loadCases(url = CASES_URL) {
  const raw = await readFile(url, "utf8");
  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    throw new EvalError("invalid_fixture_json", "Fixture JSON is invalid");
  }
  validateCases(records);
  return records;
}

export function validateCases(records) {
  if (!Array.isArray(records) || records.length !== 24) {
    throw new EvalError("invalid_case_count", "The suite must contain 24 cases");
  }

  const ids = new Set();
  const categoryCounts = Object.fromEntries(CATEGORIES.map((name) => [name, 0]));
  const levelCounts = Object.fromEntries(LEVELS.map((name) => [name, 0]));
  const categoryLevels = Object.fromEntries(
    CATEGORIES.map((name) => [name, new Set()]),
  );
  let adversarialCount = 0;

  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new EvalError("invalid_case", "Every case must be an object");
    }
    if (typeof record.id !== "string" || !/^[a-z0-9-]{5,40}$/.test(record.id)) {
      throw new EvalError("invalid_case_id", "Every case needs a stable safe ID");
    }
    if (ids.has(record.id)) {
      throw new EvalError("duplicate_case_id", "Case IDs must be unique");
    }
    ids.add(record.id);

    if (!CATEGORIES.includes(record.category)) {
      throw new EvalError("invalid_category", "A case has an unsupported category");
    }
    if (!LEVELS.includes(record.level)) {
      throw new EvalError("invalid_level", "A case has an unsupported level");
    }
    if (typeof record.title !== "string" || record.title.trim().length < 5) {
      throw new EvalError("invalid_title", "Every case needs a meaningful title");
    }
    if (typeof record.adversarial !== "boolean") {
      throw new EvalError("invalid_adversarial_flag", "Every case needs an adversarial flag");
    }
    if (!record.input || typeof record.input !== "object" || Array.isArray(record.input)) {
      throw new EvalError("invalid_input", "Every case needs an input object");
    }
    if (!Array.isArray(record.expectations) || record.expectations.length < 5) {
      throw new EvalError("invalid_expectations", "Every case needs at least five checks");
    }
    for (const expectation of record.expectations) {
      validateExpectation(expectation);
    }

    categoryCounts[record.category] += 1;
    levelCounts[record.level] += 1;
    categoryLevels[record.category].add(record.level);
    adversarialCount += Number(record.adversarial);
  }

  for (const category of CATEGORIES) {
    if (categoryCounts[category] !== 6) {
      throw new EvalError("unbalanced_categories", "Each category must have six cases");
    }
    if (categoryLevels[category].size !== LEVELS.length) {
      throw new EvalError("missing_category_level", "Each category must cover B1, B2, and C1");
    }
    assertStrictSchema(SCHEMAS[category], `schemas.${category}`);
  }
  for (const level of LEVELS) {
    if (levelCounts[level] !== 8) {
      throw new EvalError("unbalanced_levels", "Each level must have eight cases");
    }
  }
  if (adversarialCount < 8) {
    throw new EvalError("insufficient_adversarial_cases", "At least eight cases must be adversarial");
  }

  return {
    caseCount: records.length,
    categoryCounts,
    levelCounts,
    adversarialCount,
  };
}

function validateExpectation(expectation) {
  if (!expectation || typeof expectation !== "object" || Array.isArray(expectation)) {
    throw new EvalError("invalid_expectation", "An expectation must be an object");
  }
  if (!SUPPORTED_OPERATIONS.has(expectation.op)) {
    throw new EvalError("unsupported_expectation", "An expectation operation is unsupported");
  }
  if (typeof expectation.path !== "string" || expectation.path.length === 0) {
    throw new EvalError("invalid_expectation_path", "An expectation path is required");
  }
  if (expectation.op === "between") {
    if (!Number.isFinite(expectation.minimum) || !Number.isFinite(expectation.maximum)) {
      throw new EvalError("invalid_range", "A range expectation needs numeric bounds");
    }
    if (expectation.minimum > expectation.maximum) {
      throw new EvalError("invalid_range", "A range minimum cannot exceed its maximum");
    }
  }
  if (expectation.op === "minItems" && !Number.isInteger(expectation.minimum)) {
    throw new EvalError("invalid_min_items", "A minItems expectation needs an integer minimum");
  }
}
