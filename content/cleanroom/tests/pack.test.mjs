import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { collectValidationErrors, packRoot } from '../scripts/validate-lib.mjs'

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(packRoot, relativePath), 'utf8'))

test('the complete pack passes structural validation', () => {
  assert.deepEqual(collectValidationErrors(), [])
})

test('all eight exercise archetypes have independent fixtures', () => {
  const exercises = readJson('data/exercises.json')
  const archetypes = exercises.map((exercise) => exercise.archetype).sort()
  assert.deepEqual(archetypes, [
    'cross-text',
    'gapped-text',
    'keyword-transformation',
    'mc-cloze',
    'multiple-matching',
    'open-cloze',
    'reading-mcq',
    'word-formation',
  ])
  assert.equal(new Set(exercises.map((exercise) => exercise.title)).size, 8)
})

test('writing tasks and evaluation cases cover B1 through C2', () => {
  const writing = readJson('data/writing-tasks.json')
  const evaluation = readJson('data/evaluation-cases.json')
  assert.deepEqual([...new Set(writing.map((task) => task.level))].sort(), ['B1', 'B2', 'C1', 'C2'])
  assert.deepEqual([...new Set(evaluation.cases.map((item) => item.level))].sort(), ['B1', 'B2', 'C1', 'C2'])
})

test('security cases cover each untrusted content channel', () => {
  const security = readJson('data/security-cases.json')
  const channels = new Set(security.map((item) => item.channel))
  assert.deepEqual([...channels].sort(), ['exercise-text', 'learner-message', 'learner-submission'])
  assert.ok(security.every((item) => item.mustNot.length > 0))
})

test('prompts state the untrusted-input and originality boundaries', () => {
  for (const promptName of ['generate-exercise.md', 'evaluate-writing.md', 'coach-learner.md']) {
    const prompt = fs.readFileSync(path.join(packRoot, 'prompts', promptName), 'utf8').toLowerCase()
    assert.match(prompt, /untrusted/)
  }
  const generator = fs.readFileSync(path.join(packRoot, 'prompts', 'generate-exercise.md'), 'utf8').toLowerCase()
  assert.match(generator, /original/)
  assert.match(generator, /from a blank page/)
})

test('the manifest lists every authored content file', () => {
  const manifest = readJson('provenance.json')
  const listed = new Set(manifest.contentFiles)
  const authored = [
    ...fs.readdirSync(path.join(packRoot, 'data')).filter((name) => name.endsWith('.json')).map((name) => `data/${name}`),
    ...fs.readdirSync(path.join(packRoot, 'prompts')).filter((name) => name.endsWith('.md')).map((name) => `prompts/${name}`),
  ]
  assert.deepEqual([...listed].sort(), authored.sort())
})
