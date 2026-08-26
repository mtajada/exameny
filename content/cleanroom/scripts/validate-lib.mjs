import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const packRoot = path.resolve(scriptDir, '..')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(packRoot, relativePath), 'utf8'))
}

function add(errors, condition, location, message) {
  if (!condition) errors.push(`${location}: ${message}`)
}

function unique(values) {
  return new Set(values).size === values.length
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const expectedArchetypes = [
  'mc-cloze',
  'open-cloze',
  'word-formation',
  'keyword-transformation',
  'reading-mcq',
  'gapped-text',
  'multiple-matching',
  'cross-text',
]

const levels = ['B1', 'B2', 'C1', 'C2']

function validateQuestion(errors, exercise, question, index) {
  const location = `${exercise.id}.questions[${index}]`
  const expectedNumber = index + 1
  add(errors, question.questionNumber === expectedNumber, location, `questionNumber must be ${expectedNumber}`)
  add(errors, question.placeholder === `{{${expectedNumber}}}`, location, `placeholder must be {{${expectedNumber}}}`)

  const optionArchetypes = new Set(['mc-cloze', 'reading-mcq'])
  if (optionArchetypes.has(exercise.archetype)) {
    add(errors, Array.isArray(question.options) && question.options.length >= 2, location, 'options are required')
    if (Array.isArray(question.options)) {
      add(errors, unique(question.options.map((option) => option.letter)), location, 'option letters must be unique')
      add(errors, question.options.filter((option) => option.isCorrect === true).length === 1, location, 'exactly one option must be correct')
      for (const [optionIndex, option] of question.options.entries()) {
        add(errors, isNonEmptyString(option.feedback), `${location}.options[${optionIndex}]`, 'feedback is required')
      }
    }
  } else {
    add(errors, Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0, location, 'correctAnswers are required')
    if (Array.isArray(question.correctAnswers)) {
      add(errors, question.correctAnswers.every(isNonEmptyString), location, 'correctAnswers cannot contain blank values')
    }
  }

  if (exercise.archetype === 'word-formation') {
    add(errors, isNonEmptyString(question.questionText), location, 'a root word is required')
    add(errors, isNonEmptyString(question.explanation), location, 'an explanation is required')
  }

  if (exercise.archetype === 'keyword-transformation') {
    add(errors, isNonEmptyString(question.questionText), location, 'a supplied word is required')
    add(errors, isNonEmptyString(question.originalSentence), location, 'the original sentence is required')
    add(errors, isNonEmptyString(question.transformationSentence), location, 'the transformation sentence is required')
    add(errors, question.transformationSentence?.includes(question.placeholder), location, 'the transformation must contain its placeholder')
    add(errors, isNonEmptyString(question.explanation), location, 'an explanation is required')
  }
}

function validateExercises(errors, exercises) {
  add(errors, Array.isArray(exercises), 'data/exercises.json', 'must be an array')
  if (!Array.isArray(exercises)) return

  add(errors, exercises.length === expectedArchetypes.length, 'data/exercises.json', 'must contain one fixture per archetype')
  add(errors, unique(exercises.map((exercise) => exercise.id)), 'data/exercises.json', 'exercise IDs must be unique')
  add(errors, unique(exercises.map((exercise) => exercise.archetype)), 'data/exercises.json', 'archetypes must be unique')
  add(
    errors,
    expectedArchetypes.every((archetype) => exercises.some((exercise) => exercise.archetype === archetype)),
    'data/exercises.json',
    'all eight archetypes must be present',
  )
  add(errors, levels.every((level) => exercises.some((exercise) => exercise.level === level)), 'data/exercises.json', 'B1 through C2 must be represented')

  for (const exercise of exercises) {
    const location = exercise.id || 'exercise-without-id'
    add(errors, /^CR_(B1|B2|C1|C2)_[A-Z0-9_]+$/.test(exercise.id), location, 'invalid clean-room ID')
    add(errors, levels.includes(exercise.level), location, 'invalid level')
    add(errors, expectedArchetypes.includes(exercise.archetype), location, 'invalid archetype')
    add(errors, isNonEmptyString(exercise.title), location, 'title is required')
    add(errors, isNonEmptyString(exercise.mainTextWithPlaceholders), location, 'main text is required')
    add(errors, Array.isArray(exercise.learningObjectives) && exercise.learningObjectives.length > 0, location, 'learning objectives are required')
    add(errors, Array.isArray(exercise.questions) && exercise.questions.length > 0, location, 'questions are required')

    if (!Array.isArray(exercise.questions)) continue
    for (const [index, question] of exercise.questions.entries()) {
      validateQuestion(errors, exercise, question, index)
    }

    if (['mc-cloze', 'open-cloze', 'word-formation', 'gapped-text'].includes(exercise.archetype)) {
      for (const question of exercise.questions) {
        add(errors, exercise.mainTextWithPlaceholders.includes(question.placeholder), location, `main text is missing ${question.placeholder}`)
      }
    }

    if (exercise.archetype === 'gapped-text') {
      add(errors, Array.isArray(exercise.options) && exercise.options.length > exercise.questions.length, location, 'gapped text needs options plus a distractor')
      if (Array.isArray(exercise.options)) {
        const letters = new Set(exercise.options.map((option) => option.letter))
        add(errors, exercise.options.filter((option) => option.isDistractor === true).length === 1, location, 'gapped text needs exactly one distractor')
        for (const question of exercise.questions) {
          add(errors, letters.has(question.correctAnswers?.[0]), location, `answer ${question.correctAnswers?.[0]} does not reference an option`)
        }
      }
    }

    if (exercise.archetype === 'multiple-matching') {
      add(errors, Array.isArray(exercise.options) && exercise.options.length >= 2, location, 'multiple matching needs section options')
      if (Array.isArray(exercise.options)) {
        const letters = new Set(exercise.options.map((option) => option.letter))
        for (const question of exercise.questions) {
          add(errors, letters.has(question.correctAnswers?.[0]), location, `answer ${question.correctAnswers?.[0]} does not reference a section`)
        }
      }
    }

    if (exercise.archetype === 'cross-text') {
      add(errors, Array.isArray(exercise.texts) && exercise.texts.length >= 3, location, 'cross-text needs source texts')
      if (Array.isArray(exercise.texts)) {
        const letters = new Set(exercise.texts.map((text) => text.letter))
        for (const question of exercise.questions) {
          add(errors, letters.has(question.correctAnswers?.[0]), location, `answer ${question.correctAnswers?.[0]} does not reference a text`)
        }
      }
    }
  }
}

function validateWriting(errors, tasks) {
  add(errors, Array.isArray(tasks), 'data/writing-tasks.json', 'must be an array')
  if (!Array.isArray(tasks)) return
  add(errors, tasks.length === levels.length, 'data/writing-tasks.json', 'must contain one task per level')
  add(errors, unique(tasks.map((task) => task.id)), 'data/writing-tasks.json', 'task IDs must be unique')
  add(errors, levels.every((level) => tasks.some((task) => task.level === level)), 'data/writing-tasks.json', 'B1 through C2 must be present')
  for (const task of tasks) {
    add(errors, task.constraints?.minWords < task.constraints?.maxWords, task.id, 'word range is invalid')
    add(errors, Array.isArray(task.constraints?.requiredPoints) && task.constraints.requiredPoints.length >= 2, task.id, 'required points are missing')
    add(errors, Array.isArray(task.successCriteria) && task.successCriteria.length >= 3, task.id, 'success criteria are missing')
  }
}

function validateEvaluation(errors, evaluation, tasks) {
  const dimensionIds = evaluation.rubric?.dimensions?.map((dimension) => dimension.id) ?? []
  add(errors, dimensionIds.length === 5 && unique(dimensionIds), 'data/evaluation-cases.json', 'rubric must have five unique dimensions')
  add(errors, Array.isArray(evaluation.cases) && evaluation.cases.length >= 4, 'data/evaluation-cases.json', 'at least four cases are required')
  const taskIds = new Set(tasks.map((task) => task.id))
  for (const item of evaluation.cases ?? []) {
    add(errors, taskIds.has(item.taskId), item.id, 'taskId does not reference a writing task')
    for (const dimensionId of dimensionIds) {
      const range = item.expected?.scoreRanges?.[dimensionId]
      add(errors, Array.isArray(range) && range.length === 2, item.id, `missing range for ${dimensionId}`)
      if (Array.isArray(range)) add(errors, range.every((score) => Number.isInteger(score) && score >= 0 && score <= 4) && range[0] <= range[1], item.id, `invalid range for ${dimensionId}`)
    }
  }
}

function validateCoaching(errors, coaching, exerciseIds, writingIds) {
  add(errors, Array.isArray(coaching) && coaching.length >= 4, 'data/coaching-cases.json', 'at least four cases are required')
  add(errors, levels.every((level) => coaching.some((item) => item.level === level)), 'data/coaching-cases.json', 'B1 through C2 must be present')
  add(errors, unique(coaching.map((item) => item.id)), 'data/coaching-cases.json', 'case IDs must be unique')
  const knownTasks = new Set([...exerciseIds, ...writingIds])
  for (const item of coaching) {
    add(errors, knownTasks.has(item.context?.taskId), item.id, 'context taskId is unknown')
    add(errors, Array.isArray(item.expectedBehavior) && item.expectedBehavior.length >= 2, item.id, 'expected behavior is incomplete')
    add(errors, isNonEmptyString(item.exampleResponse), item.id, 'example response is required')
  }
}

function validateSecurity(errors, cases) {
  add(errors, Array.isArray(cases) && cases.length >= 8, 'data/security-cases.json', 'at least eight cases are required')
  add(errors, unique(cases.map((item) => item.id)), 'data/security-cases.json', 'case IDs must be unique')
  const requiredChannels = ['learner-message', 'learner-submission', 'exercise-text']
  add(errors, requiredChannels.every((channel) => cases.some((item) => item.channel === channel)), 'data/security-cases.json', 'all untrusted channels must be covered')
  for (const item of cases) {
    add(errors, /^CR_SEC_[A-Z0-9_]+$/.test(item.id), item.id, 'invalid security case ID')
    add(errors, Array.isArray(item.mustNot) && item.mustNot.length > 0, item.id, 'mustNot checks are required')
    add(errors, isNonEmptyString(item.safeExample), item.id, 'safe example is required')
  }
}

function validateManifest(errors, manifest) {
  add(errors, manifest.creationMode === 'clean-room', 'provenance.json', 'creation mode must remain clean-room')
  add(errors, manifest.assurances?.thirdPartyTextCopied === false, 'provenance.json', 'third-party-copy assurance is missing')
  add(errors, manifest.assurances?.oldExercisesParaphrased === false, 'provenance.json', 'no-paraphrase assurance is missing')
  add(errors, isNonEmptyString(manifest.authoring?.commissionedBy), 'provenance.json', 'commissioning maintainer is missing')
  add(errors, isNonEmptyString(manifest.authoring?.draftedWith), 'provenance.json', 'AI assistance record is missing')
  add(errors, isNonEmptyString(manifest.authoring?.createdOn), 'provenance.json', 'authoring date is missing')
  add(errors, isNonEmptyString(manifest.authoring?.technicalReviewStatus), 'provenance.json', 'technical review status is missing')
  add(errors, isNonEmptyString(manifest.authoring?.humanAdoptionStatus), 'provenance.json', 'human adoption status is missing')
  add(errors, Array.isArray(manifest.fileRecords), 'provenance.json', 'fileRecords must be an array')
  const records = new Map((manifest.fileRecords ?? []).map((record) => [record.path, record]))
  for (const relativePath of manifest.contentFiles ?? []) {
    add(errors, fs.existsSync(path.join(packRoot, relativePath)), 'provenance.json', `listed file does not exist: ${relativePath}`)
    const record = records.get(relativePath)
    add(errors, record !== undefined, 'provenance.json', `missing authorship record: ${relativePath}`)
    if (record !== undefined) {
      add(errors, isNonEmptyString(record.author), `provenance.json:${relativePath}`, 'author is missing')
      add(errors, isNonEmptyString(record.createdOn), `provenance.json:${relativePath}`, 'creation date is missing')
      add(errors, Array.isArray(record.targetLevels) && record.targetLevels.length > 0, `provenance.json:${relativePath}`, 'target level is missing')
      add(errors, isNonEmptyString(record.skill), `provenance.json:${relativePath}`, 'skill is missing')
      add(errors, isNonEmptyString(record.reviewStatus), `provenance.json:${relativePath}`, 'review status is missing')
    }
  }
  add(errors, records.size === (manifest.contentFiles ?? []).length, 'provenance.json', 'fileRecords must match contentFiles exactly')
}

export function collectValidationErrors() {
  const errors = []
  const exercises = readJson('data/exercises.json')
  const tasks = readJson('data/writing-tasks.json')
  const evaluation = readJson('data/evaluation-cases.json')
  const coaching = readJson('data/coaching-cases.json')
  const security = readJson('data/security-cases.json')
  const manifest = readJson('provenance.json')

  validateExercises(errors, exercises)
  validateWriting(errors, tasks)
  validateEvaluation(errors, evaluation, tasks)
  validateCoaching(errors, coaching, exercises.map((item) => item.id), tasks.map((item) => item.id))
  validateSecurity(errors, security)
  validateManifest(errors, manifest)

  for (const schemaFile of fs.readdirSync(path.join(packRoot, 'schemas')).filter((name) => name.endsWith('.json'))) {
    try {
      readJson(path.join('schemas', schemaFile))
    } catch (error) {
      errors.push(`schemas/${schemaFile}: invalid JSON (${error.message})`)
    }
  }

  return errors
}
