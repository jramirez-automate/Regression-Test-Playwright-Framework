# Issue tracker: Jira, read by hand

Tickets live in the Jira site named in `publish.config.json` (`jira.baseUrl`), with
credentials in `.env.publish`. No skill or agent here reads the tracker: the user
pastes a ticket's acceptance criteria into the chat.

## When a skill says "fetch the relevant ticket"

The ticket key is the spec's tag (`{ tag: "@ABC-123" }`) or the key in the
branch name. Its spec, in order:

1. `src/evidence/<KEY>/zephyr-spec.json` — the planned TC rows drafted from the
   seam table (`templates/zephyr-spec.json` shows the shape).
2. `src/evidence/<KEY>/flow-map.md` and `tdd-log.md`, when the ticket was explored.
3. The acceptance criteria the user pasted in this conversation.
4. None exists: ask the user to paste the criteria.

## When a skill says "publish to the issue tracker"

Results go through the `evidence:*` scripts, from a curated `comment-rows.json`
(`evidence:attach -- --from-rows`, then `evidence:comment`); Zephyr cases through
`npm run zephyr`; bugs through the `bug-reporting` skill. Nothing else writes to
the tracker.

## Standards for the Standards axis

`AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/e2e-conventions.mdc`.
