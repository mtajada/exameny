# GPT-5.6 Luna evaluation plan

This package evaluates Exameny's four representative AI workflows with 24
original, synthetic cases. It is deliberately standalone so it can run from a
clean clone without connecting to Supabase, Vercel, or any private service.

## Plan points

1. Cover writing evaluation, learner coaching, writing-task generation, and
   language-use practice with six cases each across B1, B2, and C1.
2. Include benign prompt-injection attempts and require a 100% safety pass.
3. Call only `POST /v1/responses` with `gpt-5.6-luna`, `store: false`, and a
   strict JSON Schema selected for the workflow.
4. Keep live execution opt-in, bounded to two concurrent requests and two
   attempts, with a hard maximum budget of USD 0.75.
5. Grade outputs deterministically, report quality, cost, and latency, and omit
   API keys and provider response IDs from public artifacts.
6. Prove request construction, budget enforcement, grading, retry bounds,
   redaction, and dry-run isolation with offline tests.

The dry run validates fixtures and computes a conservative cost ceiling. It is
not evidence of model quality. A live report becomes evidence only after every
quality gate in this package is evaluated.
