import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeSource } from './check-log-privacy.mjs'

test('accepts constant messages and bounded operational metadata', () => {
  const issues = analyzeSource(`
    console.info('[worker] completed', {
      request_id: requestId,
      duration_ms: durationMs,
      processed_count: processedCount,
      status_code: statusCode,
    })
  `)
  assert.deepEqual(issues, [])
})

test('allows fixed diagnostic text even when it names an error condition', () => {
  const issues = analyzeSource(`console.error('[worker] request_failed')`)
  assert.deepEqual(issues, [])
})

test('rejects identifiers, emails, payloads, rows, prompts, and raw errors', () => {
  const issues = analyzeSource(`
    console.info('user', { user_id: userId, email })
    console.info('question', { questionId })
    console.warn('row', row)
    console.log('payload', payload)
    console.debug(\`prompt: \${prompt}\`)
    console.error('failure', error)
  `)
  assert.equal(issues.length, 6)
  assert.ok(issues.every((issue) => issue.classification.includes('sensitive')))
})

test('rejects unknown dynamic values unless they are explicitly bounded', () => {
  const issues = analyzeSource(`console.info('worker', arbitraryValue)`)
  assert.deepEqual(issues.map((issue) => issue.classification), ['dynamic_payload'])
})

test('rejects spread logging helpers because their payload is unbounded', () => {
  const issues = analyzeSource(`console.log('[worker]', ...args)`)
  assert.deepEqual(issues.map((issue) => issue.classification), ['spread_payload'])
})

test('rejects sensitive values hidden behind method calls', () => {
  const issues = analyzeSource(`console.error('invalid', parseResult.error.flatten())`)
  assert.deepEqual(issues.map((issue) => issue.classification), ['sensitive_identifier'])
})

test('requires bounded logger helper event labels', () => {
  assert.deepEqual(analyzeSource(`log('request_completed', payload)`).map((issue) => issue.classification), [])
  assert.deepEqual(analyzeSource(`log(userSuppliedEvent)`).map((issue) => issue.classification), [
    'dynamic_event_label',
  ])
})
