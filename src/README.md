# `src/` — the product layer

This is the part you rewrite for your own application. Tooling stays at the repo root.

**Before you add anything:**

1. Check `docs/APP-MAP.md` → **Navigation index** — the route may already be recorded.
2. Check `docs/APP-MAP.md` → **Helpers index** and `src/utils/interactions.ts` — the widget may
   already have a driver.
3. Scaffold from `templates/`, do not write from scratch.

**Three rules that are not negotiable:**

- Import `test` / `expect` from `src/fixtures.ts`, never `@playwright/test`.
- Raw locators live in `src/pages/`, never in a spec.
- Anything a spec creates is named with `e2eName()` and deleted in `afterEach`.

Full map: [`../docs/SRC_STRUCTURE.md`](../docs/SRC_STRUCTURE.md).
Conventions: [`../CLAUDE.md`](../CLAUDE.md).
