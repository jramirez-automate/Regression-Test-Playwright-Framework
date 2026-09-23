#!/usr/bin/env node
/**
 * Open Playwright codegen against the app under test, already signed in.
 *
 *   npm run test:codegen
 *   TEST_ENV=staging npm run test:codegen
 *   npm run test:codegen -- /orders/new        # start on a deep link
 *
 * A wrapper rather than a bare `playwright codegen` line in package.json, for
 * two reasons: the URL has to come from `.env.<TEST_ENV>`, which npm scripts do
 * not read, and `--load-storage` must only be passed when the session file
 * actually exists — pointing it at a missing file fails outright instead of
 * falling back to a signed-out context.
 *
 * Codegen is a selector-DISCOVERY tool, not a spec generator. Take the roles
 * and accessible names it reveals, then hand-write the page object. Its raw
 * output inlines locators into one linear script, which is precisely the shape
 * this suite exists to avoid.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testEnv = process.env.TEST_ENV ?? "demo";

dotenv.config({ path: path.join(root, `.env.${testEnv}`) });

const baseUrl = (process.env.BASE_URL ?? "").trim();
if (!baseUrl) {
	console.error(
		`✖ BASE_URL is not set for TEST_ENV=${testEnv}.\n` +
			`  Create .env.${testEnv} (copy .env.example), or export BASE_URL in this shell.`,
	);
	process.exit(1);
}

// An argument after `--` is a path to open, so codegen can start on the screen
// under test rather than on the login page.
const target = process.argv[2] ? new URL(process.argv[2], baseUrl).toString() : baseUrl;

const storageState = path.join(root, ".auth", "user.json");
const hasSession = fs.existsSync(storageState) && fs.statSync(storageState).size > 0;
if (!hasSession) {
	console.warn(
		"[codegen] No .auth/user.json yet — opening signed out.\n" +
			"          Run any test once (globalSetup writes the session), then re-run for an authenticated window.",
	);
}

console.log(`[codegen] ${testEnv} → ${target}${hasSession ? " (signed in)" : ""}`);

const result = spawnSync(
	path.join(root, "node_modules/.bin/playwright"),
	["codegen", ...(hasSession ? [`--load-storage=${storageState}`] : []), target],
	{ cwd: root, stdio: "inherit" },
);

process.exit(result.status ?? 0);
