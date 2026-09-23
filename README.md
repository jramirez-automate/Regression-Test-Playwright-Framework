# Regression Test Playwright Framework

A product-neutral **Playwright** regression framework: page objects, environment-aware
data safety, parallel-account workers, Allure reporting, deterministic evidence capture,
a Jira / Confluence / Zephyr / Teams publishing pipeline, and AI-agent tooling for Cursor
and Claude Code.

It runs against **deployed environments over HTTP** — there is no app build step. Clone it,
run `npm install && npm run test:demo`, and a working suite goes green against a public demo
app in about fifteen seconds. Then point `BASE_URL` at your own application and replace the
example page objects.

Conventions live in [`CLAUDE.md`](CLAUDE.md); agent guidance in [`AGENTS.md`](AGENTS.md).
Fresh-machine setup: [`docs/ONBOARDING.md`](docs/ONBOARDING.md).

## Table of contents

- [Why this exists](#why-this-exists)
- [Key features](#key-features)
- [Framework benefits](#framework-benefits)
- [Folder structure](#folder-structure)
- [Quick start](#quick-start)
- [Windows setup (WSL)](#windows-setup-wsl)
- [Configuration](#configuration)
- [Running tests](#running-tests)
- [Writing a spec](#writing-a-spec)
- [Test data](#test-data)
- [Reporting](#reporting)
- [Evidence](#evidence)
- [Publishing pipeline](#publishing-pipeline)
- [AI-assisted development](#ai-assisted-development)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Documentation index](#documentation-index)
- [NPM scripts](#npm-scripts)

## Why this exists

Most Playwright starters stop at "here is a page object". The parts that actually decide
whether a suite survives its second quarter are the ones usually left as an exercise:

- **Stopping a destructive test from running against production.** Here it is a config-level
  grep guard, not a convention a spec can forget.
- **Cleaning up after yourself.** Generated names plus LIFO teardown, so a crashed run leaves
  recognisable debris rather than silently poisoning the next one.
- **Failing fast when the environment is down.** A 3-second TCP probe instead of thirty
  minutes of locator timeouts that blame your selectors.
- **Proving what you tested.** A run report and an acceptance record are different artifacts
  with different audiences, and conflating them is how "227 passed" ends up proving nothing.
- **Getting proof to the people who sign off.** Captures attach to the ticket, render inline
  in the comment, publish as a Confluence test plan, and record against Zephyr cases.

## Key features

- **Page Object Model** — locators and flows in `src/pages/` (all extend `BasePage`); specs stay
  assertions. Prefer `getByRole` / `getByText`.
- **Environment configuration** — `TEST_ENV` selects a gitignored `.env.<TEST_ENV>`. Write
  environments are configurable; everything else is forced to `@smoke` (read-only).
- **Ticket tagging** — `{ tag: "@PROJ-123" }` on describes; run one ticket with `TICKET=PROJ-123`.
  Specs live by feature, never by ticket.
- **Saved session** — `globalSetup` logs in once per account to `.auth/user.json`, so no test
  pays for the slowest, most brittle flow in the suite.
- **Parallel accounts** — add `E2E_USERNAME_2` and the run uses two workers. One worker per
  complete account slot, because the same user in two browsers session-kicks itself.
- **Fail-fast environment guard** — `validateConfig()` plus a ~3s TCP probe before any locator
  timeout. Opt out with `SKIP_URL_CHECK=1`.
- **Evidence capture** — `EVIDENCE=true` writes deterministic, env-suffixed PNG/WebM/trace
  bundles per test into `src/evidence/<TICKET>/`.
- **Publishing pipeline** — attach curated media to Jira, post an inline-media TC table,
  inline a bug's proof into its description, publish a Confluence test plan, create and record
  Zephyr cases, notify Teams. All config-driven — no project keys in script bodies.
- **Allure Report 3** — the run report (statuses, retries, trend, severity, failure categories,
  ticket links from tags). Node CLI, so **no Java** anywhere.
- **Data discipline** — unique entities via `e2eName()`, LIFO `CleanupRegistry` teardown,
  API-first prerequisite setup.
- **Lint, format, secret scan** — ESLint flat config (Playwright plugin on specs) + Prettier,
  with Husky running a secret scanner and lint-staged on commit.
- **AI tooling** — mirrored `.claude/` and `.cursor/` agents, commands, skills and rules, so
  Cursor and Claude Code run the same pipeline. No locator auto-healing.
- **Type safety** — TypeScript throughout; `npm run typecheck` must pass.

## Framework benefits

| Who | Benefits |
| --- | --- |
| **Engineers** | One POM and one TDD loop, saved `storageState`, fail-fast env probe, shared interaction helpers, scaffolds in `templates/`, authenticated codegen |
| **Teams** | Ticket tags (`TICKET=`), write vs read-only environments, `e2eName()` + cleanup so shared environments stay usable, `COVERAGE.md` and `docs/APP-MAP.md` as shared memory |
| **CI/CD** | Typecheck, lint, secret scan, TCP reachability, then Playwright. Screenshots and video on failure, retries when `CI=true`, Allure published to Pages |
| **QA / sign-off** | Deterministic evidence bundles, inline-media Jira comments, Confluence test plans, Zephyr cycles — the acceptance record, kept separate from the run report |
| **Security** | Credentials only in gitignored `.env.*` / `.env.publish`, Husky secret scan on commit, never in tracked files |

## Folder structure

Product code lives under `src/`; tooling stays at the repo root. Import `test` / `expect` from
`src/fixtures.ts`, never `@playwright/test`. Ticket traceability is a Playwright tag, filtered
with `TICKET=<key>` — not a ticket folder.

```
Regression-Test-Playwright-Framework/
│
├── .claude/ / .cursor/       # Mirrored agents, commands, skills, rules, hooks
│   ├── agents/               # e2e-explorer, e2e-runner, e2e-evidence
│   ├── commands/             # /e2e-ticket
│   ├── skills/ / rules/      # e2e patterns, TDD, evidence conventions
│   └── hooks/                # skill reminder
├── .husky/                   # pre-commit → scan-secrets + lint-staged
├── .github/workflows/        # CI: typecheck, lint, secrets, reachability, Playwright, Allure
├── .env.example              # Env template (the only committed env file)
├── .env.<TEST_ENV>           # Credentials per environment (gitignored)
├── .env.publish              # Jira / Confluence / Zephyr / Teams tokens (gitignored)
├── .auth/                    # Saved storageState from globalSetup (gitignored)
├── AGENTS.md                 # Tool-agnostic agent guide
├── CLAUDE.md                 # Conventions contract
├── COVERAGE.md               # Ticket coverage ledger
├── publish.config.json       # Jira / Confluence / Zephyr / Teams ids — committed, no secrets
├── vendor.config.json        # Frontend source mirrors for selector tracing (tier 1)
├── vendor/                   # Sparse clones of that source (gitignored, on demand)
├── playwright.config.ts      # TEST_ENV, workers, reporters, evidence mode, safety grep
├── evidence-reporter.ts      # EVIDENCE=true → named media in src/evidence/<TICKET>/
├── progress-reporter.ts      # Optional live-run progress file
├── allurerc.mjs              # Allure 3 report config (history, quality gate, plugins)
│
├── docs/
│   ├── ONBOARDING.md         # Fresh-machine setup
│   ├── APP-MAP.md            # Navigation index, helpers index, environment quirks
│   ├── SRC_STRUCTURE.md      # Product-layer map
│   ├── PUBLISHING.md         # The Jira / Confluence / Zephyr / Teams pipeline
│   └── allure-history.jsonl  # Committed trend — survives a machine wipe
│
├── scripts/
│   ├── setup.mjs             # postinstall: hooks, Chromium, .env stubs
│   ├── scan-secrets.js       # Pre-commit + CI secret scanner
│   ├── check-reachability.js # TCP preflight of BASE_URL
│   ├── refresh-vendor.sh     # Sparse/shallow clones of the frontend source (tier 1)
│   ├── codegen.mjs           # Authenticated codegen on BASE_URL (tier 3)
│   ├── sync-ai-mirrors.mjs   # Keep .claude ↔ .cursor identical
│   ├── attach-evidence.mjs / post-evidence-comment.mjs
│   ├── embed-evidence-in-description.mjs / cleanup-attachments.mjs
│   ├── publish-test-plan.mjs / prune-test-plan-attachments.mjs
│   ├── zephyr.mjs / notify-teams.mjs
│   └── lib/                  # config, jira, adf, confluence, tcp-probe, zephyr/
│
├── templates/                # Spec + page-object scaffolds, rows / plan / Zephyr / Teams samples
│
└── src/
    ├── fixtures.ts           # Wrapped test / expect (worker accounts + env guard)
    ├── tests/
    │   ├── globalSetup.ts    # validateConfig, TCP probe, login → .auth/user.json
    │   ├── globalTeardown.ts
    │   ├── auth/ catalog/ checkout/   # Example specs, organised by feature
    ├── pages/                # Page objects (extend BasePage, barrel index.ts)
    ├── utils/                # env, test-data, cleanup, interactions, retry, evidence, api
    ├── types/
    ├── test-data/            # Stable seed names — not generated E2E-* rows
    ├── evidence/<TICKET>/    # Generated captures (gitignored)
    └── test-results/         # Generated Playwright output (gitignored)
```

## Quick start

> **On Windows?** Do all of this inside WSL, not native Windows — jump to
> [Windows setup (WSL)](#windows-setup-wsl) first. macOS and Linux users carry straight on.

### Prerequisites

- **Node.js** v24.18.0 (`.nvmrc`) — `nvm use`. Anything ≥ 20 works.
- **Git**
- **Cursor** or **Claude Code** (optional, for the agent workflow)

No Java. Allure Report 3 ships a Node CLI, so the report needs no JRE locally or in CI.

### Install and see it green

```bash
git clone https://github.com/jramirez-automate/Regression-Test-Playwright-Framework.git
cd Regression-Test-Playwright-Framework
nvm use
npm install          # postinstall: git hooks, Chromium, .env stubs
npm run test:demo    # 7 tests against the public demo app
```

That run needs no credentials and no configuration — `.env.demo` is scaffolded from
`.env.example`, which points at [saucedemo.com](https://www.saucedemo.com).

### Point it at your own app

```bash
cp .env.example .env.staging
# edit: BASE_URL, E2E_USERNAME, E2E_PASSWORD
npm run test:staging
```

Then replace the example page objects in `src/pages/` and the specs in `src/tests/`. The only
page object the framework itself depends on is `LoginPage` — `globalSetup` drives it to produce
the saved session. Everything else is yours to delete.

## Windows setup (WSL)

> On Windows, run this suite inside **WSL** (Windows Subsystem for Linux), not native Windows.
> WSL gives you a real Linux environment, which avoids the path, line-ending, bash-script and
> Playwright-dependency friction of native Windows. Both Cursor and Claude Code integrate with
> WSL cleanly. Do every step of [Quick start](#quick-start) from inside the WSL shell.

### 1. Install WSL

In an Administrator PowerShell (or Windows Terminal), install WSL with its default Ubuntu
distribution, then reboot:

```powershell
wsl --install
```

After the reboot, Ubuntu launches and asks you to create a Linux username and password (this
account is separate from your Windows login). If WSL is already present, `wsl --update` keeps
it current and `wsl -l -v` lists your distributions.

### 2. Install Node (nvm) and git inside WSL

```bash
sudo apt update && sudo apt install -y git curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# close and reopen the shell (or: source ~/.bashrc), then:
nvm install 24.18.0
```

### 3. Clone into the Linux filesystem

Clone into your WSL home (e.g. `~/projects`), **not** a Windows path under `/mnt/c/…` — the
Linux filesystem is far faster for git and npm, and avoids line-ending and permission issues:

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/jramirez-automate/Regression-Test-Playwright-Framework.git
cd Regression-Test-Playwright-Framework
```

### 4. Open it through WSL

**Cursor:** install Cursor on Windows and its WSL extension once. Then from the WSL shell
inside the repo, `cursor .` opens it against the WSL filesystem.

**Claude Code:** install it inside WSL (`npm install -g @anthropic-ai/claude-code`), then run
`claude` from the repo directory. Cursor's integrated terminal is already a WSL shell when
opened this way.

Now finish [Quick start](#quick-start) from this WSL shell. One WSL note for later:
`npm run report:allure` prints `http://localhost:8080` rather than launching a browser (there
is no `xdg-open` here), and WSL2 forwards `localhost`, so that URL opens fine from a Windows
browser.

## Configuration

`TEST_ENV` selects a gitignored `.env.<TEST_ENV>` file. Write environments come from
`E2E_WRITE_ENVS` (default `demo,local,dev,qa,staging`); **everything else is forced to
`@smoke` (read-only)** by the grep guard in `playwright.config.ts`.

| TEST_ENV | Typical host | What runs |
| --- | --- | --- |
| `demo` | `https://www.saucedemo.com` | write + smoke (the shipped example) |
| `local` | `http://localhost:3000` | write + smoke |
| `dev` / `qa` | your deployed lower environments | write + smoke |
| `staging` | your pre-release environment | write + smoke |
| `prod` (or any unlisted name) | production | `@smoke` only |

That guard is the single mechanism keeping a create/delete spec away from production, which is
why it lives in the config where a spec cannot opt out of it.

### Environment variables

Copy from `.env.example` — the full commentary lives there.

| Variable | Description | Required |
| --- | --- | --- |
| `BASE_URL` | Origin of the app under test | Yes (`validateConfig`) |
| `E2E_USERNAME` / `E2E_PASSWORD` | Test account | Yes, unless `E2E_SKIP_AUTH=1` |
| `E2E_USERNAME_2` / `E2E_PASSWORD_2` (then `_3`…) | Extra accounts for parallel workers | No — workers stay at 1 |
| `E2E_WORKERS` | Cap workers (cannot exceed the account count) | No |
| `E2E_WRITE_ENVS` | Comma-separated write environments | No |
| `E2E_ALLOW_WRITES` | Local-only override for a read-only env (ignored when `CI=true`) | No |
| `E2E_TENANT_NAME` | Tenant / organisation the specs operate in | If your app has one |
| `API_BASE_URL` / `API_TOKEN` / `API_TOKEN_PATH` | API-based prerequisite setup | For API setup |
| `E2E_SKIP_AUTH` | `1` = no UI login; start from an empty session | No |
| `E2E_REUSE_AUTH` | `1` = reuse `.auth/user.json` | No |
| `SKIP_URL_CHECK` | `1` = skip the TCP env guard | No |
| `E2E_GUARD_URL` | Probe a different host than `BASE_URL` | No |
| `APP_VERSION` | Build under test, shown in Allure and evidence | Recommended |
| `ALLURE_JIRA_BROWSE_URL` | Turns `@PROJ-123` tags into Allure issue links | No |
| `EVIDENCE` / `TICKET` | Capture a bundle into `src/evidence/<TICKET>/` | Evidence runs |
| `HEADED` | `true` = visible browser | No |

Publishing credentials live separately in **`.env.publish`** (`JIRA_EMAIL`, `JIRA_API_TOKEN`,
`ZEPHYR_API_TOKEN`, `TEAMS_WEBHOOK_URL`).

**Priority:** `process.env` (CI / shell) → `.env.<TEST_ENV>` → defaults in `src/utils/env.ts`.

### Local vs CI

```bash
# Local — one file per environment
cp .env.example .env.staging
npm run test:staging

# CI — Actions secrets, no .env files
export CI=1 TEST_ENV=staging
npm ci
npm run check:reachability
npx playwright test
```

## Running tests

```bash
npm test                       # TEST_ENV from the shell, else demo
npm run test:demo
npm run test:staging
npm run test:headed            # HEADED=true
npm run test:debug
npm run test:ui
npm run test:smoke             # read-only subset
```

### Run by tag or file

```bash
TICKET=PROJ-103 npm run test:staging
npx playwright test src/tests/checkout/checkout.spec.ts -g "refuses to continue"
```

### Auto-captured (no spec setup)

| What | When | Where |
| --- | --- | --- |
| TCP environment guard | Before every test | Throws in ~3s if the host is down (`SKIP_URL_CHECK=1` to skip) |
| Screenshot / video / trace | On failure, or always when `EVIDENCE=true` | `src/test-results/` or `src/evidence/<TICKET>/` |

### Parallelism

Workers default to **1**. Add complete extra account pairs to `.env.<TEST_ENV>`
(`E2E_USERNAME_2` / `E2E_PASSWORD_2`, …) to run that many workers — the same user in two
browsers session-kicks itself in most apps, so accounts are the real ceiling, not CPU cores.
Headed mode always stays at 1. Cap with `E2E_WORKERS`. Chromium only.

### A long full-suite run

```bash
TEST_ENV=staging EVIDENCE=true PW_GLOBAL_TIMEOUT_MS=0 E2E_WORKERS=4 \
  npx playwright test --grep @regression
```

`PW_GLOBAL_TIMEOUT_MS=0` disables Playwright's global run timeout, which is sized for a single
spec rather than a whole tree and will otherwise cut a full regression off mid-way.

## Writing a spec

Scaffold from `templates/`, then work one slice at a time — write ONE test, run it alone, see
it fail meaningfully, drive it green, then write the next.

```bash
cp templates/spec.template.ts src/tests/<feature>/<name>.spec.ts
cp templates/page-object.template.ts src/pages/<Feature>Page.ts
npm run test:codegen           # authenticated codegen window
```

The full loop — seams, red proof, the sensitivity check when a test passes first time, and the
anti-tautology rule — is in [`CLAUDE.md`](CLAUDE.md) → "TDD authoring loop".

`src/tests/checkout/checkout.spec.ts` is the worked example: generated names, teardown
registered at creation time, one criterion per test, and a negative slice that asserts both the
message and that the flow did **not** proceed.

## Test data

Do not hardcode names, and do not leave rows behind.

```typescript
const name = e2eName("Order");          // E2E-Order-<ts>-<rand>
cleanup.add(() => orders.deleteByName(name));
```

- **`e2eName()` / `e2eShortName()` / `e2eAlphaName()`** — unique names (`src/utils/test-data.ts`).
  The `E2E-` prefix is the contract: debris from a crashed run is recognisable and safe to purge.
- **`personFixture()`** — a disposable person's first/last/username/email, pre-joined.
- **`CleanupRegistry`** — LIFO teardown in `afterEach`; never throws, so it cannot mask the
  assertion failure that preceded it.
- **`src/utils/api.ts`** — prefer the API for prerequisite data; drive the UI only for the
  behaviour under test. A spec that clicks through four screens to reach its assertion fails for
  four reasons unrelated to its criterion.
- **`src/test-data/`** — stable seed names that tests read but never create.

## Reporting

Two surfaces with different jobs. Do not substitute one for the other.

**Allure is the run report** — what the last execution did, how it trended, which failures
cluster. On by default (`ALLURE=false` to skip a run).

```bash
npm run report:allure            # generate, then serve on http://localhost:8080
npm run report:allure:generate   # generate only (CI)
npm run report:allure:gate       # advisory pass-rate gate
npm run allure:clean             # drop allure-results/ before a fresh full run
npm run report                   # Playwright's own HTML report
```

One `generate` builds both views — the per-test report and the charts dashboard. Running them
as separate CLI passes appends a trend point per pass, so one run would show up twice in Status
dynamics.

What the wiring adds beyond stock (`src/utils/allure-config.ts` + `allurerc.mjs`):

- **Run identity** — environment, base URL, `APP_VERSION`, ticket and commit are written as
  Allure environment info, so a green report still names its build. Environments get redeployed
  mid-cycle; "227 passed" against an unnamed build proves nothing a month later.
- **Ticket links** — a `@PROJ-123` describe tag becomes an issue link on every test, with no
  `allure.issue()` calls in specs. Set `ALLURE_JIRA_BROWSE_URL`.
- **Grouping by feature area** — `parentSuite` is the feature, not `chromium`, so the report
  does not collapse into one flat node.
- **Risk-based severity** — fill `STORIES` in `src/utils/allure-config.ts` from whatever risk
  scoring sequenced your campaign, and one ranking then drives both run order and the height of
  a red bar.
- **Failure categories** — buckets by the *shape* of a failure (server rejected the request,
  blocked environment, timeout, assertion). A shape survives the next release; a message from
  one build does not.
- **Trend** — `docs/allure-history.jsonl` is committed, so history survives a machine wipe and a
  fresh CI runner. `allure-results/` and `allure-report/` are ignored.

A failure that is already a raised defect can be declared in `allurerc.mjs` under
`resolutions.rules`, so the report stops reading it as a new regression. A rule matches on
`messageRegexp`, `testCaseId`, `retryHash` or `environment`, and resolves to `issue` (linked to
the defect via `resolutions.links`), `muted`, or `accepted`. Once the known ones are declared,
raise `qualityGate.rules[].successRate` so a *new* failure is the only thing that can break the
build. Note that `known-issues.json` is **not** where rules go — the report writes that file
itself as a record of matched failures, and hand-editing it breaks generation.

## Evidence

**Evidence is the acceptance record** — TC ids, criteria, signed-off media. Allure has no notion
of a TC id or a criterion, so it never replaces an evidence bundle.

```bash
TICKET=PROJ-123 npm run test:evidence
```

Output lands in `src/evidence/PROJ-123/`: a descriptive `.png` / `.webm` / trace per test (via
`evidence-reporter.ts`), plus `report/` and `artifacts/`. Screenshots are viewport-sized
(1920×1080); videos record at 1280×720, because Playwright's default shrinks the viewport into
an 800×450 box that is too coarse to read field-level validation text.

Artifact names are **environment-suffixed** (`<test-title>-staging.png`,
`<test-title>-prod.webm`) so runs on two environments coexist instead of overwriting each other —
which is what the two-column evidence table needs. Failed tests keep their artifacts with a
`-FAILED` suffix.

**Subject visibility is a hard rule.** Every screenshot and the proving moment of every recording
must show the feature under test. Playwright's end-of-test screenshot is the final viewport, so a
criterion proven inside a dialog leaves no trace once the test dismisses it — and a run that
publishes a blank page as its proof is worse than one with no media, because it looks like
evidence. Frame it first:

```typescript
import { attachSubject, attachCloseUp } from "../../utils";

await attachSubject(page, test.info());              // while the dialog is still open
await attachCloseUp(page, test.info(), iconButton);  // padded close-up of one control
```

## Publishing pipeline

Everything below is driven by [`publish.config.json`](publish.config.json) (ids and folder
names — committed, no secrets) and `.env.publish` (tokens — gitignored). No project key, space
id or ticket prefix is hardcoded in a script body, which is what lets the pipeline move between
products. Full detail: [`docs/PUBLISHING.md`](docs/PUBLISHING.md).

```bash
# 1. Plan — Zephyr cases from the seam table, BEFORE any spec is written
TICKET=PROJ-123 npm run zephyr -- create --spec src/evidence/PROJ-123/zephyr-spec.json

# 2. Capture
TICKET=PROJ-123 npm run test:evidence

# 3. Attach only what the comment references
TICKET=PROJ-123 npm run evidence:attach -- --from-rows src/evidence/PROJ-123/comment-rows.json

# 4. Post the TC table with inline thumbnails and playable video
TICKET=PROJ-123 npm run evidence:comment -- --rows src/evidence/PROJ-123/comment-rows.json

# 5. Publish the Confluence test plan (full TC table + embedded media)
TICKET=PROJ-123 npm run publish:test-plan

# 6. Record the Zephyr executions
TICKET=PROJ-123 npm run zephyr -- mark-pass

# 7. Optional: notify Teams, then tidy orphaned attachments
TICKET=PROJ-123 ENV=prod npm run notify:teams
TICKET=PROJ-123 npm run evidence:cleanup
```

Notes that save time:

- **Jira caps a comment at 32,767 characters**, measured against the whole ADF JSON rather than
  the visible text. A TC row with steps, a screenshot and a video costs ~1,700, so roughly 17 rows
  fit. The script reports the arithmetic and refuses to post rather than handing you an opaque 400.
- **TC ids are always `TC-001`, `TC-002`, …** — zero-padded hyphen form, never `TC1`. The same ids
  appear in Confluence and Zephyr and get cited by bugs, so the format has to be stable. Never
  renumber to close a gap; say why the gap exists.
- **Bugs should show their proof.** After attaching, `npm run evidence:embed` inlines the failure
  media into the bug's description under an **Evidence** heading, so nobody has to open the
  Attachments tab to judge it. Re-running replaces that section rather than appending.
- **Zephyr cases come from the seam table, before the specs.** The cases are the design artifact;
  the Playwright specs and the Zephyr cases are two renderings of it. Generating cases *from* code
  inverts that and produces steps a manual tester cannot follow.
- **Curate before you attach.** `--from-rows` uploads exactly what the comment references. A
  capture folder also holds unused environment runs and traces, and dumping all of it buries the
  three files a reviewer actually needs.

## AI-assisted development

Cursor and Claude Code share the same agents, commands, skills and rules under `.claude/` and
`.cursor/`. After editing one side:

```bash
npm run sync:ai                  # .claude → .cursor
npm run sync:ai -- --from=cursor
npm run sync:ai:check            # exit 2 if any pair differs
```

There is no `.cursorrules`; guidance lives in `AGENTS.md` and `CLAUDE.md`. The Playwright MCP is
for **browser exploration**, not as a test runner.

### Where selectors come from — a strict ladder

The explorer works down three tiers and uses the first one available, because each is weaker
than the one above it. It reports which tier it used, so a reviewer knows how much to trust the
result.

| Tier | Source | Setup | Gives you |
| --- | --- | --- | --- |
| **1** | Vendored frontend source | `vendor.config.json` + `npm run vendor:refresh` | The full route table, feature-flagged branches, exact `t("...")` strings — the things a rendered page hides |
| **2** | Existing manual test cases | None — read the Zephyr case, Confluence Test Scenario, or ticket steps | The flow, the criteria and the success signals, already in user vocabulary. Not selectors |
| **3** | Codegen / live app | `npm run test:codegen`, or the Playwright MCP | Real roles and accessible names, but only for states you can actually reach |

**Tier 1** needs read access to the frontend repo. Add it to `vendor.config.json` and run
`npm run vendor:refresh` — a sparse, shallow, blob-less clone, so a monorepo costs tens of
megabytes rather than gigabytes. `vendor/` is gitignored; it is a mirror, not content this repo
owns. The script is non-fatal: offline or unauthenticated, it warns and the explorer drops a
tier.

**Tier 2** is better than its position suggests. Manual cases are already written as numbered
user actions with one observable expected result — the exact shape this suite needs — so
converting them is the intended path rather than a workaround. They just do not carry locators,
which you resolve against the running app before writing the spec.

**Tier 3** only ever shows the states you happen to reach: an empty list, an action you lack
permission for, or a flag that is off simply will not appear. The explorer is required to say
which states it could not reach.

If all three are unavailable, the explorer reports `BLOCKED` and stops rather than inventing
markup — a flow map guessed from assumed DOM produces page objects that fail on every selector.

```bash
npm run vendor:refresh              # tier 1: clone/refresh the source mirrors
npm run test:codegen                # tier 3: authenticated codegen on BASE_URL
npm run test:codegen -- /orders/new # …starting on a deep link
```

| What you want | Say / run this |
| --- | --- |
| A full ticket (explore → cases → specs → evidence) | `/e2e-ticket PROJ-123` |
| A new spec file | Copy `templates/spec.template.ts` into `src/tests/<feature>/` |
| A new page object | Copy `templates/page-object.template.ts` into `src/pages/` |
| Authenticated codegen | `npm run test:codegen` |

Subagents: **e2e-explorer** (read-only app exploration → a compact selector/flow map),
**e2e-runner** (run, triage, fix, loop until green), **e2e-evidence** (capture, verify against
criteria, publish).

## Best practices

### Locators

Prefer `getByRole` / `getByText`. Scope modals with
`getByRole("dialog").filter({ has: heading })` — apps commonly keep several dialogs mounted, and
an unscoped `getByRole("dialog")` will happily resolve to the wrong one. Raw locators belong in
page objects. Use `frameLocator()`, never `page.frame()`.

```typescript
await this.page.getByRole("button", { name: "Save" }).click();
await this.page.frameLocator("iframe#player").getByRole("button", { name: "Play" });
```

### Waits

```typescript
// BEST — state
await element.waitFor({ state: "visible" });
await waitForModalDetachedThenToast({ modal, toast });

// AVOID — fixed timeout
await page.waitForTimeout(5000);
```

Assert the success sequence in order: modal **detached** first, then the toast. Asserting the
toast alone passes while the modal sits open over a failed save.

### Dynamic test data

```typescript
const name = e2eName("Order");   // CORRECT
const name = "My Order";         // WRONG — collisions and leftover rows
```

## Troubleshooting

| Issue | Solution |
| --- | --- |
| Credentials not loading | `TEST_ENV` must match `.env.<TEST_ENV>`; CI uses secrets, not the file |
| `validateConfig` reports a missing `BASE_URL` / `E2E_USERNAME` | Fill `.env.<TEST_ENV>`, or set `E2E_SKIP_AUTH=1` for an app with no login |
| Environment down, tests hang | The TCP guard should fail in ~3s; `npm run check:reachability`. Use `SKIP_URL_CHECK=1` only when reachability cannot be checked by design |
| Write tests are skipped | That environment is not in `E2E_WRITE_ENVS`, so only `@smoke` runs — by design |
| Iframe elements not found | `frameLocator()`, not `page.locator()` |
| Leftover `E2E-*` rows | `e2eName()` + `CleanupRegistry` in `afterEach` |
| Login throttled | `E2E_REUSE_AUTH=1` to reuse `.auth/user.json` |
| Pre-commit hook silent | `core.hooksPath` should be `.husky` (re-run `npm install`) |
| Playwright browsers missing | `npx playwright install --with-deps chromium` |
| Evidence PNG is blank or the wrong screen | Scroll the subject into view and attach before dismissing — see [Evidence](#evidence) |
| Allure generation crashes with `known.forEach is not a function` | `known-issues.json` was hand-edited; rules belong in `allurerc.mjs` |

```bash
npm run test:debug
npm run test:headed
npm run test:ui
```

## Documentation index

| Document | Contents |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Conventions: TDD loop, data discipline, evidence, selectors |
| [`AGENTS.md`](AGENTS.md) | Tool-agnostic agent guide |
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md) | Fresh-machine setup |
| [`docs/PUBLISHING.md`](docs/PUBLISHING.md) | Jira / Confluence / Zephyr / Teams pipeline |
| [`docs/APP-MAP.md`](docs/APP-MAP.md) | Navigation index, helpers index, environment quirks |
| [`docs/SRC_STRUCTURE.md`](docs/SRC_STRUCTURE.md) | Product-layer map |
| [`COVERAGE.md`](COVERAGE.md) | Ticket coverage ledger |
| [`templates/`](templates/) | Spec, page object, comment rows, test plan, Zephyr, Teams |

## NPM scripts

| Script | Description |
| --- | --- |
| `npm test` / `test:demo` / `test:staging` | Run Playwright (`TEST_ENV`) |
| `npm run test:headed` / `test:debug` / `test:ui` | Visible / debug / UI mode |
| `npm run test:smoke` | The read-only `@smoke` subset |
| `npm run test:evidence` | Capture PNG/WebM into `src/evidence/<TICKET>/` |
| `npm run test:codegen` | Authenticated codegen on `BASE_URL` (takes a path argument) |
| `npm run vendor:refresh` | Clone/refresh the frontend source mirrors in `vendor/` |
| `npm run report` | Playwright HTML report |
| `npm run report:allure` / `:generate` / `:gate` | Allure run report |
| `npm run allure:clean` | Delete `allure-results/` and `allure-report/` |
| `npm run evidence:attach` | Attach curated media to Jira |
| `npm run evidence:comment` | Post the inline-media TC table |
| `npm run evidence:embed` | Inline media into a bug description |
| `npm run evidence:cleanup` | Delete Jira attachments no comment references |
| `npm run publish:test-plan` | Confluence test plan + media |
| `npm run publish:prune-attachments` | Delete stale page attachments after a rename |
| `npm run zephyr` | Zephyr Scale (`create` / `mark-pass`) |
| `npm run notify:teams` | Pass notification to a Teams webhook |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run scan:secrets` / `:staged` | Secret scanner |
| `npm run check:reachability` | TCP preflight |
| `npm run sync:ai` / `sync:ai:check` | Mirror `.claude` ↔ `.cursor` |

## License

MIT — see [`LICENSE`](LICENSE).
