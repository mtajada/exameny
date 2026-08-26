# Responses adapter live smoke

Date: 2026-08-26
Model: `gpt-5.6-luna`
API: Responses
Storage: `store: false`

## Result

- outcome: `completed`
- strict structured output: passed
- runtime parser: passed
- latency: 2,367 ms
- input tokens: 58
- cached input tokens: 0
- output tokens: 17
- reasoning tokens: 0
- total tokens: 75

The request ran through
`supabase/functions/_shared/openai-responses.ts`, the same transport imported by
the product Edge Functions. It used the bounded schema in
`scripts/smoke-openai-responses.ts`, not the evaluation harness transport.

The key came from a private environment file with mode `600`. The command did
not print or retain the key, prompt, structured response, provider body, or
provider response ID.

## Reproducibility hashes

- adapter SHA-256:
  `3e6780649c23762884bd9390dc499941938333d82e1f377a8529ca4030111607`
- smoke script SHA-256:
  `afc6789c9e0c133db731c725978afa352e26df90593ab21ac1e20bea1f372a5b`

The exact command contract and permission boundary are documented in
[`docs/evaluations/responses-adapter.md`](../../docs/evaluations/responses-adapter.md).
