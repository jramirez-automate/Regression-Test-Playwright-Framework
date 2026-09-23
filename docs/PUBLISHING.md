# Publishing pipeline

How a green run becomes an acceptance record that somebody can sign off.

Everything here is driven by two files:

| File | Holds | Committed? |
| --- | --- | --- |
| `publish.config.json` | Jira site, Confluence space and parent ids, Zephyr folder names, Teams gate | **Yes** — ids and names, no secrets |
| `.env.publish` | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `ZEPHYR_API_TOKEN`, `TEAMS_WEBHOOK_URL` | **No** — gitignored |

No project key, space id or ticket prefix is hardcoded in a script body. That is what lets the
same pipeline move between products.

## One-time setup

1. **Jira / Confluence token** — https://id.atlassian.com/manage-profile/security/api-tokens.
   Put it in `.env.publish` as `JIRA_API_TOKEN`, with `JIRA_EMAIL` and `JIRA_BASE_URL`.
2. **Zephyr Scale token** — Jira → Apps → Zephyr Scale → API keys → `ZEPHYR_API_TOKEN`.
3. **Confluence ids** — open the target space and parent page/folder, and read `spaceId` /
   `parentId` from the page URL or `…/wiki/api/v2/pages?title=…`. Fill them into
   `publish.config.json` → `confluence.targets.default`.
4. **Zephyr folders** — create the `rootFolder` (default `Regression`) at the top level of the
   project, for both `TEST_CASE` and `TEST_CYCLE`, plus a cycle folder per environment
   (`STAGING`, `PRODUCTION`). The scripts create the per-ticket folder underneath.
5. **Teams** (optional) — a Power Automate HTTP trigger or incoming webhook URL as
   `TEAMS_WEBHOOK_URL`.

Add more Confluence destinations by adding entries under `confluence.targets` and selecting one
with `--target=<name>`. Space and folder ids move every release cycle in most organisations, so
`CONFLUENCE_PARENT_ID` and `CONFLUENCE_SPACE_ID` override at run time rather than by editing a
committed file.

## The order of operations

```bash
# 1. PLAN — Zephyr cases from the seam table, BEFORE any spec is written
cp templates/zephyr-spec.json src/evidence/PROJ-123/zephyr-spec.json
TICKET=PROJ-123 npm run zephyr -- create --spec src/evidence/PROJ-123/zephyr-spec.json --dry-run
TICKET=PROJ-123 npm run zephyr -- create --spec src/evidence/PROJ-123/zephyr-spec.json

# 2. CAPTURE — after the specs are green
TICKET=PROJ-123 npm run test:evidence

# 3. CURATE — describe what proves what
cp templates/comment-rows.example.json src/evidence/PROJ-123/comment-rows.json

# 4. ATTACH — only the media that comment references
TICKET=PROJ-123 npm run evidence:attach -- --dry-run --from-rows src/evidence/PROJ-123/comment-rows.json
TICKET=PROJ-123 npm run evidence:attach -- --from-rows src/evidence/PROJ-123/comment-rows.json

# 5. COMMENT — TC table with inline thumbnails and playable video
TICKET=PROJ-123 npm run evidence:comment -- --rows src/evidence/PROJ-123/comment-rows.json --dry-run
TICKET=PROJ-123 npm run evidence:comment -- --rows src/evidence/PROJ-123/comment-rows.json

# 6. TEST PLAN — Confluence page with the full TC table + embedded media
cp templates/test-plan.html src/evidence/PROJ-123/test-plan.html
TICKET=PROJ-123 npm run publish:test-plan

# 7. RECORD — Zephyr executions against the planned cases
TICKET=PROJ-123 npm run zephyr -- mark-pass

# 8. OPTIONAL — notify, then tidy
TICKET=PROJ-123 ENV=prod npm run notify:teams
TICKET=PROJ-123 npm run evidence:cleanup
```

Every script takes `--dry-run`. Use it — the publishing steps write to shared systems where an
undo is manual.

## Why the pieces are shaped the way they are

**Zephyr cases come first.** The seam table is the design artifact; the Playwright specs and the
Zephyr cases are two renderings of it. Creating the cases *from* the finished code inverts the
relationship and produces steps that read like a stack trace, which a manual tester cannot
follow next release. Cases are created as `Not Executed`; `mark-pass` records results later, as
new executions rather than mutations, so the planned state survives as proof the cases predated
the run.

**Attach is curated, not a dump.** A capture folder also holds unused environment runs, extra
subject screenshots and traces. `--from-rows` uploads exactly what the comment references; a
full dump buries the three files a reviewer actually needs.

**Comments are ADF, not markdown.** A markdown comment can only produce *links* to attachments.
Real inline thumbnails and playable video need ADF `media` nodes carrying each attachment's
media-services UUID — which is only discoverable from the attachment content endpoint's 303
redirect. That is the whole reason `scripts/lib/jira.mjs` exists.

**The comment has a hard size limit.** Jira rejects a comment over 32,767 characters and
measures that against the whole ADF JSON, not the visible text. A TC row with steps, a
screenshot and a video costs about 1,700, so roughly 17 rows fit. `post-evidence-comment.mjs`
prints the arithmetic and refuses to post, rather than handing you an opaque HTTP 400 after a
long upload. When you are over: split into parts, drop an evidence column that carries only a
note, or move `steps` into the linked Zephyr case.

**The test plan is published in two passes.** Attachments can only be uploaded to a page that
already exists, and the body references them by filename — so publishing the body first would
render every embed as a broken attachment until the next run. The script creates a stub, uploads,
re-reads the version, then writes the real body.

**Cleanup refuses to run blind.** If no media UUIDs or attachment links are found in any comment
and `--from-rows` was not passed, `evidence:cleanup` deletes nothing. Running it before the
evidence comment exists would otherwise wipe the ticket clean.

## Conventions that other people depend on

- **TC ids are `TC-001`, `TC-002`, …** — zero-padded hyphen form, never `TC1`. The same ids appear
  in the Jira comment, the Confluence table and the Zephyr cases, and bugs cite them. Publish in
  TC order. **Never renumber to close a gap** — say why the gap exists instead.
- **Link labels read `[TICKET] <Summary>`**, plus `- Test Plan` or `- Test Cycle` when the target
  is one. Never a bare key or a generic "Zephyr link".
- **Evidence must show its subject.** A screenshot of a blank page or the wrong scroll position is
  invalid, even when the test passed — it is worse than no media, because it looks like proof.
- **A raised bug carries its own proof.** Copy the `*-FAILED.*` files into
  `src/evidence/<BUG-KEY>/`, write a minimal `comment-rows.json`, attach, then
  `npm run evidence:embed` so the media renders inline in the description. Nobody should have to
  open the Attachments tab to judge a bug.
- **Bug descriptions open with an Environment block** — the exact repro URL (from `page.url()` at
  failure, not the site root) and the Chromium build actually used (`npx playwright --version`).

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `"x.png" is not attached` | Run `evidence:attach` first — the comment resolves UUIDs from attachments |
| `Comment is N chars over Jira's limit` | Split the rows file; see the size note above |
| Confluence embeds render as broken attachments | The filename in `test-plan.html` does not match a file in `src/evidence/<TICKET>/`, or it was excluded by the target's `evidencePattern` |
| `Confluence target has a placeholder spaceId` | Fill `publish.config.json`, or set `CONFLUENCE_SPACE_ID` |
| `Zephyr folder "Regression" not found` | Create it at the top level of the project for both folder types |
| `evidence:cleanup` says "skipped" | No comment references any media yet — post the evidence comment first, or pass `--from-rows` |
| Teams says `ENV does not cover the required env(s)` | The gate in `publish.config.json` → `teams.requiredEnvs` is not satisfied |
| Stale screenshots remain on a Confluence page after a rename | `npm run publish:prune-attachments` — the publisher only ever adds |
