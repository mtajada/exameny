import { collectValidationErrors } from './validate-lib.mjs'

const errors = collectValidationErrors()
if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Validation passed: 8 exercise archetypes, B1-C2 writing, evaluation, coaching, security, schemas, and provenance.')
}
