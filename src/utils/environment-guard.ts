/**
 * environment-guard.ts — fast reachability pre-check, run before every test.
 *
 * globalSetup validates required env and probes once before the run, but that
 * does not catch a VPN or network drop mid-suite: every remaining test would
 * grind through its full locator timeout before failing with a message that
 * blames a selector. `assertEnvironmentReachable()` is an auto fixture
 * (`_envGuard`) that TCP-probes the app host in ~3s and says what actually went
 * wrong. Success is cached for `ENV_GUARD_CACHE_MS`; failures are never cached.
 *
 * Opt out with `SKIP_URL_CHECK=1` (the same flag globalSetup honours).
 */

import { createRequire } from "module";

import { playwrightBaseURL } from "./env";

const { resolveHostPort, probeTcp } = createRequire(__filename)(
	"../../scripts/lib/tcp-probe.js",
) as {
	resolveHostPort: (rawUrl: string) => { host: string; port: number } | null;
	probeTcp: (host: string, port: number, timeoutMs: number) => Promise<void>;
};

const ENV_GUARD_CACHE_MS = 60_000;
const PROBE_TIMEOUT_MS = 3_000;

let lastHealthyAt = 0;
let consecutiveFailures = 0;

/** Resets to 0 on the next successful probe. */
export function consecutiveEnvironmentFailures(): number {
	return consecutiveFailures;
}

/** Origin to probe. Override with `E2E_GUARD_URL` when the app host is not `BASE_URL`. */
export function envGuardUrl(): string {
	const override = (process.env.E2E_GUARD_URL ?? "").trim();
	if (override) {
		try {
			const withScheme = override.includes("://")
				? override
				: `https://${override}`;
			return new URL(withScheme).origin;
		} catch {
			return override;
		}
	}
	return playwrightBaseURL();
}

/**
 * Throws if the app host:port is unreachable. A no-op when `SKIP_URL_CHECK=1`
 * or the URL is unparseable (reporting that is `validateConfig`'s job).
 */
export async function assertEnvironmentReachable(): Promise<void> {
	if (process.env.SKIP_URL_CHECK === "1") return;

	const baseUrl = envGuardUrl();
	if (!baseUrl) return;

	if (Date.now() - lastHealthyAt < ENV_GUARD_CACHE_MS) return;

	const target = resolveHostPort(baseUrl);
	if (!target) return;

	try {
		await probeTcp(target.host, target.port, PROBE_TIMEOUT_MS);
		lastHealthyAt = Date.now();
		consecutiveFailures = 0;
	} catch (e) {
		consecutiveFailures += 1;
		const reason = e instanceof Error ? e.message : String(e);
		throw new Error(
			`[Environment Guard] ${target.host}:${target.port} is unreachable — ${reason}. ` +
				`Check VPN/network connectivity before re-running. ` +
				`(${consecutiveFailures} consecutive failure(s) this run)`,
		);
	}
}
