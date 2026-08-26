#!/usr/bin/env node

import { parseArguments } from "./lib/cli.mjs";
import { loadCases } from "./lib/cases.mjs";
import { loadApiKeyFromExplicitFile } from "./lib/env.mjs";
import { publicErrorCode } from "./lib/errors.mjs";
import { writePublicReport } from "./lib/report.mjs";
import { runEvaluation } from "./lib/runner.mjs";

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cases = await loadCases();
  const apiKey = options.mode === "live"
    ? await loadApiKeyFromExplicitFile(options.envFile)
    : undefined;
  const report = await runEvaluation({
    cases,
    mode: options.mode,
    apiKey,
    budgetUsd: options.budgetUsd,
    concurrency: options.concurrency,
    maximumAttempts: options.maximumAttempts,
  });
  const output = options.output
    ? await writePublicReport(report, options.output)
    : null;
  const summary = {
    mode: report.mode,
    status: report.status,
    cases: report.suite.caseCount,
    adversarialCases: report.suite.adversarialCaseCount,
    worstCaseUsd: report.cost.suiteWorstCaseUsd,
    output,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Luna eval failed safely: ${publicErrorCode(error)}\n`);
  process.exitCode = 1;
});
