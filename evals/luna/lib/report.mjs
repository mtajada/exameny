import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_PUBLIC_PATTERNS } from "./constants.mjs";
import { EvalError } from "./errors.mjs";

export const EVAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function assertPublicReportSafe(report) {
  const serialized = JSON.stringify(report);
  for (const entry of FORBIDDEN_PUBLIC_PATTERNS) {
    if (entry.pattern.test(serialized)) {
      throw new EvalError("unsafe_public_report", `Public report contains a forbidden ${entry.label}`);
    }
  }
  return serialized;
}

export async function writePublicReport(report, outputPath) {
  const resolved = isAbsolute(outputPath)
    ? resolve(outputPath)
    : resolve(EVAL_ROOT, outputPath);
  const relativePath = relative(EVAL_ROOT, resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new EvalError("unsafe_output_path", "Reports must stay inside evals/luna");
  }
  const serialized = assertPublicReportSafe(report);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${serialized}\n`, { encoding: "utf8", mode: 0o644 });
  return relativePath;
}
