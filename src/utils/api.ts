import { request, type APIRequestContext } from "@playwright/test";

import { apiBaseURL, credentials } from "./env";

/**
 * api.ts — API-based setup for prerequisite data.
 *
 * Drive the UI for the behaviour under test; create everything that merely has
 * to EXIST through the API. A spec that clicks through four screens to reach
 * its actual assertion is slow, and worse, it fails for four reasons that have
 * nothing to do with the criterion it was written to prove.
 *
 * Register whatever you create with `CleanupRegistry` the same way as
 * UI-created data — the teardown contract does not care how a row was made.
 */

export interface ApiContextOptions {
	/** Origin for the calls. Defaults to `API_BASE_URL`, else the app origin. */
	baseURL?: string;
	/** Extra headers merged over the defaults (auth, tenant, correlation ids). */
	headers?: Record<string, string>;
	/** Bearer token. When omitted, `API_TOKEN` is used if it is set. */
	token?: string;
}

/**
 * An authenticated `APIRequestContext`.
 *
 * Dispose it in `afterEach`/`afterAll` (`await api.dispose()`) — each context
 * holds a socket pool, and leaking one per test eventually exhausts the run.
 */
export async function apiContext(
	options: ApiContextOptions = {},
): Promise<APIRequestContext> {
	const token = options.token ?? (process.env.API_TOKEN ?? "").trim();
	return request.newContext({
		baseURL: options.baseURL ?? apiBaseURL(),
		extraHTTPHeaders: {
			Accept: "application/json",
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...options.headers,
		},
	});
}

/**
 * Exchange the run's credentials for a bearer token.
 *
 * Every API authenticates differently, so this is a starting point rather than
 * a contract: point `API_TOKEN_PATH` at your token endpoint and adjust the
 * response field if yours is not `access_token` / `token`.
 */
export async function bearerToken(
	api?: APIRequestContext,
	index?: number,
): Promise<string> {
	const preset = (process.env.API_TOKEN ?? "").trim();
	if (preset) return preset;

	const ctx = api ?? (await apiContext());
	const { username, password } = credentials(index);
	const res = await ctx.post(process.env.API_TOKEN_PATH ?? "/api/auth/token", {
		data: { username, password },
	});
	if (!res.ok()) {
		throw new Error(
			`Token request failed: HTTP ${res.status()} ${await res.text()}`,
		);
	}
	const body = (await res.json()) as Record<string, string>;
	const token = body.access_token ?? body.token ?? body.accessToken;
	if (!token) {
		throw new Error(
			`No token field in the auth response (got keys: ${Object.keys(body).join(", ")})`,
		);
	}
	return token;
}

export { apiBaseURL };
