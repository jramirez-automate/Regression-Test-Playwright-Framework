# Onboarding

Getting from a fresh machine to a green run, and then to your own application.

## 1. Prerequisites

- **Node.js** v24.18.0 (`.nvmrc`). Anything ≥ 20 works; `nvm use` picks the pinned version.
- **Git.**
- **Cursor** or **Claude Code** — optional, for the agent workflow.

No Java: Allure Report 3 ships a Node CLI.

On Windows, work inside WSL rather than native Windows — see README →
[Windows setup (WSL)](../README.md#windows-setup-wsl).

## 2. Install

```bash
git clone https://github.com/jramirez-automate/Regression-Test-Playwright-Framework.git
cd Regression-Test-Playwright-Framework
nvm use
npm install
```

`npm install` runs `scripts/setup.mjs`, which points git at `.husky`, installs Chromium, and
scaffolds `.env.demo` and `.env.publish`. Every step is non-fatal — provisioning never fails an
install.

## 3. Prove it works

```bash
npm run test:demo
```

Seven tests against [saucedemo.com](https://www.saucedemo.com), no credentials needed. If this
is green, your Node, browser and config are all fine, and anything that breaks later is yours.

Useful next:

```bash
npm run test:ui          # interactive mode — the fastest way to learn the suite
npm run report:allure    # generate and serve the Allure report
```

## 4. Point it at your application

```bash
cp .env.example .env.staging
```

Fill in the three that matter:

```
BASE_URL=https://staging.example.com
E2E_USERNAME=your-test-account
E2E_PASSWORD=...
```

Then:

```bash
npm run check:reachability   # TCP probe — confirms you can reach it at all
TEST_ENV=staging npx playwright test --list
```

### Replace the example code

The framework depends on exactly one page object: `LoginPage`. `globalSetup` drives it once per
account to produce the saved session every test starts from.

1. **Rewrite `src/pages/LoginPage.ts`** for your login form. Keep `loginAndWaitForApp()` waiting
   on something that proves the app has *rendered*, not just that the URL changed — a
   client-rendered app changes the URL before it has painted, and the session can be captured
   mid-boot.
2. **Delete the example page objects and specs** (`InventoryPage`, `CartPage`, `CheckoutPage`,
   and `src/tests/auth|catalog|checkout/`), or keep one as a reference while you write the first
   real spec.
3. **Scaffold your first feature:**
   ```bash
   cp templates/page-object.template.ts src/pages/OrdersPage.ts
   cp templates/spec.template.ts src/tests/orders/orders.spec.ts
   ```
4. **Set the write-environment policy** — `E2E_WRITE_ENVS` in `.env.<TEST_ENV>`, or leave the
   default (`demo,local,dev,qa,staging`). Any environment not in that list runs `@smoke` only.
   Keep production out of it.

If your app has no login, set `E2E_SKIP_AUTH=1` and every test starts from an empty session.

## 5. Parallelism

Workers default to 1. The limit is accounts, not CPU cores: the same user logged in twice gets
session-kicked by most apps. Add a complete extra pair and you get a second worker:

```
E2E_USERNAME_2=second-account
E2E_PASSWORD_2=...
```

Slots must be contiguous (`_2`, then `_3`, up to `_8`). A half-filled slot throws at
`validateConfig` rather than silently costing you a worker. Cap with `E2E_WORKERS=N`.

## 6. Optional: the publishing pipeline

Only needed if you publish evidence to Jira, Confluence, Zephyr or Teams. Fill `.env.publish`
and the ids in `publish.config.json` — see [`PUBLISHING.md`](PUBLISHING.md).

## 7. Optional: the agent workflow

`.claude/` and `.cursor/` are mirrors, so Cursor and Claude Code run the same pipeline. Open the
repo in either and use `/e2e-ticket <KEY>`. After editing one side, run `npm run sync:ai` and
`npm run sync:ai:check`.

## Daily commands

```bash
npm run test:staging                 # the suite
TICKET=PROJ-123 npm run test:staging # one ticket's tag
npm run test:headed                  # watch it
npm run test:debug                   # step through it
npm run typecheck && npm run lint    # before committing
```

## Pre-commit

Husky runs a secret scanner on staged files, plus lint-staged (ESLint + Prettier). If it seems
not to run, re-run `npm install` — `core.hooksPath` needs to be `.husky`.

Never commit `.env.*` or `.env.publish`. They are gitignored; the scanner is the second line of
defence, not the first.
