import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const PRODUCTION_ROOTS = ['src', 'supabase/functions']
const CONSOLE_METHODS = new Set(['debug', 'error', 'info', 'log', 'warn'])
const TEST_PATH_PATTERN = /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/i
const SAFE_NAME_PATTERNS = [
  /^(?:request_?id|response_?request_?id)$/i,
  /^(?:duration|elapsed|latency)(?:_?ms)?$/i,
  /^(?:overflow)(?:_?px)?$/i,
  /^(?:timeout)(?:_?ms)?$/i,
  /^(?:status|state)(?:_?code)?$/i,
  /^(?:code|failure_?code|reason_?code)$/i,
  /^(?:count|total|totals|length|percentage)$/i,
  /_(?:count|total|length|percentage)$/i,
  /^(?:method|event|phase|kind|mode|role|source|category|operation|action|page)$/i,
  /^(?:attempts?|retry|version|resolverVersion)$/i,
  /^(?:model|modelName|outcome|cacheHit)$/i,
  /_MODEL$/,
  /^(?:success|enabled|found|created|updated|skipped|processed|accepted|rejected)$/i,
  /(?:Status|Count|Total|Length|DurationMs|LatencyMs|StatusCode|ReasonCode|FailureCode)$/,
  /^(?:MAX|MIN)_[A-Z0-9_]+$/,
]
const SENSITIVE_NAME_PATTERN = /(?:^id$|email|user|academy|membership|submission|learner|student|teacher|profile|row|payload|prompt|content|body|error|err|exception|token|secret|authorization|cookie|password|response|provider|url|uri|details|hint|metadata|session|text|answer|message|data|record|job|identifier)/i
const SENSITIVE_ID_NAME_PATTERN = /(?:^id$|_id$|Id$|ID$)/

function isSafeName(name) {
  return SAFE_NAME_PATTERNS.some((pattern) => pattern.test(name))
}

function isSensitiveName(name) {
  return SENSITIVE_NAME_PATTERN.test(name) || SENSITIVE_ID_NAME_PATTERN.test(name)
}

function expressionName(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text
  }
  return null
}

export function classifyExpression(node) {
  if (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return null
  }

  if (ts.isParenthesizedExpression(node)) return classifyExpression(node.expression)

  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      const issue = classifyExpression(span.expression)
      if (issue) return issue
    }
    return null
  }

  if (ts.isConditionalExpression(node)) {
    return classifyExpression(node.whenTrue) ?? classifyExpression(node.whenFalse)
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) return 'spread_payload'
      if (ts.isShorthandPropertyAssignment(property)) {
        const name = property.name.text
        if (!isSafeName(name)) return isSensitiveName(name) ? 'sensitive_identifier' : 'dynamic_payload'
        continue
      }
      if (!ts.isPropertyAssignment(property)) return 'dynamic_payload'
      const name = ts.isComputedPropertyName(property.name) ? null : property.name.getText().replace(/^['"]|['"]$/g, '')
      if (!name) return 'dynamic_property'
      if (isSensitiveName(name) && !isSafeName(name)) return 'sensitive_property'
      const issue = classifyExpression(property.initializer)
      if (issue) return issue
    }
    return null
  }

  if (ts.isBinaryExpression(node)) {
    return classifyExpression(node.left) ?? classifyExpression(node.right)
  }

  if (ts.isPrefixUnaryExpression(node)) return classifyExpression(node.operand)
  if (ts.isAwaitExpression(node)) return classifyExpression(node.expression)
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return classifyExpression(node.expression)
  }
  if (ts.isSpreadElement(node)) return 'spread_payload'

  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    const calleeIssue = classifyExpression(node.expression)
    if (calleeIssue) return calleeIssue
    for (const argument of node.arguments ?? []) {
      const issue = classifyExpression(argument)
      if (issue) return issue
    }
    return null
  }

  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      const issue = classifyExpression(element)
      if (issue) return issue
    }
    return null
  }

  const name = expressionName(node)
  if (name) {
    if (isSafeName(name)) return null
    if (isSensitiveName(name)) return 'sensitive_identifier'
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return classifyExpression(node.expression)
    }
    return 'dynamic_payload'
  }

  return 'dynamic_payload'
}

function consoleMethod(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null
  const target = node.expression.expression
  if (!ts.isIdentifier(target) || target.text !== 'console') return null
  const method = node.expression.name.text
  return CONSOLE_METHODS.has(method) ? method : null
}

function isDynamicLogEvent(node) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'log') {
    return false
  }
  const event = node.arguments[0]
  return !event || (!ts.isStringLiteralLike(event) && !ts.isNoSubstitutionTemplateLiteral(event))
}

export function analyzeSource(sourceText, fileName = 'inline.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const issues = []

  function visit(node) {
    if (isDynamicLogEvent(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      issues.push({
        file: fileName,
        line: position.line + 1,
        method: 'log-helper',
        classification: 'dynamic_event_label',
      })
    }
    const method = consoleMethod(node)
    if (method) {
      for (const argument of node.arguments) {
        const classification = classifyExpression(argument)
        if (!classification) continue
        const position = sourceFile.getLineAndCharacterOfPosition(argument.getStart(sourceFile))
        issues.push({
          file: fileName,
          line: position.line + 1,
          method,
          classification,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return issues
}

function listProductionFiles(projectRoot) {
  const files = []
  const visit = (absolutePath) => {
    if (!fs.existsSync(absolutePath)) return
    const stat = fs.statSync(absolutePath)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolutePath).sort()) visit(path.join(absolutePath, child))
      return
    }
    const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join('/')
    if (!/\.[cm]?[jt]sx?$/i.test(relativePath) || TEST_PATH_PATTERN.test(relativePath)) return
    files.push(relativePath)
  }

  for (const root of PRODUCTION_ROOTS) visit(path.join(projectRoot, root))
  return files
}

export function scanProject(projectRoot = process.cwd()) {
  const issues = []
  const files = listProductionFiles(projectRoot)
  for (const file of files) {
    const sourceText = fs.readFileSync(path.join(projectRoot, file), 'utf8')
    issues.push(...analyzeSource(sourceText, file))
  }
  return { files, issues }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const { files, issues } = scanProject()
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}:${issue.line} [${issue.classification}]`)
    }
    console.error(`Log privacy check failed: ${issues.length} unsafe argument(s) in ${files.length} production file(s).`)
    process.exit(1)
  }
  console.log(`Log privacy check passed: ${files.length} production file(s).`)
}
