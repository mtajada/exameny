import {
  ABSOLUTE_MAX_BUDGET_USD,
  INPUT_TOKEN_OVERHEAD,
  MAX_INPUT_BYTES,
  OFFICIAL_PRICING_USD_PER_MILLION,
} from "./constants.mjs";
import { BudgetError, EvalError } from "./errors.mjs";

const ONE_MILLION = 1_000_000;

export function validateBudget(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BudgetError("Budget must be a positive finite amount");
  }
  if (value > ABSOLUTE_MAX_BUDGET_USD) {
    throw new BudgetError("Budget exceeds the hard USD 0.75 ceiling");
  }
  return value;
}

export function estimateWorstCaseRequestCost(body) {
  const requestBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (requestBytes > MAX_INPUT_BYTES) {
    throw new EvalError("request_too_large", "A request exceeds the input bound");
  }
  const inputTokenUpperBound = requestBytes + INPUT_TOKEN_OVERHEAD;
  const outputTokenUpperBound = body.max_output_tokens;
  const costUsd =
    (inputTokenUpperBound * OFFICIAL_PRICING_USD_PER_MILLION.input +
      outputTokenUpperBound * OFFICIAL_PRICING_USD_PER_MILLION.output) /
    ONE_MILLION;
  return {
    requestBytes,
    inputTokenUpperBound,
    outputTokenUpperBound,
    costUsd,
  };
}

export function preflightBudget(bodies, budgetUsd, maximumAttempts) {
  validateBudget(budgetUsd);
  const cases = bodies.map((body) => estimateWorstCaseRequestCost(body));
  const suiteWorstCaseUsd = cases.reduce(
    (sum, estimate) => sum + estimate.costUsd * maximumAttempts,
    0,
  );
  if (suiteWorstCaseUsd > budgetUsd) {
    throw new BudgetError("The suite's worst-case reservation exceeds the selected budget");
  }
  return { cases, suiteWorstCaseUsd };
}

export function normalizeUsage(payload) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = nonNegativeInteger(usage.input_tokens);
  const outputTokens = nonNegativeInteger(usage.output_tokens);
  const cachedInputTokens = nonNegativeInteger(
    usage.input_tokens_details?.cached_tokens,
  );
  if (inputTokens === null || outputTokens === null || cachedInputTokens === null) {
    return null;
  }
  if (cachedInputTokens > inputTokens) return null;
  return { inputTokens, cachedInputTokens, outputTokens };
}

export function actualCostUsd(usage) {
  if (!usage) return null;
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  return (
    (uncachedInputTokens * OFFICIAL_PRICING_USD_PER_MILLION.input +
      usage.cachedInputTokens * OFFICIAL_PRICING_USD_PER_MILLION.cachedInput +
      usage.outputTokens * OFFICIAL_PRICING_USD_PER_MILLION.output) /
    ONE_MILLION
  );
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}
