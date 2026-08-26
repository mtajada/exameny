# Exameny evaluations for GPT-5.6 Luna

This package measures whether `gpt-5.6-luna` is useful for Exameny's public,
independent English-learning workflows. It covers writing evaluation, learner
coaching, original writing-task generation, and language-use practice.

The suite is deliberately small and inspectable: 24 original synthetic cases,
six per workflow, evenly distributed across B1, B2, and C1. Eight cases contain
benign prompt-injection attempts. No learner account, production record, private
document, or examination-provider material is used.

OpenAI documents GPT-5.6 Luna as a cost-sensitive model that supports the
Responses API and Structured Outputs. The runner follows the official
[model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and
[Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create):

- model: `gpt-5.6-luna`
- endpoint: `POST /v1/responses`
- storage: `store: false`
- output: strict JSON Schema, selected by workflow
- reasoning effort: `low`
- maximum output: 900 tokens per request

## What is measured

Every case declares deterministic checks next to its clean-room input. Examples
include an exact language-use answer, a required diagnostic tag, a bounded
writing score, a preserved genre and word range, and whether an embedded
instruction was ignored. The runner validates the complete JSON structure
before applying those checks.

A live run passes only when all of these gates pass:

| Gate | Threshold |
| --- | ---: |
| Overall case pass rate | at least 22/24 (91.7%) |
| Each workflow | at least 5/6 |
| Adversarial safety cases | 8/8 |
| Strict structured outputs | 24/24 |
| p95 request latency | at most 30 seconds |
| Accounted evidence cost | at most USD 0.10 |

These are project acceptance criteria, not a general claim about the model or
language proficiency. Human review should still inspect failed cases and the
pedagogical quality of a release candidate.

## Offline verification

From this directory, with Node.js 22:

```bash
npm run verify
```

This runs syntax checks, 13 offline tests, and a dry run. The dry run validates
all fixtures and request bodies and makes zero network requests. It does not
claim that model quality has passed.

To inspect only the conservative cost reservation:

```bash
npm run dry-run
```

With the pricing captured on 2026-08-26, the default one-attempt suite reserves
less than USD 0.05. Two attempts for every case reserve less than USD 0.10. The
estimate treats every UTF-8 request byte as an input token, adds 2,048 input
tokens of protocol overhead per request, and treats every case as if it used all
900 output tokens. It is intentionally conservative for this bounded fixture
set.

## Live reproduction

Live mode is intentionally difficult to trigger by accident. It requires an
absolute path to a private regular env file, a literal confirmation token, and
a budget that cannot exceed USD 0.75. The runner never reads credentials from
ambient process state.

```bash
node run.mjs \
  --mode live \
  --env-file /absolute/private/path/.env.local \
  --confirm-live I_UNDERSTAND_THIS_USES_PAID_API \
  --budget-usd 0.10 \
  --concurrency 1 \
  --max-attempts 1 \
  --output results/luna-YYYY-MM-DD.json
```

Safety limits are enforced in code:

- maximum selected budget: USD 0.75
- default selected budget: USD 0.10
- maximum concurrency: 2
- maximum attempts: 2, only for bounded transient failures
- per-request timeout: 45 seconds
- no unbounded polling or retry loop
- full-suite worst-case reservation checked before the first request

The env file must contain `OPENAI_API_KEY`, must not be a symlink, and must not
be group- or world-readable. Its value is used only in the request header. It is
never printed or added to the report.

## Public evidence format

A report contains case IDs, category, level, pass/fail checks, parsed structured
output, token usage, calculated cost, and latency. It deliberately omits raw
HTTP headers, credentials, error bodies, and OpenAI response IDs. A final guard
rejects serialization if it detects a credential-shaped value or provider
response ID.

Reports may only be written inside this package. Store reviewed live evidence
under `results/`. The fixtures are already public data, but a maintainer should
still review the generated output before committing a report.

The reviewed 26 August 2026 run, including failed-attempt provenance and known
limitations, is documented in [the live evaluation report](evidence/live-evaluation.md).

## Cost calculation

The captured official text-token rates are USD 0.20 per million uncached input
tokens, USD 0.02 per million cached input tokens, and USD 1.20 per million
output tokens. The report stores the rates, source URL, and capture date so a
future run can detect when this evidence needs refreshing.

Because pricing can change, verify the linked official model page and update the
captured constants before a live run made after that date. The budget guarantee
is based on those captured official rates.

Failed requests without provider usage data are charged at the runner's full
worst-case reservation. This keeps the public accounted-cost metric conservative.

## Interpreting failures

- `expectation_failed`: valid structured output missed one or more objective checks.
- `schema_validation_failed`: output did not satisfy the selected strict schema.
- `response_not_completed` or `missing_output_text`: the provider did not return a usable completed response.
- `http_*`, `network_or_timeout`: bounded transport or service failure.
- `budget_guard`: execution stopped before any request because the reservation was unsafe.

Do not weaken a safety expectation to make a report green. Revise a fixture only
when its expected answer or pedagogical criterion is demonstrably wrong, record
the reason, and rerun the unchanged suite against candidate prompt changes.
