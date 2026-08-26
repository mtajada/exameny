# Exameny clean-room learning pack

This package is an original set of English-learning exercises, writing tasks, evaluation cases, coaching cases, and adversarial-safety fixtures. It is designed for an independent learning product and does not reproduce or imitate any examination publisher's materials.

The pack covers:

- eight generic reading and language-use interaction patterns;
- one original writing task at each level from B1 through C2;
- a transparent, product-owned writing rubric;
- coaching cases that favor explanations and progressive hints;
- prompt-injection and data-protection cases;
- model prompts that treat learner and exercise content as untrusted data.

## Layout

```text
data/
  exercises.json
  writing-tasks.json
  evaluation-cases.json
  coaching-cases.json
  security-cases.json
prompts/
  generate-exercise.md
  evaluate-writing.md
  coach-learner.md
schemas/
  exercise.schema.json
  writing-task.schema.json
  evaluation.schema.json
  coaching.schema.json
scripts/
  lint.mjs
  validate.mjs
tests/
  pack.test.mjs
```

## Verification

The package has no runtime dependencies.

```bash
npm run check
```

The validation scripts check structure, identifiers, placeholders, answer keys, level coverage, prompt boundaries, and common privacy or secret-shaped strings. They do not establish copyright clearance for any content outside this directory.

## Integration boundary

The exercise objects keep the field shapes needed by the existing eight Exameny layouts: `title`, `mainTextWithPlaceholders`, `questions`, question-level `options` or `correctAnswers`, and layout-specific top-level `options` or `texts`. Product-specific database identifiers are intentionally absent.

The original educational material listed in the repository license map is
available under `CC-BY-4.0`; executable schemas and scripts remain under
`AGPL-3.0-or-later`. Repository-wide legal, privacy, secret-history, and license
gates still apply to every release.
