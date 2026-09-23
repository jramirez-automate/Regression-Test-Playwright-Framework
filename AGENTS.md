# AGENTS.md — Regression Test Playwright Framework

Tool-agnostic guide for any AI coding agent (Cursor Agent, Claude Code, etc.) working in this
repo.

## What this repo is

A product-neutral Playwright regression framework. It runs against **deployed environments over
HTTP** — there is no app build step. Specs live under `src/tests/<feature>/`.

- Specs: `src/tests/<feature>/*.spec.ts` — by feature, **never by ticket**.
- Page objects: `src/pages/` (extend `BasePage`, barrel `src/pages/index.ts`).
- Helpers: `src/utils/` (`env.ts`, `test-data.ts`, `cleanup.ts`, `interactions.ts`, `retry.ts`,
  `evidence.ts`, `api.ts`). Types: `src/types/`.
- Publishing: `scripts/*.mjs`, configured by `publish.config.json` + `.env.publish`.
- Rulebook: [`CLAUDE.md`](CLAUDE.md). App knowledge: [`docs/APP-MAP.md`](docs/APP-MAP.md).
- Node **v24.18.0** (`.nvmrc`); anything ≥ 20 works.

## Setup

```bash
nvm use
npm ci && npx playwright install --with-deps chromium
npm run test:demo        # green against the public demo app, no credentials needed
cp .env.example .env.staging   # then fill in your own values
```

`.env.*` and `.env.publish` are gitignored — never commit secrets. See
[`docs/ONBOARDING.md`](docs/ONBOARDING.md).

## Running tests

```bash
TEST_ENV=staging npx playwright test                              # full suite
TEST_ENV=staging npx playwright test --ui                         # interactive
TEST_ENV=staging npx playwright test src/tests/x.spec.ts -g "…"   # one test
TICKET=PROJ-123 TEST_ENV=staging npx playwright test              # one ticket's tag
```

**Always ask** before any Playwright run — suite, single spec, or evidence capture — against a
beta, pre-production or production environment. Do not start until the user says yes for that
environment in this conversation. Local, dev, qa and staging may run without asking.

## Non-negotiable conventions (full detail in `CLAUDE.md`)

- Import `test` / `expect` from `src/fixtures.ts`, never `@playwright/test` directly — the
  wrapper binds worker accounts and runs the environment guard.
- Write environments come from `E2E_WRITE_ENVS`; everything else runs `@smoke` (read-only) only.
  Never add production to that list to make a test pass.
- Every entity a spec creates: name it with `e2eName("Kind")` and delete it in `test.afterEach`
  via `CleanupRegistry` (LIFO). Register teardown at creation time. Cleanup never throws.
- Selectors: prefer `getByRole` / `getByText`; scope modals with
  `getByRole("dialog").filter({ has: heading })`; raw locators live in page objects, not specs.
- iframes: `frameLocator()`, never `page.frame()`.
- Prefer state-based waits over `waitForTimeout`. Wrap meaningful sequences in `test.step()`.
- TDD: one slice at a time — write ONE test, run it alone, prove it fails meaningfully, drive it
  green, then the next. Never batch-write specs.
- Zephyr cases come from the seam table **before** the specs: user actions, expected result on
  the last step, no framework internals.
- **Context hygiene:** read source surgically — grep for the route or component, open only what
  is relevant, summarise into a flow map. Never dump whole source trees, specs, or raw API JSON
  into the chat.

## Cursor and Claude Code (same files)

`.claude/` and `.cursor/` are **mirrors** of agents, commands, skills, rules and hook scripts, so
either IDE runs the same pipeline. After editing one side:
`npm run sync:ai -- --from=claude` (or `--from=cursor`). Check with `npm run sync:ai:check`.
There is no `.cursorrules` — this file and `CLAUDE.md` are the rulebooks.

- **Commands:** `/e2e-ticket` runs a ticket end to end.
- **Subagents:** e2e-explorer, e2e-runner, e2e-evidence.
- **Skills:** e2e-testing-patterns, tdd.
- **MCP:** `.cursor/mcp.json` / `.mcp.json` (Playwright for browser exploration — not a runner).

If subagents and commands are unavailable, run the same pipeline as staged steps that hand off
through files:

1. **Explore** — read the ticket, grep the app for the route → components → selectors, write a
   compact map to `src/evidence/<TICKET>/flow-map.md`.
2. **Seam table + Zephyr cases** — present the TC table, then
   `TICKET=… npm run zephyr -- create --spec …` in planned mode, before any spec.
3. **Write specs (TDD)** — from `flow-map.md`, one slice at a time.
4. **Run** — until green. Ask before beta or production.
5. **Evidence** — `TICKET=… npm run test:evidence`, then attach, comment, publish:
   ```
   npm run evidence:attach -- --from-rows src/evidence/<t>/comment-rows.json
   npm run evidence:comment -- --rows src/evidence/<t>/comment-rows.json
   npm run publish:test-plan
   npm run zephyr -- mark-pass
   ```
   **Show a found bug in the chat:** embed the proving screenshot
   (`![what it shows](/abs/path.png)`) in the same reply that reports the defect.
   **A raised bug gets the failure media too** — copy `*-FAILED.*` into
   `src/evidence/<BUG-KEY>/`, write a minimal `comment-rows.json`, attach, then
   `npm run evidence:embed` so the proof renders in the description.
6. **Persist** — append to `COVERAGE.md` and to the Navigation / Helpers indexes in
   `docs/APP-MAP.md`. Expensive navigation and reusable interactions get recorded once, never
   rebuilt.

## Deliberately not adopted

- **Locator auto-healing.** TDD needs a real red, and evidence must show the real control.
- **data-testid-first locator ranking** — this suite prefers `getByRole` / `getByText`, which
  assert the accessible name a user actually perceives.
- **Generating specs from test-management cases.** Zephyr cases are generated **from** the seam
  table, before the specs — not the other way around.
- **Allure as the acceptance record.** Allure is the run report; Jira, Confluence and Zephyr hold
  the sign-off.
