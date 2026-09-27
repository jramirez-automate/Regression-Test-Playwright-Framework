import { test as base, expect, type APIRequestContext } from "@playwright/test";

import { apiContext } from "./utils/api";
import { assertEnvironmentReachable } from "./utils/environment-guard";
import {
	bindWorkerIndex,
	workerAccountIndex,
	workerStorageStatePath,
} from "./utils/env";

/**
 * The wrapped `test` every spec imports — never `@playwright/test` directly.
 *
 * Two things happen here that a spec should never have to think about:
 *
 *   1. Each worker is bound to its own account slot and storage-state file, so
 *      adding `E2E_USERNAME_2` is all it takes to double the parallelism.
 *   2. An auto fixture TCP-probes the environment before every test. Without it,
 *      a dropped VPN turns into thirty minutes of locator timeouts and a
 *      failure report that blames your selectors.
 *
 * API specs get `api` (this environment's auth) and `anonApi` (no credentials),
 * both disposed after the test — see `src/utils/api.ts`.
 *
 * Keeping this in one wrapper is also what makes a cross-cutting change — a new
 * fixture, a trace hook, a tag-based skip — a one-file edit rather than a sweep
 * through every spec.
 */
type TestFixtures = {
	_envGuard: void;
	/** API client for `API_BASE_URL` with this environment's auth. */
	api: APIRequestContext;
	/** API client with no credentials, for 401 checks and public endpoints. */
	anonApi: APIRequestContext;
};

export const test = base.extend<TestFixtures, { _workerAccount: void }>({
	_workerAccount: [
		async ({}, use, workerInfo) => {
			bindWorkerIndex(workerAccountIndex(workerInfo.parallelIndex));
			await use();
		},
		{ scope: "worker", auto: true },
	],
	storageState: async ({}, use, testInfo) => {
		await use(
			workerStorageStatePath(workerAccountIndex(testInfo.parallelIndex)),
		);
	},
	_envGuard: [
		async ({}, use) => {
			await assertEnvironmentReachable();
			await use();
		},
		{ auto: true },
	],
	// `page` depends on `_envGuard` so a dead environment fails in ~3s, before
	// the first `goto` timeout rather than after it.
	page: async ({ page, _envGuard }, use) => {
		void _envGuard;
		await use(page);
	},
	api: async ({}, use, testInfo) => {
		const context = await apiContext({
			storageState: workerStorageStatePath(
				workerAccountIndex(testInfo.parallelIndex),
			),
		});
		await use(context);
		await context.dispose();
	},
	anonApi: async ({}, use) => {
		const context = await apiContext({ auth: "none" });
		await use(context);
		await context.dispose();
	},
});

export { expect };
export type { APIRequestContext, APIResponse } from "@playwright/test";
