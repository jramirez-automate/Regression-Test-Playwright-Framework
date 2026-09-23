/**
 * Shared TCP-probe helper.
 *
 * Used by both `scripts/check-reachability.js` (CI preflight — plain `node`, no
 * build step) and `src/utils/environment-guard.ts` (per-test guard). One copy
 * so a timeout/error-handling fix cannot drift between callers.
 */
"use strict";

const net = require("net");

/** Resolve a URL string to a { host, port } pair, defaulting the port from the protocol. */
function resolveHostPort(rawUrl) {
	try {
		const u = new URL(rawUrl);
		const port = u.port ? parseInt(u.port, 10) : u.protocol === "https:" ? 443 : 80;
		return { host: u.hostname, port };
	} catch {
		return null;
	}
}

/** Resolves on a successful TCP connect; rejects on timeout or connection error. */
function probeTcp(host, port, timeoutMs) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host, port, timeout: timeoutMs });
		const fail = (err) => {
			socket.destroy();
			reject(err);
		};
		socket.once("connect", () => {
			socket.destroy();
			resolve();
		});
		socket.once("timeout", () =>
			fail(new Error(`TCP connect to ${host}:${port} timed out after ${timeoutMs}ms`)),
		);
		socket.once("error", fail);
	});
}

module.exports = { resolveHostPort, probeTcp };
