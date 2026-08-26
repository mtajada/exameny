# OpenAI integration map

All public AI call sites use the shared Responses API adapter. The repository
contains no Chat Completions or Gemini production fallback.

| Workflow | Function or shared path | Output contract |
| --- | --- | --- |
| Writing-task generation | `generate-writing-exercise` | Original exercise brief, level, genre, requirements, and planning prompts |
| Writing evaluation | `evaluate-submission` | Scores, feedback, diagnostic tags, and bounded mistake data |
| Mistake realignment | `evaluate-submission/realign-mistakes.ts` | Validated anchored mistake items |
| Contextual coaching | `get-chat-assistance` | Short guidance that helps the learner revise their own work |
| Image-prompt transcription | `transcribe-image-prompt` | Typed text extracted from an image input |
| Language-use and reading generation | `_shared/ruoe-handler.ts` and eight `generate-ruoe-*` functions | A strict schema selected for each clean-room activity layout |
| Evaluation harness | `mistakes-v2-harness` | The same versioned mistake contract used by production |

The eight shared-handler layouts are cross-text matching, gapped text, keyword
transformation, multiple-choice cloze, multiple matching, open cloze, reading
multiple choice, and word formation.

## Shared invariants

- model fixed to `gpt-5.6-luna`;
- `POST /v1/responses` with `store: false`;
- strict schema under `text.format` and runtime validation after parsing;
- bounded input, output tokens, and timeout;
- explicit completed, incomplete, failed, and refusal branches;
- no prompt, learner text, output, provider response ID, or credential in logs;
- no browser access to `OPENAI_API_KEY`;
- no silent provider or model fallback.

The domain schema remains responsible for pedagogical correctness. The shared
adapter owns transport, safe error classification, token accounting, and
latency observation. This separation lets the offline tests simulate every API
state without a key or network call.

## Evidence

- Adapter and domain contract tests: `npm run edge:test`
- Format, lint, and type checks: the four `edge:*` scripts
- Model-quality harness: `npm run eval:luna:verify`
- Reviewed live result: [`evals/luna/evidence/live-evaluation.md`](../../evals/luna/evidence/live-evaluation.md)

The live evidence uses original synthetic fixtures. It does not contain a
production submission or examination-provider material.
