import { chromium, FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";

import { LoginPage } from "../pages";
import {
	loadTestEnv,
	validateConfig,
	credentials,
	environment,
	skipAuth,
	playwrightWorkerCount,
	workerStorageStatePath,
} from "../utils";
import { assertEnvironmentReachable } from "../utils/environment-guard";

/**
 * Runs once before any tests: validate config, prove the environment is up,
 * then log in ONCE per account and save the session.
 *
 * Logging in inside a page fixture instead would repeat the slowest, most
 * brittle flow in the suite for every test — and on an SSO provider it also
 * invites throttling. Storage state means a test starts already inside the app.
 */

/** Sequential logins with a gap: identity providers rate-limit rapid bursts. */
const LOGIN_GAP_MS = 2_000;

function authFileAbs(index: number): string {
	return path.join(__dirname, "../..", workerStorageStatePath(index));
}

function writeEmptyAuth(file: string): void {
	fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
}

async function globalSetup(_config: FullConfig) {
	loadTestEnv();
	validateConfig();
	await assertEnvironmentReachable();

	const { baseURL } = environment();
	const authDir = path.join(__dirname, "../../.auth");
	fs.mkdirSync(authDir, { recursive: true });

	const workerCount = playwrightWorkerCount(process.env.HEADED === "true");

	// An empty storage state is still written per worker: Playwright's project
	// config points at those files, and a missing one fails the run before any
	// test starts.
	if (skipAuth()) {
		console.log(
			`[globalSetup] E2E_SKIP_AUTH=1 — writing ${workerCount} empty storage state(s)`,
		);
		for (let i = 0; i < workerCount; i++) writeEmptyAuth(authFileAbs(i));
		return;
	}

	const authFiles = Array.from({ length: workerCount }, (_, i) =>
		authFileAbs(i),
	);

	if (
		process.env.E2E_REUSE_AUTH === "1" &&
		authFiles.every((file) => fs.existsSync(file) && fs.statSync(file).size > 0)
	) {
		console.log(
			`[globalSetup] E2E_REUSE_AUTH=1 — reusing ${workerCount} storage state(s)`,
		);
		return;
	}

	const browser = await chromium.launch();
	try {
		for (let i = 0; i < workerCount; i++) {
			if (i > 0)
				await new Promise((resolve) => setTimeout(resolve, LOGIN_GAP_MS));

			const { username, password } = credentials(i);
			const context = await browser.newContext({ baseURL });
			const page = await context.newPage();

			await new LoginPage(page).loginAndWaitForApp(username, password);

			const authFile = authFileAbs(i);
			await context.storageState({ path: authFile });
			await context.close();
			console.log(`[globalSetup] saved ${authFile} (${username})`);
		}
	} finally {
		await browser.close();
	}
}

export default globalSetup;
