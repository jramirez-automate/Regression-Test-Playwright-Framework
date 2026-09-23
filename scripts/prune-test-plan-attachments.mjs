#!/usr/bin/env node
/**
 * Delete Confluence test-plan attachments that no longer exist locally.
 *
 * Renaming a test renames its artifacts, and the publisher only ever ADDS, so
 * the old files stay attached to the page indefinitely. They are still openable
 * against the new table, which is how a reviewer ends up looking at last
 * month's screenshot while reading this month's criterion.
 *
 *   TICKET=PROJ-123 CONFLUENCE_PAGE_ID=<id> npm run publish:prune-attachments -- --dry-run
 *   TICKET=PROJ-123 CONFLUENCE_PAGE_ID=<id> npm run publish:prune-attachments
 *
 * Only files matching the target's `evidencePattern` are ever considered, so a
 * hand-uploaded diagram or spreadsheet on the page is never touched.
 */
import fs from "node:fs";
import {
	confluenceTarget,
	evidenceRoot,
	evidenceTicketDir,
	fail,
	flagValue,
	requireTicket,
} from "./lib/config.mjs";
import { deletePageAttachment, listPageAttachments } from "./lib/confluence.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const target = confluenceTarget(flagValue(argv, "--target"));
const dryRun = argv.includes("--dry-run");
const pageId = (process.env.CONFLUENCE_PAGE_ID ?? "").trim();

if (!pageId) fail("Set CONFLUENCE_PAGE_ID=<id> — the page to prune.");

const evidenceDir = evidenceTicketDir(ticket);
const local = new Set(fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir) : []);
if (local.size === 0) {
	fail(
		`${evidenceRoot()}/${ticket}/ is empty — refusing to prune (everything would look stale).`,
	);
}

const attachments = await listPageAttachments(pageId);
const candidates = attachments.filter((a) => target.evidencePattern.test(a.title));
const stale = candidates.filter((a) => !local.has(a.title));

console.log(
	`Page ${pageId}: ${attachments.length} attachment(s), ${candidates.length} match the evidence pattern, ${stale.length} stale.`,
);
for (const a of stale) console.log(`  ${dryRun ? "(dry-run) " : ""}delete ${a.title}`);

if (dryRun || stale.length === 0) {
	if (!dryRun) console.log("Nothing to prune.");
	process.exit(0);
}

let deleted = 0;
for (const a of stale) {
	if (await deletePageAttachment(a.id)) deleted += 1;
	else console.warn(`  ⚠ could not delete ${a.title}`);
}
console.log(`Pruned ${deleted} stale attachment(s) from page ${pageId}.`);
