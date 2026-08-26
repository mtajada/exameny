import {
  DEFAULT_ATTEMPTS,
  DEFAULT_BUDGET_USD,
  DEFAULT_CONCURRENCY,
} from "./constants.mjs";
import { EvalError } from "./errors.mjs";

const LIVE_CONFIRMATION = "I_UNDERSTAND_THIS_USES_PAID_API";
const VALUE_FLAGS = new Set([
  "--mode",
  "--env-file",
  "--budget-usd",
  "--concurrency",
  "--max-attempts",
  "--output",
  "--confirm-live",
]);

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_FLAGS.has(flag)) {
      throw new EvalError("unknown_argument", "An unsupported command-line option was supplied");
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new EvalError("missing_argument_value", "A command-line option is missing its value");
    }
    if (values.has(flag)) {
      throw new EvalError("duplicate_argument", "A command-line option was supplied more than once");
    }
    values.set(flag, value);
    index += 1;
  }

  const mode = values.get("--mode") ?? "dry-run";
  const parsed = {
    mode,
    envFile: values.get("--env-file") ?? null,
    budgetUsd: numberOption(values.get("--budget-usd"), DEFAULT_BUDGET_USD),
    concurrency: integerOption(values.get("--concurrency"), DEFAULT_CONCURRENCY),
    maximumAttempts: integerOption(values.get("--max-attempts"), DEFAULT_ATTEMPTS),
    output: values.get("--output") ?? null,
    confirmation: values.get("--confirm-live") ?? null,
  };

  if (mode === "live") {
    if (parsed.confirmation !== LIVE_CONFIRMATION) {
      throw new EvalError("live_confirmation_required", "Live mode requires the exact confirmation token");
    }
    if (!parsed.envFile) {
      throw new EvalError("env_path_required", "Live mode requires an explicit env-file path");
    }
  } else if (mode === "dry-run") {
    if (parsed.envFile || parsed.confirmation) {
      throw new EvalError("dry_run_live_option", "Dry-run mode rejects credential-related options");
    }
  } else {
    throw new EvalError("invalid_mode", "Mode must be dry-run or live");
  }
  return parsed;
}

export { LIVE_CONFIRMATION };

function numberOption(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new EvalError("invalid_number", "A numeric option is invalid");
  }
  return parsed;
}

function integerOption(value, fallback) {
  const parsed = numberOption(value, fallback);
  if (!Number.isInteger(parsed)) {
    throw new EvalError("invalid_integer", "An integer option is invalid");
  }
  return parsed;
}
