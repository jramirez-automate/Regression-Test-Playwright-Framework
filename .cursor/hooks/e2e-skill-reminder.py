#!/usr/bin/env python3
"""Prompt hook: when the prompt looks like e2e work, inject an instruction
to load the e2e-testing-patterns skill before touching specs.

Used by Claude Code (`UserPromptSubmit` in `.claude/settings.json`) and Cursor
(`beforeSubmitPrompt` in `.cursor/hooks.json`). Stdin JSON shape differs;
this script reads a prompt from common keys and emits both output shapes.
"""
import json
import re
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

prompt = (
    data.get("prompt")
    or data.get("content")
    or data.get("user_prompt")
    or ""
)
if isinstance(prompt, dict):
    prompt = prompt.get("text") or ""

E2E_PATTERN = re.compile(
    r"(\be2e\b|/e2e-ticket|/full-regress|playwright|\.spec\.ts\b|page object|src/tests/)",
    re.IGNORECASE,
)

if not E2E_PATTERN.search(prompt):
    sys.exit(0)

msg = (
    "E2E work detected. If not already loaded in this session, "
    "load the e2e-testing-patterns skill BEFORE writing or editing any "
    "Playwright spec or page object, follow the rulebook in "
    "CLAUDE.md and AGENTS.md, and consult the app knowledge base "
    "docs/APP-MAP.md."
)

print(
    json.dumps(
        {
            "additional_context": msg,
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": msg,
            },
        }
    )
)
