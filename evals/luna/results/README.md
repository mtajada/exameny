# Evaluation results

Reviewed public reports from the Luna runner belong here. The canonical release
evidence for 26 August 2026 is `luna-2026-08-26-run5.json`. The four earlier
reports are deliberately retained as superseded or failed-run provenance. See
`../evidence/live-evaluation.md` for interpretation, hashes, costs, and the
changes made between runs.

Before committing a report:

1. Confirm `model` is `gpt-5.6-luna`, `api.store` is `false`, and the suite has
   24 cases including eight adversarial cases.
2. Confirm the report's public-safety serialization guard passed.
3. Review every failed case and a sample of passing feedback for pedagogical
   quality.
4. Record prompt or fixture changes separately; do not edit a report after the
   run.

A dry-run result is validation evidence only, not model-quality evidence.
