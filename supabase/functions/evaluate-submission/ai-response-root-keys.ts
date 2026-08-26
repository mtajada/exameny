export type RootKeysAnalysis = {
  missing: string[];
  unexpected: string[];
};

export function analyzeRootKeys(
  payload: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): RootKeysAnalysis {
  const keys = Object.keys(payload);
  const missing = requiredKeys.filter((key) => !keys.includes(key));
  const unexpected = keys.filter((key) =>
    !requiredKeys.includes(key) && !optionalKeys.includes(key)
  );
  return { missing, unexpected };
}

export type RootKeysValidationResult = RootKeysAnalysis & {
  ok: boolean;
};

export function validateAiResponseRootKeys(
  payload: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): RootKeysValidationResult {
  const { missing, unexpected } = analyzeRootKeys(
    payload,
    requiredKeys,
    optionalKeys,
  );
  return {
    ok: missing.length === 0,
    missing,
    unexpected,
  };
}
