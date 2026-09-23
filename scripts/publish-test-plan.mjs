#!/usr/bin/env node
/**
 * Create or update a ticket's Confluence test plan from
 * `<evidenceRoot>/<TICKET>/test-plan.html` (storage format — start from
 * templates/test-plan.html).
 *
 *   TICKET=PROJ-123 npm run publish:test-plan
 *   TICKET=PROJ-123 npm run publish:test-plan -- --target=release --dry-run
 *   TICKET=PROJ-123 npm run publish:test-plan -- --skip-evidence-upload
 *
 * Targets come from publish.config.json → confluence.targets, so a release
 * folder or a second space is configuration rather than a code change.
 * `CONFLUENCE_PAGE_ID` updates a known page instead of looking it up by title.
 *
 * Evidence artifacts matching the target's `evidencePattern` are uploaded
 * alongside the page, so the Evidence column's embeds resolve. A full upload of
 * a large bundle takes minutes — use `--skip-evidence-upload` when republishing
 * a body-only change.
 *
 * The page title is read from a leading HTML comment in the draft:
 *   <!-- Confluence page title (not part of storage body): [PROJ-123] Checkout - Test Plan -->
 */
import fs from "node:fs";
import path from "node:path";
import {
	confluenceTarget,
	evidenceRoot,
	evidenceTicketDir,
	fail,
	flagValue,
	requireTicket,
} from "./lib/config.mjs";
import {
	createStubPage,
	findPage,
	pageWebUrl,
	updatePageBody,
	uploadPageAttachment,
} from "./lib/confluence.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const target = confluenceTarget(flagValue(argv, "--target"));
const dryRun = argv.includes("--dry-run");
const skipEvidenceUpload = argv.includes("--skip-evidence-upload");
const pageIdOverride = (process.env.CONFLUENCE_PAGE_ID ?? "").trim() || null;

const evidenceDir = evidenceTicketDir(ticket);
const htmlPath = path.join(evidenceDir, "test-plan.html");
if (!fs.existsSync(htmlPath)) {
	fail(`No draft at ${evidenceRoot()}/${ticket}/test-plan.html (start from templates/test-plan.html).`);
}

const raw = fs.readFileSync(htmlPath, "utf8");
const titleMatch = raw.match(
	/<!--\s*Confluence page title \(not part of storage body\):\s*(.+?)\s*-->/,
);
if (!titleMatch) fail("test-plan.html is missing the leading page-title comment.");
const title = titleMatch[1].trim();
const body = raw.replace(/^<!--[\s\S]*?-->\s*\n?/, "").trim();

/**
 * Media a bundle must never publish — a frame with credentials on screen, for
 * instance. The table builder's own gate only stops a file being *referenced*,
 * while this script uploads whole folders, so the list has to be honoured here
 * too or a withheld file still lands on the page as an attachment.
 */
const forbiddenMedia = (() => {
	const rowsPath = path.join(evidenceDir, "comment-rows.json");
	if (!fs.existsSync(rowsPath)) return new Set();
	try {
		return new Set(JSON.parse(fs.readFileSync(rowsPath, "utf8")).forbiddenMedia ?? []);
	} catch {
		return new Set();
	}
})();

const evidenceFiles = fs.existsSync(evidenceDir)
	? fs
			.readdirSync(evidenceDir)
			.filter((f) => target.evidencePattern.test(f) && !forbiddenMedia.has(f))
			.sort()
	: [];

if (forbiddenMedia.size) {
	console.log(`Withheld from upload (${forbiddenMedia.size}): ${[...forbiddenMedia].join(", ")}`);
}

if (dryRun) {
	console.log(`(dry-run) Would publish "${title}" to ${target.label}.`);
	console.log(`(dry-run) Would upload ${evidenceFiles.length} evidence file(s).`);
	process.exit(0);
}

let page = await findPage({
	pageId: pageIdOverride,
	spaceId: target.spaceId,
	title,
});
if (!page) {
	page = await createStubPage({
		spaceId: target.spaceId,
		parentId: target.parentId,
		title,
		ticket,
	});
} else {
	console.log(`✔ Found page ${page.id} (v${page.version?.number})`);
}

if (!skipEvidenceUpload) {
	if (!evidenceFiles.length) {
		console.log(
			`No evidence files in ${evidenceRoot()}/${ticket}/ match ${target.evidencePattern} ` +
				`(target ${target.id}) — Evidence embeds would render as broken attachments.`,
		);
	} else {
		console.log(`Uploading ${evidenceFiles.length} evidence file(s) to page ${page.id}…`);
		for (const name of evidenceFiles) {
			await uploadPageAttachment(page.id, name, path.join(evidenceDir, name));
		}
		// Uploading bumps the page version; re-read it or the body update 409s.
		const refreshed = await findPage({
			pageId: pageIdOverride ?? page.id,
			spaceId: target.spaceId,
			title,
		});
		if (refreshed) page = refreshed;
	}
} else {
	console.log("Skipping evidence upload (--skip-evidence-upload).");
}

page = await updatePageBody(page, {
	spaceId: target.spaceId,
	parentId: target.parentId,
	title,
	body,
	message: `Update ${ticket} test plan (steps + Evidence column media)`,
	sendParentId: target.sendParentIdOnUpdate === true,
});

console.log(`✔ Updated page ${page.id} (v${page.version?.number})`);
console.log(`Target: ${target.label}`);
console.log(`Title: ${title}`);
console.log(`URL: ${pageWebUrl(page, target.spaceKey)}`);
