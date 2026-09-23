#!/usr/bin/env node
/**
 * Inline a bug's evidence media into its Jira DESCRIPTION.
 *
 * Attaching is not the same as showing. A bug whose proof sits in the
 * Attachments tab makes every reader click through before they can judge it;
 * a bug that renders its failure screenshot in the description is triaged at a
 * glance. Jira only renders inline media from ADF `media` nodes, so this
 * rewrites the description as ADF.
 *
 * The media replaces everything under a trailing "Evidence" heading (added when
 * absent), which makes re-running idempotent rather than additive.
 *
 *   TICKET=PROJ-999 node scripts/embed-evidence-in-description.mjs \
 *     --from-rows src/evidence/PROJ-999/comment-rows.json
 *   TICKET=PROJ-999 node scripts/embed-evidence-in-description.mjs \
 *     --files checkout-FAILED.png,checkout-FAILED.webm
 *   … --dry-run   print the ADF instead of writing it
 */
import fs from "node:fs";
import { fail, flagValue, requireTicket } from "./lib/config.mjs";
import {
	attachmentsByFilename,
	issueUrl,
	jiraGet,
	jiraSend,
	mediaUuid,
} from "./lib/jira.mjs";
import { mediaFromRows } from "./lib/adf.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const rowsPath = flagValue(argv, "--from-rows");
const filesArg = flagValue(argv, "--files");
const dryRun = argv.includes("--dry-run");

if (!rowsPath && !filesArg) fail("Pass --from-rows <rows.json> or --files a.png,b.webm.");

let wanted = [];
if (rowsPath) {
	if (!fs.existsSync(rowsPath)) fail(`No such rows file: ${rowsPath}`);
	wanted = [...mediaFromRows(JSON.parse(fs.readFileSync(rowsPath, "utf8")))];
} else {
	wanted = filesArg.split(",").map((f) => f.trim()).filter(Boolean);
}
if (!wanted.length) fail("No media filenames found to embed.");

const attachments = await attachmentsByFilename(ticket);
const mediaNodes = [];
for (const name of wanted) {
	const attachment = attachments.get(name);
	if (!attachment) fail(`"${name}" is not attached to ${ticket} — run evidence:attach first.`);
	const uuid = await mediaUuid(attachment.id);
	const isVideo = /\.(webm|mp4|mov)$/i.test(name);
	mediaNodes.push({
		type: "mediaSingle",
		attrs: { layout: "align-start" },
		content: [
			{
				type: "media",
				attrs: {
					type: "file",
					id: uuid,
					collection: "",
					...(isVideo ? { width: 1920, height: 1080 } : {}),
				},
			},
		],
	});
	mediaNodes.push({
		type: "paragraph",
		content: [{ type: "text", text: name, marks: [{ type: "code" }] }],
	});
	console.log(`  media ${name} → ${uuid}`);
}

const issue = await jiraGet(
	`/rest/api/3/issue/${encodeURIComponent(ticket)}?fields=description`,
);
const description = issue.fields?.description ?? { type: "doc", version: 1, content: [] };
if (description.type !== "doc") fail("Description is not ADF — refusing to overwrite it.");

const isEvidenceHeading = (node) =>
	node.type === "heading" &&
	(node.content ?? [])
		.map((c) => c.text ?? "")
		.join("")
		.trim()
		.toLowerCase() === "evidence";

const headingIndex = (description.content ?? []).findIndex(isEvidenceHeading);
const kept =
	headingIndex >= 0
		? description.content.slice(0, headingIndex)
		: (description.content ?? []);

const next = {
	...description,
	content: [
		...kept,
		{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Evidence" }] },
		...mediaNodes,
	],
};

if (dryRun) {
	console.log(JSON.stringify(next, null, 2).slice(0, 4000));
	process.exit(0);
}

await jiraSend("PUT", `/rest/api/3/issue/${encodeURIComponent(ticket)}`, {
	fields: { description: next },
});
console.log(`✔ Embedded ${wanted.length} file(s) in ${ticket} description — ${issueUrl(ticket)}`);
