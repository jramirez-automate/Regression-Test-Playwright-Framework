import { defineConfig, devices } from "@playwright/test";
import {
	loadTestEnv,
	isWriteEnv,
	playwrightBaseURL,
	playwrightWorkerCount,
} from "./src/utils/env";
import { allureReporterOptions } from "./src/utils/allure-config";

// ─── Environment loading ───────────────────────────────────────────────────────
//
//   TEST_ENV=demo     → .env.demo     (default — the public demo app)
//   TEST_ENV=local    → .env.local
//   TEST_ENV=dev|qa   → .env.dev / .env.qa
//   TEST_ENV=staging  → .env.staging
//   TEST_ENV=prod     → read-only @smoke
//
// Pass HEADED=true to watch tests run in a visible browser window.
// In CI, BASE_URL / E2E_USERNAME / E2E_PASSWORD come from Actions secrets.

const testEnv = loadTestEnv();
const baseURL = playwrightBaseURL();

// ─── Data-safety guard ─────────────────────────────────────────────────────────
// A read-only env runs ONLY tests tagged @smoke. This is the single mechanism
// stopping a create/delete spec from running against production, so it lives in
// the config where a spec cannot opt out of it.
const readOnly = !isWriteEnv(testEnv);

// ─── Ticket filter ─────────────────────────────────────────────────────────────
// TICKET=PROJ-123 runs only the describes tagged @PROJ-123. Traceability is a
// tag, never a folder — specs are organised by feature so they stay findable
// after the ticket is closed.
const ticket = process.env.TICKET;
const grepParts = [
	...(readOnly ? ["(?=.*@smoke)"] : []),
	...(ticket ? [`(?=.*@${ticket}\\b)`] : []),
];
const grep = grepParts.length ? new RegExp(grepParts.join("")) : undefined;

const isHeaded = process.env.HEADED === "true";
const wantEvidence = process.env.EVIDENCE === "true";

// Allure is the run report (statuses, retries, trend, defect triage). It is on
// by default so every run contributes to the trend — ALLURE=false for a run you
// do not want recorded.
const wantAllure = process.env.ALLURE !== "false";

const evidenceRoot = ticket ? `src/evidence/${ticket}` : "src/evidence";
const outputDir = wantEvidence
	? `${evidenceRoot}/artifacts`
	: "src/test-results";

export default defineConfig({
	testDir: "./src/tests",

	globalSetup: "./src/tests/globalSetup.ts",
	globalTeardown: "./src/tests/globalTeardown.ts",

	grep,

	timeout: 90_000,

	globalTimeout:
		process.env.PW_GLOBAL_TIMEOUT_MS !== undefined
			? Number(process.env.PW_GLOBAL_TIMEOUT_MS)
			: 30 * 60_000,

	fullyParallel: !isHeaded,

	forbidOnly: !!process.env.CI,

	retries: process.env.CI ? 2 : 1,

	// One worker per complete account slot in .env.<TEST_ENV> (`E2E_USERNAME_2`,
	// …). Stays 1 when only the primary pair is set — the same user in two
	// browsers session-kicks itself in most apps. Headed stays 1.
	// Cap with E2E_WORKERS=N (it cannot exceed the account count).
	workers: playwrightWorkerCount(isHeaded),

	outputDir,

	reporter: [
		[
			"html",
			{
				outputFolder: wantEvidence
					? `${evidenceRoot}/report`
					: "playwright-report",
				open: "never",
			},
		],
		["list"],
		...(wantEvidence
			? ([
					["./evidence-reporter.ts", { outputDir: evidenceRoot, env: testEnv }],
				] as [string, { outputDir: string; env: string }][])
			: []),
		...(wantAllure
			? ([["allure-playwright", allureReporterOptions(testEnv)]] as [
					string,
					Record<string, unknown>,
				][])
			: []),
		...(process.env.PW_JSON_OUTPUT
			? ([["json", { outputFile: process.env.PW_JSON_OUTPUT }]] as [
					string,
					{ outputFile: string },
				][])
			: []),
		...(process.env.PW_PROGRESS_FILE
			? ([["./progress-reporter.ts"]] as [string][])
			: []),
	],

	use: {
		baseURL,

		headless: !isHeaded,

		launchOptions: {
			slowMo: isHeaded ? 500 : 0,
		},

		trace: wantEvidence ? "on" : "on-first-retry",
		screenshot: wantEvidence ? "on" : "only-on-failure",

		// Playwright's default video size shrinks the viewport into an 800x800 box
		// (800x450 here), too coarse to read field-level validation text in a
		// recording. 720p keeps the 16:9 ratio so nothing is letterboxed, at
		// roughly 3x the file size — worth it when the video IS the evidence.
		video:
			wantEvidence || isHeaded
				? { mode: "on", size: { width: 1280, height: 720 } }
				: "on-first-retry",

		// Playwright's default action timeout is 0 — wait forever. A click on a
		// locator that matches nothing then hangs until the whole run is killed,
		// instead of failing that one test. Headed runs get longer because slowMo
		// inflates every action.
		actionTimeout: isHeaded ? 60_000 : 30_000,
	},

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1920, height: 1080 },
				storageState: ".auth/user.json",
			},
		},
	],
});
