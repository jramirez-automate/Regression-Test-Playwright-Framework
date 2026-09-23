/**
 * SPEC TEMPLATE — scaffold for a new spec.
 *
 * How to use:
 *   1. Copy to src/tests/<feature>/<name>.spec.ts. Organise by FEATURE domain,
 *      never by ticket number — a ticket folder is unreadable six months later,
 *      and the tag below already carries the traceability.
 *   2. Replace <Feature>, <capability>, <Kind>, @PROJ-XXX and every TODO.
 *   3. Follow the TDD loop: ONE test at a time, see it fail at the money
 *      assertion, drive it green, then write the next one.
 *
 * Reuse before you build:
 *   - Navigation:   docs/APP-MAP.md → Navigation index (how to reach the page)
 *   - Interactions: docs/APP-MAP.md → Helpers index + src/utils/interactions.ts
 *   - Seed data:    src/test-data/ — never hardcode a seed string in a spec
 */
import { test, expect } from "../../fixtures"; // never @playwright/test directly
// import { <Feature>Page } from "../../pages";
import {
	CleanupRegistry,
	e2eName,
	// waitForModalDetachedThenToast,
} from "../../utils";

test.describe("<Feature> — <capability>", { tag: "@PROJ-XXX" }, () => {
	const cleanup = new CleanupRegistry();

	test.afterEach(async ({ page }) => {
		await cleanup.run(page);
	});

	test("<states the criterion in user terms>", async ({ page }) => {
		// const feature = new <Feature>Page(page);
		const name = e2eName("<Kind>");

		await test.step("<user action>", async () => {
			// await feature.gotoList();
			// await feature.create(name);
			// Register teardown the moment the thing exists, not at the end:
			// a test that fails midway still has to clean up after itself.
			// cleanup.add(() => feature.deleteByName(name));
		});

		// THE MONEY ASSERTION — the observable outcome that encodes the
		// criterion. Expected values come from test inputs or the ticket, never
		// from reading back the same state you are asserting.
		// await expect(feature.row(name)).toBeVisible();
		expect(name).toContain("E2E-");
	});
});
