# `src/` structure — what to edit when

Tooling lives at the repo root. Everything below is the product layer: the part you rewrite for
your own application.

```
src/
├── fixtures.ts        # The wrapped test/expect every spec imports
├── tests/             # Specs, by FEATURE (never by ticket)
├── pages/             # Page objects — the only place raw locators live
├── utils/             # env, test-data, cleanup, interactions, retry, evidence, api
├── types/             # Shared interfaces
├── test-data/         # Stable seed names the tests read but never create
├── evidence/          # Generated captures (gitignored)
└── test-results/      # Generated Playwright output (gitignored)
```

## Where a change goes

| You want to… | Edit |
| --- | --- |
| Add a test for an existing screen | `src/tests/<feature>/<name>.spec.ts` |
| Add a screen | `src/pages/<Feature>Page.ts` + export from `src/pages/index.ts` |
| Fix a selector | The page object — never a spec |
| Drive a widget a second time | Extract to `src/utils/interactions.ts`, then record it in the APP-MAP Helpers index |
| Add an environment variable | `src/utils/env.ts` (+ `.env.example`, + the README table) |
| Add a fixture for every test | `src/fixtures.ts` |
| Change what a `@smoke` run includes | The tag on the describe, not the config |
| Reference a seeded record | `src/test-data/` |

## `fixtures.ts`

The wrapper every spec imports instead of `@playwright/test`. It binds each worker to its own
account slot and storage-state file, and runs the TCP environment guard before every test.

A spec that imports `@playwright/test` directly loses both, silently: it will pass in
single-worker runs and fail confusingly under parallelism. This is the one import rule worth
enforcing in review.

## `tests/`

Organised by feature domain. `src/tests/checkout/` holds every checkout spec regardless of which
ticket added them — a ticket folder is unreadable six months later, and the describe tag
(`{ tag: "@PROJ-123" }`) already carries the traceability. Filter with `TICKET=PROJ-123`.

`globalSetup.ts` validates config, probes the environment, and logs in once per account.
`globalTeardown.ts` is deliberately near-empty: per-test data is removed by `CleanupRegistry` in
`afterEach`, because a crashed run never reaches a global teardown.

## `pages/`

All page objects extend `BasePage`. The contract: methods take a user's vocabulary — a NAME, a
visible LABEL — and return observable outcomes. No spec should ever pass a page object a CSS
selector or a row index.

`BasePage` holds only what every screen shares (navigation, load waiting, dismissing blocking
dialogs). When a helper there starts needing one page's vocabulary, it belongs in that page
object instead.

## `utils/`

| File | Job |
| --- | --- |
| `env.ts` | `TEST_ENV` loading, write-environment policy, worker accounts, `validateConfig()` |
| `test-data.ts` | `e2eName()` and friends — unique, recognisable, purgeable names |
| `cleanup.ts` | `CleanupRegistry` — LIFO teardown that never throws |
| `interactions.ts` | Shared widget drivers (dropdowns, modal→toast, downloads) |
| `retry.ts` | Retry helpers for *specific* known-flaky controls — not a default wrapper |
| `environment-guard.ts` | The ~3s TCP probe behind the `_envGuard` fixture |
| `evidence.ts` | `attachSubject` / `attachCloseUp` — capture the proving frame |
| `api.ts` | API-based prerequisite setup |
| `allure-config.ts` | Reporter wiring: environment info, ticket links, severity, categories |

**Extraction rule:** used by 2+ files → move it here; single consumer → keep it co-located.

## `test-data/`

Records that already exist in the environment and that tests read but never create. Anything a
test *creates* gets a generated name from `e2eName()` and is torn down in `afterEach` — these
are the other kind, named once instead of retyped as a literal in nine specs.

When a value differs per environment, read it from `.env.<TEST_ENV>` and export the accessor
rather than the constant.
