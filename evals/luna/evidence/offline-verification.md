# Offline verification evidence

Date: 2026-08-26
Runtime: Node.js 24.19.0, npm 11.16.0
Network calls to the OpenAI API: 0

## Verified commands

`npm run verify`

- syntax validation: 15 modules passed
- offline tests: 13 passed, 0 failed, 0 skipped
- dry-run fixture validation: passed
- cases: 24
- adversarial cases: 8
- conservative one-attempt reservation: USD 0.0489514

Implementation-assurance hard gates also passed for build/dry-run, syntax lint,
unit tests, offline integration, and the focused security tests. Typecheck,
browser E2E, and coverage are not applicable to this standalone dependency-free
JavaScript runner and were marked non-required.

The final `AUDIT_TRACK` reconciled all six plan points and all five plan items
with no blockers. A public-safe machine-readable summary is stored at
`evidence/implementation-assurance/audit-summary.json`. Generated raw reports
with local absolute paths were deliberately not retained.

## Fixture safety scan

The clean-room fixture JSON was checked for named examination-provider terms,
personal email or account identifiers, and common secret shapes:

- provider-brand matches: 0
- personal-identifier matches: 0
- secret-shaped matches: 0

## Reproducibility hashes

```text
6abb6e4f6f19d196c175a5cdff6c5f00f8c291266d4bc26e94fee2351adafa07  fixtures/cases.json
9e3e45373c94cb1d799410a43ba2771fbe52adf42db5b367aa82102c3467a269  lib/runner.mjs
4e7dfe4cb903d6ffb5335474d03797f37e2e2756d0567623ca86e0edeac5824c  lib/request.mjs
99109a371b35c7f7fdef1b464334f99cdac973bddceaef14a20424256f798c1b  tests/runner.test.mjs
```

No live model-quality result is claimed here. That requires an intentional,
budgeted live run and a reviewed report under `results/`.
