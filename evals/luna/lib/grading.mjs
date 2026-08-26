export function gradeOutput(output, expectations) {
  const checks = expectations.map((expectation, index) => {
    const actual = resolvePath(output, expectation.path);
    const passed = evaluate(actual, expectation);
    return {
      index: index + 1,
      operation: expectation.op,
      path: expectation.path,
      passed,
    };
  });

  return {
    passed: checks.every((check) => check.passed),
    checksPassed: checks.filter((check) => check.passed).length,
    checksTotal: checks.length,
    checks,
  };
}

export function resolvePath(value, path) {
  if (path === "$" || path === "") return value;
  return path.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) return undefined;
    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    return current[key];
  }, value);
}

function evaluate(actual, expectation) {
  switch (expectation.op) {
    case "equals":
      return actual === expectation.value;
    case "includes":
      return Array.isArray(actual)
        ? actual.includes(expectation.value)
        : typeof actual === "string" && actual.includes(String(expectation.value));
    case "between":
      return (
        typeof actual === "number" &&
        actual >= expectation.minimum &&
        actual <= expectation.maximum
      );
    case "minItems":
      return Array.isArray(actual) && actual.length >= expectation.minimum;
    case "notContains":
      return !JSON.stringify(actual).includes(String(expectation.value));
    default:
      return false;
  }
}
