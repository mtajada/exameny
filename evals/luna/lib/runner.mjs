import {
  ABSOLUTE_MAX_BUDGET_USD,
  CATEGORIES,
  DEFAULT_ATTEMPTS,
  DEFAULT_BUDGET_USD,
  DEFAULT_CONCURRENCY,
  MAX_ATTEMPTS,
  MAX_CONCURRENCY,
  MODEL,
  OFFICIAL_PRICING_USD_PER_MILLION,
  PRICING_AS_OF,
  PRICING_SOURCE_URL,
  QUALITY_THRESHOLDS,
  REQUEST_TIMEOUT_MS,
  RESPONSES_ENDPOINT,
} from "./constants.mjs";
import {
  actualCostUsd,
  normalizeUsage,
  preflightBudget,
} from "./cost.mjs";
import { EvalError } from "./errors.mjs";
import { gradeOutput } from "./grading.mjs";
import { assertPublicReportSafe } from "./report.mjs";
import { buildRequestBody } from "./request.mjs";
import { SCHEMAS } from "./schemas.mjs";
import { validateSchema } from "./schema-validator.mjs";

export async function runEvaluation(options) {
  const {
    cases,
    mode = "dry-run",
    apiKey,
    fetchImpl = globalThis.fetch,
    budgetUsd = DEFAULT_BUDGET_USD,
    concurrency = DEFAULT_CONCURRENCY,
    maximumAttempts = DEFAULT_ATTEMPTS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = options;

  validateExecutionOptions({ mode, apiKey, fetchImpl, concurrency, maximumAttempts, timeoutMs });
  const requestBodies = cases.map((record) => buildRequestBody(record));
  const reservation = preflightBudget(requestBodies, budgetUsd, maximumAttempts);
  const startedAt = new Date(now()).toISOString();

  if (mode === "dry-run") {
    const report = buildDryRunReport({
      cases,
      reservation,
      budgetUsd,
      concurrency,
      maximumAttempts,
      startedAt,
    });
    assertPublicReportSafe(report);
    return report;
  }

  const results = new Array(cases.length);
  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= cases.length) return;
      results[index] = await runLiveCase({
        caseRecord: cases[index],
        body: requestBodies[index],
        apiKey,
        fetchImpl,
        maximumAttempts,
        timeoutMs,
        worstCaseAttemptCostUsd: reservation.cases[index].costUsd,
        sleep,
      });
    }
  });
  await Promise.all(workers);

  const report = buildLiveReport({
    cases,
    results,
    reservation,
    budgetUsd,
    concurrency,
    maximumAttempts,
    startedAt,
    completedAt: new Date(now()).toISOString(),
  });
  assertPublicReportSafe(report);
  return report;
}

async function runLiveCase({
  caseRecord,
  body,
  apiKey,
  fetchImpl,
  maximumAttempts,
  timeoutMs,
  worstCaseAttemptCostUsd,
  sleep,
}) {
  const caseStartedAt = performance.now();
  let accountedFailureCostUsd = 0;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, RESPONSES_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, timeoutMs);
    } catch (error) {
      accountedFailureCostUsd += worstCaseAttemptCostUsd;
      if (attempt < maximumAttempts && isRetryableFetchError(error)) {
        await sleep(250 * attempt);
        continue;
      }
      return failedCase(caseRecord, "network_or_timeout", attempt, performance.now() - caseStartedAt, accountedFailureCostUsd);
    }

    if (!response.ok) {
      accountedFailureCostUsd += worstCaseAttemptCostUsd;
      if (attempt < maximumAttempts && (response.status === 429 || response.status >= 500)) {
        await sleep(250 * attempt);
        continue;
      }
      return failedCase(caseRecord, `http_${response.status}`, attempt, performance.now() - caseStartedAt, accountedFailureCostUsd);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      accountedFailureCostUsd += worstCaseAttemptCostUsd;
      return failedCase(caseRecord, "invalid_provider_json", attempt, performance.now() - caseStartedAt, accountedFailureCostUsd);
    }

    const latencyMs = performance.now() - caseStartedAt;
    const usage = normalizeUsage(payload);
    const successfulAttemptCost = actualCostUsd(usage) ?? worstCaseAttemptCostUsd;
    const accountedCostUsd = accountedFailureCostUsd + successfulAttemptCost;
    if (payload.status !== "completed") {
      return failedCase(caseRecord, "response_not_completed", attempt, latencyMs, accountedCostUsd, usage);
    }
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return failedCase(caseRecord, "missing_output_text", attempt, latencyMs, accountedCostUsd, usage);
    }
    let output;
    try {
      output = JSON.parse(outputText);
    } catch {
      return failedCase(caseRecord, "invalid_output_json", attempt, latencyMs, accountedCostUsd, usage);
    }
    const schemaErrors = validateSchema(output, SCHEMAS[caseRecord.category]);
    if (schemaErrors.length > 0) {
      return {
        ...baseCase(caseRecord),
        status: "failed",
        failureCode: "schema_validation_failed",
        attempts: attempt,
        latencyMs,
        usage,
        costUsd: actualCostUsd(usage),
        accountedCostUsd,
        structuredOutput: false,
        schemaErrorCount: schemaErrors.length,
        grade: null,
        output: null,
      };
    }
    const grade = gradeOutput(output, caseRecord.expectations);
    return {
      ...baseCase(caseRecord),
      status: grade.passed ? "passed" : "failed",
      failureCode: grade.passed ? null : "expectation_failed",
      attempts: attempt,
      latencyMs,
      usage,
      costUsd: actualCostUsd(usage),
      accountedCostUsd,
      structuredOutput: true,
      schemaErrorCount: 0,
      grade,
      output,
    };
  }
  throw new EvalError("attempt_loop_error", "The bounded attempt loop ended unexpectedly");
}

function buildDryRunReport({
  cases,
  reservation,
  budgetUsd,
  concurrency,
  maximumAttempts,
  startedAt,
}) {
  return {
    schemaVersion: "1.0",
    generatedAt: startedAt,
    mode: "dry-run",
    status: "validated",
    model: MODEL,
    api: { endpoint: "/v1/responses", store: false, strictStructuredOutputs: true },
    suite: suiteSummary(cases),
    execution: { concurrency, maximumAttempts, networkRequests: 0 },
    cost: {
      currency: "USD",
      budgetUsd,
      absoluteBudgetCeilingUsd: ABSOLUTE_MAX_BUDGET_USD,
      suiteWorstCaseUsd: reservation.suiteWorstCaseUsd,
      pricingPerMillionTokens: OFFICIAL_PRICING_USD_PER_MILLION,
      pricingAsOf: PRICING_AS_OF,
      pricingSource: PRICING_SOURCE_URL,
    },
    qualityGates: { status: "not_evaluated", reason: "A dry run does not measure model quality" },
    cases: cases.map((record, index) => ({
      ...baseCase(record),
      expectationCount: record.expectations.length,
      worstCaseCostUsd: reservation.cases[index].costUsd * maximumAttempts,
    })),
  };
}

function buildLiveReport({
  cases,
  results,
  reservation,
  budgetUsd,
  concurrency,
  maximumAttempts,
  startedAt,
  completedAt,
}) {
  const totalCostUsd = sum(results.map((result) => result.costUsd ?? 0));
  const accountedCostUsd = sum(results.map((result) => result.accountedCostUsd));
  if (accountedCostUsd > budgetUsd + Number.EPSILON) {
    throw new EvalError("budget_invariant_failed", "Accounted cost exceeded the selected budget");
  }
  const qualityGates = calculateQualityGates(cases, results, accountedCostUsd);
  return {
    schemaVersion: "1.0",
    generatedAt: completedAt,
    runStartedAt: startedAt,
    mode: "live",
    status: qualityGates.passed ? "passed" : "failed",
    model: MODEL,
    api: { endpoint: "/v1/responses", store: false, strictStructuredOutputs: true },
    suite: suiteSummary(cases),
    execution: {
      concurrency,
      maximumAttempts,
      requestAttempts: sum(results.map((result) => result.attempts)),
    },
    cost: {
      currency: "USD",
      budgetUsd,
      absoluteBudgetCeilingUsd: ABSOLUTE_MAX_BUDGET_USD,
      suiteWorstCaseUsd: reservation.suiteWorstCaseUsd,
      measuredCostUsd: totalCostUsd,
      accountedCostUsd,
      pricingPerMillionTokens: OFFICIAL_PRICING_USD_PER_MILLION,
      pricingAsOf: PRICING_AS_OF,
      pricingSource: PRICING_SOURCE_URL,
    },
    latency: latencySummary(results.filter((result) => result.structuredOutput).map((result) => result.latencyMs)),
    qualityGates,
    cases: results,
  };
}

function calculateQualityGates(cases, results, accountedCostUsd) {
  const passCount = results.filter((result) => result.status === "passed").length;
  const structuredCount = results.filter((result) => result.structuredOutput).length;
  const safetyIndexes = cases
    .map((record, index) => (record.adversarial ? index : -1))
    .filter((index) => index >= 0);
  const safetyPassCount = safetyIndexes.filter((index) => {
    const record = cases[index];
    const result = results[index];
    const safetyExpectationIndexes = record.expectations
      .map((expectation, expectationIndex) =>
        expectation.path === "injectionIgnored" || expectation.op === "notContains"
          ? expectationIndex + 1
          : -1)
      .filter((expectationIndex) => expectationIndex >= 0);
    const checks = new Map(
      (result.grade?.checks ?? []).map((check) => [check.index, check.passed]),
    );
    return (
      result.structuredOutput &&
      safetyExpectationIndexes.length > 0 &&
      safetyExpectationIndexes.every((expectationIndex) => checks.get(expectationIndex) === true)
    );
  }).length;
  const categoryPassRates = Object.fromEntries(
    CATEGORIES.map((category) => {
      const categoryResults = results.filter((result) => result.category === category);
      return [category, categoryResults.filter((result) => result.status === "passed").length / categoryResults.length];
    }),
  );
  const latency = latencySummary(results.filter((result) => result.structuredOutput).map((result) => result.latencyMs));
  const checks = {
    overallPassRate: {
      value: passCount / results.length,
      threshold: QUALITY_THRESHOLDS.minimumOverallPassRate,
      passed: passCount / results.length >= QUALITY_THRESHOLDS.minimumOverallPassRate,
    },
    perCategoryPassRate: {
      values: categoryPassRates,
      threshold: QUALITY_THRESHOLDS.minimumCategoryPassRate,
      passed: Object.values(categoryPassRates).every((rate) => rate >= QUALITY_THRESHOLDS.minimumCategoryPassRate),
    },
    safetyPassRate: {
      value: safetyPassCount / safetyIndexes.length,
      threshold: QUALITY_THRESHOLDS.requiredSafetyPassRate,
      passed: safetyPassCount / safetyIndexes.length === QUALITY_THRESHOLDS.requiredSafetyPassRate,
    },
    structuredOutputRate: {
      value: structuredCount / results.length,
      threshold: QUALITY_THRESHOLDS.requiredStructuredOutputRate,
      passed: structuredCount / results.length === QUALITY_THRESHOLDS.requiredStructuredOutputRate,
    },
    p95LatencyMs: {
      value: latency.p95Ms,
      threshold: QUALITY_THRESHOLDS.maximumP95LatencyMs,
      passed: latency.p95Ms !== null && latency.p95Ms <= QUALITY_THRESHOLDS.maximumP95LatencyMs,
    },
    accountedCostUsd: {
      value: accountedCostUsd,
      threshold: QUALITY_THRESHOLDS.maximumEvidenceCostUsd,
      passed: accountedCostUsd <= QUALITY_THRESHOLDS.maximumEvidenceCostUsd,
    },
  };
  return { passed: Object.values(checks).every((check) => check.passed), checks };
}

function suiteSummary(cases) {
  return {
    caseCount: cases.length,
    adversarialCaseCount: cases.filter((record) => record.adversarial).length,
    categoryCounts: Object.fromEntries(CATEGORIES.map((category) => [category, cases.filter((record) => record.category === category).length])),
    levelCounts: Object.fromEntries(["B1", "B2", "C1"].map((level) => [level, cases.filter((record) => record.level === level).length])),
  };
}

function baseCase(caseRecord) {
  return {
    caseId: caseRecord.id,
    category: caseRecord.category,
    level: caseRecord.level,
    adversarial: caseRecord.adversarial,
  };
}

function failedCase(caseRecord, failureCode, attempts, latencyMs, accountedCostUsd, usage = null) {
  return {
    ...baseCase(caseRecord),
    status: "failed",
    failureCode,
    attempts,
    latencyMs,
    usage,
    costUsd: actualCostUsd(usage),
    accountedCostUsd,
    structuredOutput: false,
    schemaErrorCount: null,
    grade: null,
    output: null,
  };
}

function extractOutputText(payload) {
  for (const item of payload.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(handle);
  }
}

function isRetryableFetchError(error) {
  return error?.name !== "AbortError";
}

function validateExecutionOptions({ mode, apiKey, fetchImpl, concurrency, maximumAttempts, timeoutMs }) {
  if (!['dry-run', 'live'].includes(mode)) {
    throw new EvalError("invalid_mode", "Mode must be dry-run or live");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new EvalError("invalid_concurrency", "Concurrency must be one or two");
  }
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > MAX_ATTEMPTS) {
    throw new EvalError("invalid_attempt_count", "Maximum attempts must be one or two");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > REQUEST_TIMEOUT_MS) {
    throw new EvalError("invalid_timeout", "Timeout must be between one and forty-five seconds");
  }
  if (mode === "live" && (typeof apiKey !== "string" || apiKey.length === 0)) {
    throw new EvalError("missing_api_key", "Live mode needs a credential loaded from the selected env file");
  }
  if (mode === "live" && typeof fetchImpl !== "function") {
    throw new EvalError("missing_fetch", "Live mode needs a fetch implementation");
  }
}

function latencySummary(values) {
  if (values.length === 0) return { count: 0, medianMs: null, p95Ms: null, maximumMs: null };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maximumMs: sorted.at(-1),
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
