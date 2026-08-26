export class EvalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EvalError";
    this.code = code;
  }
}

export class BudgetError extends EvalError {
  constructor(message) {
    super("budget_guard", message);
    this.name = "BudgetError";
  }
}

export function publicErrorCode(error) {
  return error instanceof EvalError ? error.code : "unexpected_failure";
}
