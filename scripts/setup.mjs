#!/usr/bin/env node
/**
 * Idempotent, non-fatal onboarding provisioner.
 *
 * Runs on `npm install` / `npm ci` via "postinstall", and can be re-run with
 * `npm run setup`. Every step is guarded and the process ALWAYS exits 0 —
 * provisioning must never fail an install. Offline, or a tarball with no
 * `.git`, just prints a warning and moves on.
 *
 * What it does:
 *   1. Point git at the tracked hooks (`core.hooksPath .husky`).
 *   2. Ensure the Playwright Chromium browser is installed (skipped in CI).
 *   3. Scaffold the gitignored `.env.*` files from `.env.example` (empty — never secrets).
 *   4. Print the remaining manual steps.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isCI = process.env.CI === "true" || process.env.CI === "1";
const log = (m) => console.log(`[setup] ${m}`);
const warn = (m) => console.warn(`[setup] ${m}`);

function run(cmd, args, opts = {}) {
	return spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts }).status === 0;
}
function inGitRepo() {
	return (
		spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
			cwd: root,
			stdio: "ignore",
		}).status === 0
	);
}

// 1. Activate the tracked git hooks.
if (inGitRepo()) {
	if (run("git", ["config", "core.hooksPath", ".husky"])) log("git hooks path → .husky");
	else warn("could not set core.hooksPath (non-fatal)");
} else {
	warn("not a git checkout — skipping hooks path");
}

// 2. Playwright Chromium — idempotent, fast when already present.
if (isCI) {
	log("CI detected — skipping Playwright browser install (the workflow does it)");
} else {
	const pw = path.join(root, "node_modules/.bin/playwright");
	if (fs.existsSync(pw)) {
		log("ensuring Playwright chromium is installed…");
		if (!run(pw, ["install", "chromium"])) warn("playwright install chromium failed (non-fatal)");
	} else {
		warn("node_modules/.bin/playwright not found yet — it arrives with `npm ci`");
	}
}

// 3. Env scaffolding — create gitignored .env.* files if absent (templates, NEVER secrets).
function scaffold(name, contents) {
	const dst = path.join(root, name);
	if (fs.existsSync(dst)) return;
	try {
		fs.writeFileSync(dst, contents);
		log(`scaffolded ${name} — fill in your own values`);
	} catch {
		warn(`could not scaffold ${name}`);
	}
}

const examplePath = path.join(root, ".env.example");
if (fs.existsSync(examplePath)) {
	const template = fs.readFileSync(examplePath, "utf8");
	// .env.demo ships working values so a fresh clone can run green immediately.
	scaffold(".env.demo", template);
}
scaffold(
	".env.publish",
	[
		"# Publishing pipeline credentials (gitignored — use your own, never commit).",
		"# Jira / Confluence: https://id.atlassian.com/manage-profile/security/api-tokens",
		"JIRA_BASE_URL=",
		"JIRA_EMAIL=",
		"JIRA_API_TOKEN=",
		"# Zephyr Scale Cloud API token (Jira → Apps → Zephyr Scale → API keys)",
		"ZEPHYR_API_TOKEN=",
		"# Teams incoming webhook / Power Automate HTTP trigger URL",
		"TEAMS_WEBHOOK_URL=",
		"",
	].join("\n"),
);

// 4. Remaining manual steps.
console.log(
	[
		"",
		"[setup] Provisioning done. Remaining manual steps:",
		"  • .env.demo works as shipped — run `npm run test:demo` to see the suite green",
		"  • For your own app: cp .env.example .env.<env>, then set BASE_URL / E2E_USERNAME / E2E_PASSWORD",
		"  • Publishing (optional): fill .env.publish + publish.config.json ids",
		"  • Smoke check: npm run test:smoke",
		"",
	].join("\n"),
);

process.exit(0);
