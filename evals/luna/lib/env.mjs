import { lstat, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { EvalError } from "./errors.mjs";

export async function loadApiKeyFromExplicitFile(filePath) {
  if (typeof filePath !== "string" || !isAbsolute(filePath)) {
    throw new EvalError("env_path_required", "Live mode requires an absolute env-file path");
  }
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch {
    throw new EvalError("env_file_unavailable", "The selected env file is unavailable");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new EvalError("unsafe_env_file", "The selected env path must be a regular file");
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new EvalError("unsafe_env_permissions", "The selected env file must not be group- or world-readable");
  }

  const contents = await readFile(filePath, "utf8");
  const key = parseNamedValue(contents, "OPENAI_API_KEY");
  if (!key) {
    throw new EvalError("missing_api_key", "The selected env file has no usable API credential");
  }
  return key;
}

function parseNamedValue(contents, name) {
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length)
      : trimmed;
    const separator = withoutExport.indexOf("=");
    if (separator < 1 || withoutExport.slice(0, separator).trim() !== name) continue;
    const rawValue = withoutExport.slice(separator + 1).trim();
    if (
      rawValue.length >= 2 &&
      ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'")))
    ) {
      return rawValue.slice(1, -1).trim() || null;
    }
    return rawValue || null;
  }
  return null;
}
