---
description: Run a ticket end to end — explore, plan test cases, write specs TDD-style, run to green, capture and publish evidence.
argument-hint: <TICKET-KEY> [feature area]
---

Run ticket **$1** end to end. Feature area: **$2** (infer it from the ticket when omitted).

Follow `CLAUDE.md` throughout. Keep this conversation small: dispatch the heavy steps to
subagents and relay only their verdict lines.

## 1. Understand the ticket

Fetch the ticket and restate, in your own words:

- The acceptance criteria, numbered.
- What is explicitly out of scope.
- Which environment it must be verified on.

If the criteria are ambiguous or untestable as written, say so now. A criterion you cannot
observe is a criterion you cannot automate, and discovering that after the specs are written
costs the whole slice.

## 2. Explore

Dispatch **e2e-explorer** with the feature and criteria. It returns a compact flow map — routes,
selectors, waits, reusable page objects and helpers. Save it to
`src/evidence/$1/flow-map.md`.

Do NOT read app source yourself in this conversation. That is the whole point of the subagent.

## 3. Seam table, then test cases

Present a seam table for review — one row per criterion:

| TC | Criterion | Seam (page object) | Money assertion | Expected first run |
| --- | --- | --- | --- | --- |

TC ids are `TC-001`, `TC-002`, … Wait for the user to confirm the table before going further:
this is the design, and it is far cheaper to change here than after the specs exist.

Then create the Zephyr cases in **planned** mode (`Not Executed`), from the seam table —
**before any spec is written**:

```
cp templates/zephyr-spec.json src/evidence/$1/zephyr-spec.json
TICKET=$1 npm run zephyr -- create --spec src/evidence/$1/zephyr-spec.json --dry-run
```

Steps are numbered user actions; the expected result goes on the last step only; no framework
internals. Only run it for real once the user approves, and only if the project uses Zephyr.

## 4. Write the specs (TDD, one slice at a time)

For each row of the seam table, in order:

1. Write ONE test. Scaffold from `templates/spec.template.ts`; the describe carries
   `{ tag: "@$1" }`.
2. Run it alone: `npx playwright test <file> -g "<title>"`.
3. Prove the red: it must fail at the **money assertion**, because the behaviour is genuinely
   absent. Setup and selector failures do not count. If it passes first time, do the sensitivity
   check — mutate the assertion to something obviously wrong, confirm it fails *there*, revert
   byte-exactly, verify with `git diff`.
4. Drive it green. Dispatch **e2e-runner** when triage gets long.
5. Record the slice in `src/evidence/$1/tdd-log.md`.

Never write the next test until the current one is green. Never batch-write the file.

## 5. Run the full ticket

```
TICKET=$1 TEST_ENV=<env> npx playwright test
```

**Ask before** any beta, pre-production or production environment, and wait for an explicit yes
for that specific environment.

## 6. Evidence

Dispatch **e2e-evidence**. It captures, verifies every artifact against its criterion, writes
`SUMMARY.md`, prepares `comment-rows.json`, and attaches curated media.

If a run exposed a product defect, **embed the proving screenshot in your reply to the user**
(`![what it shows](/abs/path.png)`) in the same message that reports it.

Post the Jira comment and publish the Confluence test plan only with explicit confirmation.

## 7. Record the executions

```
TICKET=$1 npm run zephyr -- mark-pass
```

## 8. Persist what you learned

- Append the ticket's row to `COVERAGE.md` — including any criterion that could **not** be
  automated, and why.
- Add every `NEW NAV FACT` to the Navigation index and every `NEW HELPER` to the Helpers index
  in `docs/APP-MAP.md`. Expensive navigation and reusable interactions get recorded once, never
  rebuilt.
- Run `npm run typecheck && npm run lint`.

## Report

Close with: criteria covered, specs added, environments verified, findings raised, what was
published, and anything still outstanding.
