#!/usr/bin/env node
/**
 * Delete Jira attachments that no comment or description references.
 *
 * A ticket accumulates orphans over a regression cycle: env captures that never
 * made the table, stale duplicates from a re-attach after a recapture, one-off
 * uploads from a triage session. Run this once the evidence comment is final.
 *
 *   TICKET=PROJ-123 npm run evidence:cleanup
 *   TICKET=PROJ-123 npm run evidence:cleanup -- --dry-run
 *   TICKET=PROJ-123 npm run evidence:cleanup -- --from-rows src/evidence/PROJ-123/comment-rows.json
 *
 * Keep rules — any match keeps the file:
 *   • its media UUID appears in a comment or the description
 *   • its attachment id appears in a link in either
 *   • its filename is listed in --from-rows (newest upload only)
 *   • it is SUMMARY.md (newest upload only)
 *
 * Safety valve: when no media UUIDs or attachment links are found anywhere and
 * --from-rows was not passed, this deletes nothing. Otherwise running it before
 * the evidence comment exists would wipe the ticket clean.
 */
import fs from "node:fs";
import { fail, flagValue, requireTicket } from "./lib/config.mjs";
import {
	fetchAllComments,
	issueUrl,
	jiraAuthHeader,
	jiraGet,
	mediaUuid,
} from "./lib/jira.mjs";
import { jiraBaseUrl } from "./lib/config.mjs";
import { mediaFromRows } from "./lib/adf.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const dryRun = argv.includes("--dry-run");
const fromRowsPath = flagValue(argv, "--from-rows");

let keepFromRows = new Set();
if (fromRowsPath) {
	if (!fs.existsSync(fromRowsPath)) fail(`--from-rows file not found: ${fromRowsPath}`);
	keepFromRows = mediaFromRows(JSON.parse(fs.readFileSync(fromRowsPath, "utf8")));
	console.log(`--from-rows keep list: ${keepFromRows.size} media filename(s)`);
}

/** Walk an ADF tree collecting media UUIDs and attachment ids found in links. */
function collectRefs(node, out) {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const child of node) collectRefs(child, out);
		return;
	}
	if (node.type === "media" && typeof node.attrs?.id === "string") {
		const id = node.attrs.id;
		if (/^[0-9a-f-]{36}$/i.test(id)) out.uuids.add(id.toLowerCase());
	}
	const href =
		(typeof node.attrs?.href === "string" ? node.attrs.href : null) ??
		node.marks?.find?.((m) => m.type === "link")?.attrs?.href;
	if (typeof href === "string") {
		const byId = href.match(/\/attachment\/(?:content\/)?(\d+)/i);
		if (byId) out.attachmentIds.add(byId[1]);
	}
	if (node.content) collectRefs(node.content, out);
	if (node.marks) collectRefs(node.marks, out);
	for (const [k, v] of Object.entries(node)) {
		if (["content", "marks", "text", "type", "attrs"].includes(k)) continue;
		if (v && typeof v === "object") collectRefs(v, out);
	}
}

const issue = await jiraGet(
	`/rest/api/3/issue/${encodeURIComponent(ticket)}?fields=attachment,description`,
);
const attachments = issue.fields?.attachment ?? [];
console.log(`${ticket}: ${attachments.length} attachment(s) on issue`);
if (attachments.length === 0) {
	console.log("Nothing to clean.");
	process.exit(0);
}

const refs = { uuids: new Set(), attachmentIds: new Set() };
collectRefs(issue.fields?.description, refs);
for (const comment of await fetchAllComments(ticket)) collectRefs(comment.body, refs);

if (refs.uuids.size === 0 && refs.attachmentIds.size === 0 && keepFromRows.size === 0) {
	console.log(
		"Jira attachments: skipped (no media or link references found in comments — refusing to delete). " +
			"Post the evidence comment first, or pass --from-rows.",
	);
	process.exit(0);
}
console.log(
	`Refs: ${refs.uuids.size} media UUID(s), ${refs.attachmentIds.size} attachment id(s)` +
		(keepFromRows.size ? `, ${keepFromRows.size} --from-rows filename(s)` : ""),
);

const filenameAllow = new Set([...keepFromRows, "SUMMARY.md"]);

// Resolve each attachment, then keep only the NEWEST upload per allowed
// filename — an older duplicate of a kept name is exactly the stale re-attach
// this command exists to remove.
const resolved = [];
for (const a of attachments) {
	const uuid = await mediaUuid(a.id).catch(() => null);
	resolved.push({
		id: String(a.id),
		filename: a.filename,
		created: a.created,
		size: a.size ?? 0,
		uuid: uuid ? uuid.toLowerCase() : null,
	});
}

const newestByName = new Map();
for (const a of resolved) {
	const prev = newestByName.get(a.filename);
	if (!prev || Date.parse(a.created) >= Date.parse(prev.created)) {
		newestByName.set(a.filename, a);
	}
}

const keep = [];
const remove = [];
for (const a of resolved) {
	const referenced =
		(a.uuid && refs.uuids.has(a.uuid)) || refs.attachmentIds.has(a.id);
	const allowedByName =
		filenameAllow.has(a.filename) && newestByName.get(a.filename)?.id === a.id;
	(referenced || allowedByName ? keep : remove).push(a);
}

console.log(`Keeping ${keep.length}, deleting ${remove.length}.`);
for (const a of remove) {
	console.log(`  ${dryRun ? "(dry-run) " : ""}delete ${a.filename} (id ${a.id})`);
}
if (dryRun || remove.length === 0) {
	console.log(
		remove.length === 0
			? "Jira attachments: clean (0 unused)"
			: `(dry-run) would delete ${remove.length}`,
	);
	process.exit(0);
}

let deleted = 0;
for (const a of remove) {
	const res = await fetch(`${jiraBaseUrl()}/rest/api/3/attachment/${a.id}`, {
		method: "DELETE",
		headers: jiraAuthHeader(),
	});
	if (res.ok) deleted += 1;
	else console.warn(`  ⚠ ${a.filename}: HTTP ${res.status}`);
}
console.log(`Jira attachments: cleaned (${deleted} deleted) — ${issueUrl(ticket)}`);
