import dotenv from "dotenv";
import path from "path";

import type { E2ECredentials, E2EEnvironment } from "../types";

/**
 * env.ts — one place that answers "which environment am I on, what may I do
 * there, and with whose credentials".
 *
 * `TEST_ENV` selects a gitignored `.env.<TEST_ENV>` file. Values already in
 * `process.env` (CI secrets) always win over the file, so the same code runs
 * locally and on a runner with no env files at all.
 */

/**
 * Environments where write/destructive flows (create / edit / delete) may run.
 * Everything else is forced to read-only `@smoke` tests by the grep guard in
 * `playwright.config.ts`.
 *
 * Override per project with `E2E_WRITE_ENVS` (comma-separated) — keep
 * production out of it unless you genuinely test against disposable prod data.
 */
export const WRITE_ENVS: string[] = (
	process.env.E2E_WRITE_ENVS ?? "demo,local,dev,qa,staging"
)
	.split(",")
	.map((e) => e.trim())
	.filter(Boolean);

export function currentTestEnv(): string {
	return process.env.TEST_ENV ?? "demo";
}

/**
 * Load `.env.<TEST_ENV>` into `process.env` (a no-op for vars already set, e.g.
 * CI secrets). Single source of truth for the dotenv path — used by both
 * `playwright.config.ts` and `src/tests/globalSetup.ts`.
 */
export function loadTestEnv(): string {
	const testEnv = currentTestEnv();
	dotenv.config({ path: path.resolve(__dirname, `../../.env.${testEnv}`) });
	return testEnv;
}

/**
 * Skip the UI login in globalSetup and start every test from an empty storage
 * state. Set `E2E_SKIP_AUTH=1` for suites that log in per-spec, or for an app
 * with no authentication at all.
 */
export function skipAuth(): boolean {
	return process.env.E2E_SKIP_AUTH === "1";
}

/** Max numbered extra accounts (`E2E_USERNAME_2` … `_8`). */
export const MAX_PARALLEL_ACCOUNTS = 8;

let boundWorkerIndex = 0;

/** Bind this worker process to an account slot (set by an auto fixture). */
export function bindWorkerIndex(index: number): void {
	boundWorkerIndex = Math.max(0, index);
}

export function currentWorkerIndex(): number {
	return boundWorkerIndex;
}

/**
 * Storage-state file for a worker. Index 0 stays `.auth/user.json` so codegen
 * and `E2E_REUSE_AUTH` keep working; extras are `.auth/user-1.json`, …
 */
export function workerStorageStatePath(index = currentWorkerIndex()): string {
	return index <= 0 ? ".auth/user.json" : `.auth/user-${index}.json`;
}

function numberedEnv(base: string, index: number): string {
	const key = index <= 0 ? base : `${base}_${index + 1}`;
	return (process.env[key] ?? "").trim();
}

/**
 * Complete credential pairs for `base` / `base_2` / `base_3` / … Stops at the
 * first gap, and throws if a slot has only the username or only the password —
 * a half-filled slot silently costs you a worker otherwise.
 */
export function countCredentialPairs(
	userBase: string,
	passBase: string,
): number {
	if (!numberedEnv(userBase, 0) || !numberedEnv(passBase, 0)) {
		assertNoDanglingExtra(userBase, passBase);
		return 0;
	}
	let n = 1;
	for (let index = 1; index < MAX_PARALLEL_ACCOUNTS; index++) {
		const username = numberedEnv(userBase, index);
		const password = numberedEnv(passBase, index);
		if (!username && !password) {
			assertNoDanglingExtra(userBase, passBase, index + 1);
			break;
		}
		if (!username || !password) {
			const slot = index + 1;
			throw new Error(
				`Incomplete extra account: set both ${userBase}_${slot} and ${passBase}_${slot}, or neither`,
			);
		}
		n += 1;
	}
	return n;
}

function assertNoDanglingExtra(
	userBase: string,
	passBase: string,
	fromSlot = 2,
): void {
	for (let slot = fromSlot; slot <= MAX_PARALLEL_ACCOUNTS; slot++) {
		const username = (process.env[`${userBase}_${slot}`] ?? "").trim();
		const password = (process.env[`${passBase}_${slot}`] ?? "").trim();
		if (username || password) {
			throw new Error(
				`Incomplete extra account: set both ${userBase}_${slot} and ${passBase}_${slot}, or neither (slots must be contiguous)`,
			);
		}
	}
}

function completePairCount(userBase: string, passBase: string): number {
	if (!numberedEnv(userBase, 0) || !numberedEnv(passBase, 0)) return 0;
	let n = 1;
	for (let index = 1; index < MAX_PARALLEL_ACCOUNTS; index++) {
		if (!numberedEnv(userBase, index) || !numberedEnv(passBase, index)) break;
		n += 1;
	}
	return n;
}

/**
 * How many distinct accounts this run has. The same user logged in twice is
 * session-kicked by most apps, so this — not CPU count — is the worker ceiling.
 */
export function workerAccountCount(): number {
	return Math.max(1, countCredentialPairs("E2E_USERNAME", "E2E_PASSWORD"));
}

export function workerAccountIndex(parallelIndex: number): number {
	const n = workerAccountCount();
	return n > 0 ? parallelIndex % n : 0;
}

/**
 * Playwright `workers`. Headed stays 1 (you can only watch one). Otherwise one
 * worker per complete account slot, capped by `E2E_WORKERS`.
 */
export function playwrightWorkerCount(isHeaded: boolean): number {
	if (isHeaded) return 1;
	const accounts = workerAccountCount();
	const raw = (process.env.E2E_WORKERS ?? "").trim();
	if (raw) {
		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed >= 1) {
			return Math.min(Math.floor(parsed), accounts);
		}
	}
	return accounts;
}

function pairAt(
	userBase: string,
	passBase: string,
	index: number,
): E2ECredentials {
	const n = completePairCount(userBase, passBase);
	const slot = n > 0 ? index % n : 0;
	return {
		username: numberedEnv(userBase, slot),
		password: numberedEnv(passBase, slot),
	};
}

/**
 * Fail immediately when required env is missing, instead of dying later inside
 * login or `page.goto`. Called from globalSetup, so the message arrives before
 * a browser is ever launched.
 */
export function validateConfig(): void {
	const errors: string[] = [];
	const testEnv = currentTestEnv();

	if (!(process.env.BASE_URL ?? "").trim()) {
		errors.push(`BASE_URL is required in .env.${testEnv}`);
	}

	if (!skipAuth()) {
		if (!(process.env.E2E_USERNAME ?? "").trim()) {
			errors.push(`E2E_USERNAME is required in .env.${testEnv}`);
		}
		if (!(process.env.E2E_PASSWORD ?? "").trim()) {
			errors.push(`E2E_PASSWORD is required in .env.${testEnv}`);
		}
	}

	try {
		workerAccountCount();
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}

	if (errors.length > 0) {
		throw new Error(
			`[validateConfig] Missing required env:\n${errors
				.map((e) => `  - ${e}`)
				.join("\n")}`,
		);
	}
}

/** Playwright `baseURL` / navigation origin. */
export function playwrightBaseURL(): string {
	const raw = (process.env.BASE_URL ?? "http://localhost:3000").trim();
	try {
		const withScheme = raw.includes("://") ? raw : `https://${raw}`;
		return new URL(withScheme).origin;
	} catch {
		return raw;
	}
}

/** API origin for prerequisite data setup. Defaults to the app origin. */
export function apiBaseURL(): string {
	const raw = (process.env.API_BASE_URL ?? "").trim();
	if (!raw) return playwrightBaseURL();
	const withScheme = raw.includes("://") ? raw : `https://${raw}`;
	return new URL(withScheme).origin;
}

/**
 * May this run create, edit or delete data? `E2E_ALLOW_WRITES=true` is the
 * deliberate, local-only escape hatch for an env that is normally read-only —
 * never set it on a shared pipeline.
 */
export function isWriteEnv(testEnv = currentTestEnv()): boolean {
	if (WRITE_ENVS.includes(testEnv)) return true;
	return process.env.E2E_ALLOW_WRITES === "true" && !process.env.CI;
}

export function credentials(index = currentWorkerIndex()): E2ECredentials {
	return pairAt("E2E_USERNAME", "E2E_PASSWORD", index);
}

/**
 * The tenant / organisation / workspace the specs operate inside, when the app
 * has one. Read from `E2E_TENANT_NAME` — never hardcode it in a spec, or the
 * suite only runs on the machine it was written on.
 */
export function tenantName(): string {
	return (process.env.E2E_TENANT_NAME ?? "").trim();
}

export function environment(): E2EEnvironment {
	return {
		baseURL: playwrightBaseURL(),
		apiBaseURL: apiBaseURL(),
		tenantName: tenantName() || undefined,
	};
}
