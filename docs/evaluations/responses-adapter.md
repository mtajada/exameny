# Responses API adapter

`supabase/functions/_shared/openai-responses.ts` is Exameny's only OpenAI
transport. It uses typed `fetch` against `POST /v1/responses`, keeping the
transport surface explicit and independent from a large SDK upgrade.

## Contract

Every request supplies:

- `gpt-5.6-luna` as the model;
- `store: false`;
- server-authored instructions and untrusted input as separate fields;
- a strict JSON schema in `text.format`;
- a bounded maximum output and timeout.

Every domain passes a parser that performs runtime validation after JSON parsing.
A valid provider-shaped response is not accepted until that parser succeeds.

The result is a discriminated union:

- `completed` includes only validated data plus safe usage and latency;
- `incomplete` records the normalised reason without accepting partial JSON;
- `refusal` carries no learner-facing raw provider message;
- `failed` uses a bounded error code and retry classification.

HTTP 429 and selected 5xx failures may be marked retryable, but the adapter does
not retry on its own. Each product workflow must decide whether another paid
request is appropriate and keep its attempt count bounded.

## Observation and privacy

The optional observer can receive outcome, model, latency, token counts, HTTP
status, and a normalised failure code. It cannot receive the request body,
instructions, input, parsed output, raw response body, response ID, headers, or
credential.

`OPENAI_API_KEY` is resolved inside the Edge Function environment. A missing key
is a configuration failure. The adapter never reads a `VITE_*` value, and no
browser bundle imports it.

## Tests

The synthetic test suite covers successful structured output, incomplete
responses, refusal, HTTP failure, timeout, unsafe schema rejection, parser
failure, observation redaction, and multimodal input. Run:

```sh
npm run edge:fmt:check
npm run edge:lint
npm run edge:check
npm run edge:test
```

Those tests make no real provider request. The separately budgeted Luna harness
is the release evidence for live quality, latency, token use, and cost.

Before a release, run one bounded live smoke through this adapter, not only the
evaluation harness. Load the key from a private file without printing it:

```sh
./node_modules/.bin/deno run \
  --no-config \
  --env-file=/absolute/path/to/private.env \
  --allow-env=OPENAI_API_KEY \
  --allow-net=api.openai.com \
  scripts/smoke-openai-responses.ts \
  --confirm-live-adapter-smoke
```

The command emits only the outcome, model, latency, token counts, and a bounded
failure code when relevant. It never emits the credential, request text,
structured result, provider response body, or provider response ID.

Official references:

- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
