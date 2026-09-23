/**
 * Shared Zephyr Scale helpers.
 *
 * Zephyr Scale Cloud is its own API on its own host with a bearer token — it is
 * not part of the Jira REST surface, which is why it gets a separate client and
 * a separate token from the rest of the pipeline.
 */
import fs from "node:fs";
import path from "node:path";
import {
	config,
	evidenceTicketDir,
	fail,
	loadPublishEnv,
} from "../config.mjs";

export { fail, requireTicket, projectKeyFrom, flagValue } from "../config.mjs";

export const ZEPHYR_API =
	process.env.ZEPHYR_API_URL ?? "https://api.zephyrscale.smartbear.com/v2";

export function zephyrSettings() {
	return config().zephyr ?? {};
}

export function requireZephyrToken() {
	loadPublishEnv();
	const token = (process.env.ZEPHYR_API_TOKEN ?? "").trim();
	if (!token) fail("Missing ZEPHYR_API_TOKEN in .env.publish.");
	return token;
}

/** Zephyr call. 204/empty responses return null; non-OK throws so callers can catch (e.g. 409 already linked). */
export async function zephyr(method, endpoint, body) {
	const token = requireZephyrToken();
	const res = await fetch(`${ZEPHYR_API}${endpoint}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		...(body === undefined || body === null ? {} : { body: JSON.stringify(body) }),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new Error(`${method} ${endpoint} → HTTP ${res.status}: ${text.slice(0, 400)}`);
	}
	if (!text || res.status === 204) return null;
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}

/** All folders of a type for a project — the API pages at 100. */
export async function listAllFolders(projectKey, folderType = "TEST_CASE") {
	const folders = [];
	for (let startAt = 0; ; startAt += 100) {
		const page = await zephyr(
			"GET",
			`/folders?projectKey=${projectKey}&folderType=${folderType}&maxResults=100&startAt=${startAt}`,
		);
		folders.push(...(page.values ?? []));
		if (page.isLast) break;
	}
	return folders;
}

/** Top-level folder by name, or a clear error naming what to create in Zephyr. */
export function requireRootFolder(folders, name, folderType) {
	const found = folders.find((f) => f.name === name && f.parentId == null);
	if (!found) {
		fail(
			`Zephyr ${folderType} folder "${name}" not found. Create it at the top level of the project, ` +
				`or change zephyr.rootFolder in publish.config.json.`,
		);
	}
	return found;
}

export function createdPath(ticket) {
	return path.join(evidenceTicketDir(ticket), "zephyr-created.json");
}

export function loadCreated(ticket) {
	const file = createdPath(ticket);
	if (!fs.existsSync(file)) {
		fail(`${file} not found — run "zephyr create" for ${ticket} first.`);
	}
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeCreated(ticket, data) {
	const file = createdPath(ticket);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
	return file;
}

/** Zephyr renders step text as HTML, so raw angle brackets would vanish. */
export function escapeHtml(s) {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function testPlayerUrl(jiraBase, projectKey, cycleKey) {
	return `${jiraBase}/projects/${projectKey}?selectedItem=com.atlassian.plugins.atlassian-connect-plugin:com.kanoah.test-manager__main-project-page#!/v2/testPlayer/${cycleKey}`;
}
