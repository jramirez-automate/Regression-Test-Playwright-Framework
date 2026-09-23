# AI tooling — `.claude/` ↔ `.cursor/`

These two directories are **mirrors**, so Cursor and Claude Code run the same pipeline against
the same rules. Edit one side, then sync:

```bash
npm run sync:ai                  # .claude → .cursor
npm run sync:ai -- --from=cursor # .cursor → .claude
npm run sync:ai:check            # exit 2 if any pair differs
```

Mirrored: `agents/`, `commands/`, `skills/`, `rules/`, `hooks/`, and this README.
**Not** mirrored (platform-specific): `.claude/settings.json`, `.claude/settings.local.json`,
`.cursor/hooks.json`, `.cursor/mcp.json`.

## What is here

| Path | Purpose |
| --- | --- |
| `agents/e2e-explorer.md` | Read-only app exploration → a compact selector/flow map |
| `agents/e2e-runner.md` | Run, triage, fix, loop until green — reports a verdict, not output |
| `agents/e2e-evidence.md` | Capture, verify against criteria, publish the acceptance record |
| `commands/e2e-ticket.md` | `/e2e-ticket <KEY>` — a ticket end to end |
| `rules/e2e-conventions.mdc` | The always-on conventions summary |
| `rules/env-run-approval.mdc` | Never run beta / production without explicit approval |
| `rules/e2e-evidence-visibility.mdc` | Evidence must show its subject; show found bugs in the chat |
| `rules/e2e-zephyr-cases.mdc` | Test-management cases read as user actions, not specs |
| `skills/e2e-testing-patterns/` | Playwright patterns, flaky-test debugging |
| `skills/tdd/` | The red → green loop, seams, anti-patterns |
| `hooks/e2e-skill-reminder.py` | Nudges the e2e skill onto relevant prompts |

## Why subagents

Three of them exist for one reason: **context**. Reading app source, or a full Playwright run's
output, floods an orchestrating conversation and crowds out the thing it is actually tracking —
the acceptance criteria. Each subagent does the expensive reading in its own context and returns
a capped verdict (explorer ≤ 100 lines, runner ≤ 40, evidence ≤ 60).

The orchestrating session relays those verdict lines. It does not re-print them, and it does not
read app source itself.

## What is deliberately absent

- **Locator auto-healing.** TDD needs a real red, and evidence must show the real control.
- **Spec generation from test-management cases.** Cases are generated **from** the seam table,
  before the specs — not the other way around.
- **A `.cursorrules` file.** `AGENTS.md` and `CLAUDE.md` are the rulebooks.
