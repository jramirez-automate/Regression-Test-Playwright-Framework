import fs from "node:fs";

import {
	request,
	type APIRequestContext,
	type APIResponse,
	type TestInfo,
} from "@playwright/test";
import { z } from "zod";

import {
	apiBaseURL,
	credentials,
	skipAuth,
	workerStorageStatePath,
} from "./env";

/**
 * api.ts — API clients for API specs and for prerequisite data.
 *
 * Drive the UI for the behaviour under test; create everything that merely has
 * to EXIST through the API. A spec that clicks through four screens to reach
 * its actual assertion is slow, and worse, it fails for four reasons that have
 * nothing to do with the criterion it was written to prove.
 *
 * API specs use the `api` / `anonApi` fixtures from `src/fixtures.ts`, which
 * build a context here and dispose of it after the test. The built-in `request`
 * fixture is not used on purpose: it inherits `use.baseURL` (the UI origin) and
 * carries no auth.
 *
 * Register whatever you create with `CleanupRegistry` the same way as
 * UI-created data — the teardown contract does not care how a row was made.
 */

/**
 *   token    the token in the `API_AUTH_HEADER` header (default "Authorization: Bearer <token>")
 *   session  the worker's signed-in browser session saved by globalSetup (cookie-based APIs)
 *   none     no credentials, for deliberate 401 checks and public endpoints
 */
export type ApiAuth = "token" | "session" | "none";

export interface ApiContextOptions {
	/** Base URL for the calls. Defaults to `API_BASE_URL`, else the app origin. */
	baseURL?: string;
	/** Extra headers merged over the defaults (tenant, correlation ids). */
	headers?: Record<string, string>;
	/** Token for `token` auth. When omitted, `API_TOKEN` is used if it is set. */
	token?: string;
	/** Defaults to `defaultApiAuth()`, or `token` when `token` is passed. */
	auth?: ApiAuth;
	/** Storage-state file for `session` auth. Defaults to this worker's file. */
	storageState?: string;
}

function envToken(): string {
	return (process.env.API_TOKEN ?? "").trim();
}

/** Token when `API_TOKEN` is set, else the saved session when one exists, else none. */
export function defaultApiAuth(
	storageState = workerStorageStatePath(),
): ApiAuth {
	if (envToken()) return "token";
	return !skipAuth() && fs.existsSync(storageState) ? "session" : "none";
}

function tokenHeaders(token: string): Record<string, string> {
	if (!token) {
		throw new Error(
			"API auth is 'token' but API_TOKEN is not set for this environment",
		);
	}
	const header = process.env.API_AUTH_HEADER || "Authorization";
	const scheme =
		process.env.API_AUTH_SCHEME ?? (header === "Authorization" ? "Bearer" : "");
	return { [header]: scheme ? `${scheme} ${token}` : token };
}

/**
 * An authenticated `APIRequestContext`.
 *
 * Dispose it after use (`await api.dispose()`) — each context holds a socket
 * pool, and leaking one per test eventually exhausts the run. The `api` /
 * `anonApi` fixtures do this for you.
 */
export async function apiContext(
	options: ApiContextOptions = {},
): Promise<APIRequestContext> {
	const storageState = options.storageState ?? workerStorageStatePath();
	const auth =
		options.auth ?? (options.token ? "token" : defaultApiAuth(storageState));
	return request.newContext({
		baseURL: options.baseURL ?? apiBaseURL(),
		extraHTTPHeaders: {
			Accept: "application/json",
			"Content-Type": "application/json",
			...(auth === "token" ? tokenHeaders(options.token ?? envToken()) : {}),
			...options.headers,
		},
		...(auth === "session" ? { storageState } : {}),
	});
}

/**
 * The response body, attached to the report under the current step as
 * "response.json" — an API case's proof, since it has no screenshot. Reads
 * text first so a 204 with an empty body does not throw.
 */
export async function readBody<T = unknown>(
	res: APIResponse,
	testInfo: TestInfo,
): Promise<T> {
	const body = parseOrText(await res.text());
	await testInfo.attach("response.json", {
		body: JSON.stringify(
			{ request: res.url(), status: res.status(), body },
			null,
			2,
		),
		contentType: "application/json",
	});
	return body as T;
}

function parseOrText(text: string): unknown {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/** Message for a status assertion: which URL, and what the server said. */
export async function describeResponse(res: APIResponse): Promise<string> {
	const text = await res.text().catch(() => "");
	return `${res.status()} from ${res.url()}${text ? `\n${text.slice(0, 500)}` : ""}`;
}

/**
 * Validate a body against a schema and return it typed. Keep schemas
 * non-strict (plain `z.object`) so a new field on the server does not fail the
 * run; the error names the exact field path that broke.
 */
export function parseWith<S extends z.ZodType>(
	schema: S,
	body: unknown,
): z.infer<S> {
	const result = schema.safeParse(body);
	if (!result.success) {
		throw new Error(
			`Response does not match the schema:\n${z.prettifyError(result.error)}`,
		);
	}
	return result.data;
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
	const preset = envToken();
	if (preset) return preset;

	const ctx = api ?? (await apiContext({ auth: "none" }));
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
