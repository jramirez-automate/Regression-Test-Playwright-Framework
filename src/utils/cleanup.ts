import type { Page } from "@playwright/test";

type CleanupTask = (page: Page) => Promise<unknown>;

/**
 * LIFO registry of best-effort cleanup tasks for data a spec creates.
 *
 * Register a task right after queuing a create, then run the registry in
 * `test.afterEach`. Last-in-first-out, so dependents are removed before the
 * things they depend on (a child record before its parent).
 *
 * Every task is swallowed on error — cleanup must never fail the test run, and
 * a teardown that throws hides the real assertion failure that preceded it.
 */
export class CleanupRegistry {
	private tasks: CleanupTask[] = [];

	add(task: CleanupTask): void {
		this.tasks.push(task);
	}

	async run(page: Page): Promise<void> {
		while (this.tasks.length) {
			const task = this.tasks.pop() as CleanupTask;
			await task(page).catch(() => undefined);
		}
	}
}
