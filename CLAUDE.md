# Conventions contract

The rules this suite is held to. The `e2e-explorer` / `e2e-runner` / `e2e-evidence` agents and
the `/e2e-ticket` command treat this file as their rulebook. Human-facing docs (setup,
reporting, troubleshooting) live in [`README.md`](README.md). Accumulated app knowledge
(routes, environment data, quirks) lives in [`docs/APP-MAP.md`](docs/APP-MAP.md) — read it
before exploring or writing specs, and append durable new facts afterwards.

## Context hygiene

Keeps an orchestrating session small and its reports readable.

- **Report caps** (an agent's entire reply): explorer ≤ 100 lines, runner ≤ 40, evidence ≤ 60.
  Facts and verdicts only — no narration of the work.
- **No dumps**: never paste a file, a spec, or raw API JSON into a reply. Cap command output at
  ~30 lines; summarise and point at paths for the rest.
- **Relay, don't re-print**: the orchestrating session forwards an agent's verdict lines only.
  The detail already lives in the transcript and in `src/evidence/<TICKET>/`.

## Layout

- Specs live in `src/tests/<feature>/` **by feature domain, never by ticket**. A ticket folder
  is unreadable six months later; the tag carries the traceability.
- Traceability is a tag: `test.describe("Checkout", { tag: "@PROJ-123" }, …)`. Multiple tags:
  `{ tag: ["@smoke", "@PROJ-123"] }`. Run one ticket with `TICKET=PROJ-123 npm run test:staging`.
- Specs import `test` / `expect` from `src/fixtures.ts` — **never `@playwright/test` directly**.
  The wrapper binds worker accounts and runs the environment guard; a spec that bypasses it
  loses both silently.
- Page objects in `src/pages/` (all extend `BasePage`, barrel `src/pages/index.ts`).
- Shared types in `src/types/`, shared helpers in `src/utils/`.
- Generated output is gitignored: `src/evidence/<TICKET>/` for captures, `src/test-results/` for
  Playwright artifacts. The HTML report stays at `playwright-report/`.
- **Extraction rule**: used by 2+ files → move to `src/types/` or `src/utils/`; single consumer →
  co-locate.

## Data discipline

- Write environments come from `E2E_WRITE_ENVS` (`src/utils/env.ts`). Everything else runs
  `@smoke` (read-only) only. **Never add production to that list** to make a test pass.
- Every entity a spec creates MUST:
  1. be named with `e2eName("Kind")` (→ `E2E-Kind-<ts>-<rand>`), and
  2. be deleted in `test.afterEach` via `CleanupRegistry` (LIFO, so dependents go before their
     dependencies) or a page object's best-effort `delete*ByName`.
- Cleanup never throws. A teardown that fails masks the assertion failure that preceded it, and
  you spend the afternoon debugging the wrong thing.
- Register teardown **at creation time**, not at the end of the test. A test that fails midway
  still has to leave the environment as it found it.
- **Prefer the API for prerequisite data** (`src/utils/api.ts`); drive the UI only for the
  behaviour under test. The money assertion always stays on the real UI.
- Tenant / organisation names come from `tenantName()` — never hardcoded.
- Credentials live only in gitignored `.env.*` / `.env.publish`. NEVER in a tracked file.

## Ask before running against beta or production

Never start Playwright — a full regression, a single spec, evidence capture, or a dispatched
agent — against a beta, pre-production or production environment until the user explicitly
approves that environment in the conversation. Local, dev, qa and staging may run without
asking.

"Run the tests", "continue the ticket", or a yes from a previous conversation is not approval.
Ask for one environment at a time. On a decline or no answer, skip it — do not run it "just in
case", and do not route around the gate via CI triggers or `E2E_ALLOW_WRITES`.

## TDD authoring loop

The e2e-specific layer on top of the generic `tdd` skill. Where they overlap, **this file wins**:
the seam is a page object, the red proof is pragmatic, and environment/data discipline is
mandatory.

- **Seam rule**: tests verify user-visible behaviour through page objects — user actions in,
  observable outcomes out (toast text, URL, rendered rows). The network boundary is a valid seam
  only when that boundary IS the feature (caching, bundling, persistence).
- **One slice at a time**: never more than one unproven test exists. Write ONE test → run it
  alone (`npx playwright test <file> -g "<title>"`) → prove it → next. Writing all the specs and
  then running the batch is prohibited: bulk tests verify *imagined* behaviour, and you commit to
  a test structure before understanding the implementation.
- **Red proof (pragmatic)** — every new test must be seen to fail meaningfully once:
  - The first run fails at the **money assertion** (the `expect` encoding the criterion) because
    the behaviour is genuinely absent → that IS the red proof; drive it green. Setup and selector
    failures do not count — fix those until the failure is the behavioural assertion.
  - The first run passes (already-shipped feature) → a **sensitivity check** is required.
    Temporarily mutate the money assertion to an obviously wrong expectation, run, confirm it
    fails *at that assertion*, then revert byte-exactly and verify with `git diff`. If the mutated
    test still passes, the test is vacuous — stop and rewrite it. A mutated expectation must NEVER
    be committed.
- **Anti-tautology**: expected values come from test inputs, ticket criteria, or explorer-verified
  literals — never from reading back the same page state you are asserting. Negative assertions
  (`toHaveCount(0)`) count only when the same locator is proven positive in a sibling test, or via
  the sensitivity check.
- **Explicit verdicts**: each criterion appears as an explicit `expect`. Page-object internal
  waits are plumbing, not the verdict.
- **Refactor is a separate stage**: after green, extraction happens with zero assertion changes,
  then rerun to stay green.
- **Coverage rule**: every acceptance criterion maps to ≥1 test, or its exception (why it cannot
  be automated) is recorded in the seam table and `COVERAGE.md`. Add cheap edge and negative
  slices — validation errors, empty states, cancel paths — beyond the literal criteria.
- **Proof record**: one row per slice in `src/evidence/<TICKET>/tdd-log.md`.

## Selectors and flow

- Prefer `getByRole` / `getByText`. Scope modal locators with
  `getByRole("dialog").filter({ has: heading })` — several dialogs are often mounted at once.
- Assert order: modal **detached** → then the success toast.
- Raw locators belong in page objects, not specs.
- `frameLocator()` for iframes, never `page.frame()`.
- State-based waits over `waitForTimeout`. Wrap meaningful sequences in `test.step()`.
- Retry helpers (`retryClick` / `retryFill`) are for a *specific* widget known to flake. Blanket
  retries hide real regressions — a control that needs three attempts is telling you something.

## Reporting vs evidence

Two surfaces, different jobs — do not substitute one for the other.

- **Allure = the run.** On by default (`ALLURE=false` to skip). `npm run report:allure` — one
  pass builds both the per-test report and the dashboard; never generate them separately or the
  trend gains two points per run. Wiring: `src/utils/allure-config.ts` and `allurerc.mjs`. Trend
  lives in the committed `docs/allure-history.jsonl`.
- **Evidence = the acceptance record.** TC ids, criteria, signed-off media — Jira, Confluence,
  Zephyr. Allure has no notion of a TC id or a criterion, so it never replaces an evidence bundle.

## Evidence

- Capture is deterministic: `TICKET=PROJ-123 npm run test:evidence`. Output goes to
  `src/evidence/<TICKET>/` — a descriptive `.png` / `.webm` / trace per test, environment-suffixed
  so two environments coexist.
- **Name the release under test.** Set `APP_VERSION`, or the `version` field in
  `comment-rows.json`. Artifacts captured while a release was still deploying are void — discard
  and re-run rather than publishing a pass that predates the build.
- **Subject visibility (hard rule).** Every screenshot and the proving moment of every recording
  must show the feature or object under test. If the end-of-test viewport would hide it, scroll it
  into view, keep the proving UI open, and/or `attachSubject(page, test.info())` before dismissing.
  A blank page, spinner, wrong scroll or unrelated screen is invalid evidence — recapture before
  publishing. It is worse than no media, because it looks like proof.
- **Show a found bug in the chat.** The moment a run exposes a product defect, embed the proving
  screenshot in the reply (`![what it shows](/abs/path.png)`) in the same message that reports it.
  A reviewer judges the defect from the chat and cannot assess one they cannot see. Pick the frame
  showing the fault, say which screen it is, and quote the server's own words when an API failed.
- **Curate before attaching**: write `comment-rows.json` first, then upload only what that
  comment references (`--from-rows`) — not every file in the folder.
- **TC ids are always `TC-001`, `TC-002`, …** — zero-padded hyphen, never `TC1`. Same form in
  Jira comments, Confluence and Zephyr. Publish in TC order. Never renumber to close a gap; bugs
  and comments already cite those ids — say why the gap exists instead.
- **Bugs show their evidence inline.** After attaching, run `npm run evidence:embed` so the
  failure media renders in the description under an **Evidence** heading. Idempotent.
- **Every bug description opens with an Environment block**, before Summary and Steps:
  `Environment:` / `URL: <the exact page where it reproduces, not the site root>` /
  `Browser ver: <the Playwright-bundled Chromium actually used>`. Take the URL from `page.url()`
  at the point of failure and the browser from `npx playwright --version`.
- **A raised bug gets the failure media too.** Copy the `*-FAILED.png` / `*-FAILED.webm` into
  `src/evidence/<BUG-KEY>/`, write a minimal `comment-rows.json` there, and attach. Proof that
  lives only on the parent ticket makes the bug unreadable on its own.
- `src/evidence/` is gitignored — regenerate on demand.

## Zephyr cases

Cases are created from the **seam table, before any Playwright spec exists**. The cases are the
design artifact; the specs and the cases are two renderings of it. Generating cases *from* code
inverts that and yields steps a manual tester cannot follow.

- Numbered **user** actions only, one discrete action per step.
- `expectedResult` on the **last** step only — one observable outcome.
- Never write framework internals (`getByRole`, `afterEach`, file paths) into a step.
- Name: one sentence starting **Verify …**. `"tc": "TC-001"`, zero-padded.

## Ticket workflow

1. **Explore** — read the ticket, then map the route → components → selectors from the highest
   available tier of the selector ladder: **(1)** vendored frontend source (`vendor/`, via
   `npm run vendor:refresh`), **(2)** existing manual test cases converted into the flow,
   **(3)** codegen or the Playwright MCP against the running app. Write a compact flow map to
   `src/evidence/<TICKET>/flow-map.md` and name the tier — it tells the reader how much to
   trust the selectors. None available → report BLOCKED; never invent markup.
2. **Seam table + Zephyr cases** — present the TC table, then create the cases in planned mode
   (`Not Executed`) **before** any spec is written.
3. **Write specs (TDD)** — from `flow-map.md`, one slice at a time.
4. **Run** — until green. Ask before beta or production environments.
5. **Evidence** — capture, verify each artifact against its criterion, write `SUMMARY.md`,
   attach, comment, publish the test plan, record the Zephyr executions.
6. **Persist what you learned** — append the ticket's row to `COVERAGE.md`, and any new route or
   helper to `docs/APP-MAP.md`.

### Self-improving suite

The suite gets faster by never re-discovering the same navigation or re-writing the same
interaction. Two indexes in `docs/APP-MAP.md` are the memory:

- **Look up before you build.** "How do I reach page X" → Navigation index. "Is there a helper for
  this widget" → Helpers index and `src/utils/interactions.ts`.
- **Cost trigger.** If a page was not where the map said, or took more than a couple of attempts
  to reach, record a `NEW NAV FACT`. If you write the same gnarly interaction a second time,
  extract it to `src/utils/interactions.ts` and record a `NEW HELPER`. Non-optional, even on small
  runs.
- **Graduation.** A click-path used by specs becomes a page-object `goto*()`; inline interaction
  code becomes a named helper, and the index row then points at the code.
