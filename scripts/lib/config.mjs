/**
 * config.mjs — one loader for the publishing pipeline's settings and secrets.
 *
 * Two files, deliberately separated:
 *   publish.config.json   ids, space keys, folder names — committed
 *   .env.publish          API tokens — gitignored, never committed
 *
 * Every script reads its destination from here rather than hardcoding a project
 * key or space id, which is what lets this framework move between products
 * without editing script bodies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const root = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

let envLoaded = false;

/** Load `.env.publish` once. Values already in `process.env` (CI) win. */
export function loadPublishEnv() {
	if (envLoaded) return;
	dotenv.config({ path: path.join(root, ".env.publish") });
	envLoaded = true;
}

export function fail(msg) {
	console.error(`✖ ${msg}`);
	process.exit(1);
}

let cached = null;

export function config() {
	if (cached) return cached;
	const file = path.join(root, "publish.config.json");
	if (!fs.existsSync(file)) {
		fail(
			"publish.config.json not found at the repo root. Copy it from the template and fill in your Jira/Confluence/Zephyr ids.",
		);
	}
	try {
		cached = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (err) {
		fail(`publish.config.json is not valid JSON: ${err.message}`);
	}
	return cached;
}

export function evidenceRoot() {
	return config().evidenceRoot ?? "src/evidence";
}

/** Absolute `<evidenceRoot>/<ticket>` under the repo root. */
export function evidenceTicketDir(ticket) {
	return path.join(root, ...evidenceRoot().split("/"), ticket);
}

export function jiraBaseUrl() {
	loadPublishEnv();
	const url = (process.env.JIRA_BASE_URL ?? config().jira?.baseUrl ?? "").trim();
	if (!url || url.includes("your-org")) {
		fail(
			"Jira base URL is unset. Put your site in publish.config.json → jira.baseUrl, or set JIRA_BASE_URL in .env.publish.",
		);
	}
	return url.replace(/\/$/, "");
}

/**
 * Ticket key for this run. Scripts take it from the environment so the same
 * command shape works for a story, a regression task or a bug.
 */
export function requireTicket() {
	const ticket = (process.env.TICKET ?? "").trim();
	if (!ticket) fail("Set TICKET=<ISSUE-KEY> for this command.");
	return ticket;
}

/** `PROJ-1234` → `PROJ`. Zephyr scopes everything by project key. */
export function projectKeyFrom(ticket) {
	return ticket.split("-")[0];
}

/** Resolve a Confluence publish target by name, honouring env overrides. */
export function confluenceTarget(name) {
	loadPublishEnv();
	const conf = config().confluence ?? {};
	const key = (name ?? conf.defaultTarget ?? "default").trim();
	const target = conf.targets?.[key];
	if (!target) {
		const allowed = Object.keys(conf.targets ?? {}).join(" | ") || "(none configured)";
		fail(`Unknown Confluence target "${key}". Configured targets: ${allowed}`);
	}
	// Space/folder ids move every release cycle in most orgs, so an override is
	// a run-time flag rather than an edit to a committed file.
	const parentId = (process.env.CONFLUENCE_PARENT_ID ?? "").trim() || target.parentId;
	const spaceId = (process.env.CONFLUENCE_SPACE_ID ?? "").trim() || target.spaceId;
	if (!spaceId || /^0+$/.test(String(spaceId))) {
		fail(
			`Confluence target "${key}" has a placeholder spaceId. Fill it in publish.config.json or set CONFLUENCE_SPACE_ID.`,
		);
	}
	return {
		id: key,
		...target,
		spaceId,
		parentId,
		evidencePattern: new RegExp(target.evidencePattern ?? "\\.(png|webm)$", "i"),
	};
}

/** Parse `--flag value` and `--flag=value` alike. */
export function flagValue(argv, name) {
	const eq = argv.find((a) => a.startsWith(`${name}=`));
	if (eq) return eq.slice(name.length + 1);
	const i = argv.indexOf(name);
	return i === -1 ? null : (argv[i + 1] ?? null);
}
