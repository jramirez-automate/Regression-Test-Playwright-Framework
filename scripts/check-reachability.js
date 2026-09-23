#!/usr/bin/env node
/**
 * check-reachability.js — TCP preflight before spending CI minutes on a
 * Playwright run that can only ever time out.
 *
 * Same probe as `src/utils/environment-guard.ts`, but standalone so it can run
 * before `npx playwright test` — and before the browser install. An unreachable
 * environment then fails the job in seconds with an accurate message, instead of
 * burning the full suite timeout and reporting a wall of selector failures.
 *
 * Loads `.env.${TEST_ENV}` (default `demo`) so local runs work without exporting
 * anything. CI injects BASE_URL as a pipeline variable.
 *
 * Usage:
 *   node scripts/check-reachability.js
 *   TEST_ENV=staging node scripts/check-reachability.js
 *   REACHABILITY_TIMEOUT_MS=8000 node scripts/check-reachability.js
 */

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const { resolveHostPort, probeTcp } = require("./lib/tcp-probe");

const ROOT = path.resolve(__dirname, "..");
const TIMEOUT_MS = Number(process.env.REACHABILITY_TIMEOUT_MS) || 5000;

function loadEnvFile() {
	const testEnv = process.env.TEST_ENV || "demo";
	dotenv.config({ path: path.join(ROOT, `.env.${testEnv}`) });
}

function resolveProbeUrl() {
	return (
		(process.env.E2E_GUARD_URL || "").trim() ||
		(process.env.BASE_URL || "").trim() ||
		null
	);
}

async function main() {
	loadEnvFile();
	const baseUrl = resolveProbeUrl();
	if (!baseUrl) {
		console.log(
			"[check-reachability] No BASE_URL configured — skipping (validateConfig() reports this properly).",
		);
		return;
	}

	const target = resolveHostPort(baseUrl);
	if (!target) {
		console.log(`[check-reachability] Could not parse a host from "${baseUrl}" — skipping.`);
		return;
	}

	console.log(
		`[check-reachability] Probing ${target.host}:${target.port} (timeout ${TIMEOUT_MS}ms)...`,
	);
	try {
		await probeTcp(target.host, target.port, TIMEOUT_MS);
		console.log("[check-reachability] Reachable.");
	} catch (e) {
		console.error(`App unreachable: ${target.host}:${target.port} — ${e.message}`);
		console.error(
			"[check-reachability] No route to the target environment (VPN/network). " +
				"Failing fast here instead of letting every test time out. " +
				"Set SKIP_URL_CHECK=1 only when reachability cannot be checked by design.",
		);
		process.exit(1);
	}
}

main();
