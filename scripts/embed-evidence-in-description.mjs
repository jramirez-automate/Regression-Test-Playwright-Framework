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
 * Every `*-FAILED-trace.zip` in src/evidence/<TICKET>/ becomes a redacted HAR
 * (`<TICKET>-<env>.har`, auth headers, cookies and tokens stripped), attached
 * and shown after the media with the failing calls listed, so a developer can
 * import the network log without re-running the test. A DevTools export for a
 * manual finding goes in with `--har`.
 *
 *   TICKET=PROJ-999 node scripts/embed-evidence-in-description.mjs \
 *     --from-rows src/evidence/PROJ-999/comment-rows.json
 *   TICKET=PROJ-999 node scripts/embed-evidence-in-description.mjs \
 *     --files checkout-FAILED.png,checkout-FAILED.webm
 *   … --har network.har   a browser export in src/evidence/<TICKET>/, attached as-is
 *   … --no-har            skip the trace-to-HAR step
 *   … --dry-run           print the ADF instead of writing it
 */
import fs from "node:fs";
import path from "node:path";
import { evidenceTicketDir, fail, flagValue, requireTicket } from "./lib/config.mjs";
import {
	attachmentsByFilename,
	issueUrl,
	jiraGet,
	jiraSend,
	mediaUuid,
	uploadAttachment,
} from "./lib/jira.mjs";
import {
	bulletList,
	isVisualMedia,
	mediaFile,
	mediaFromRows,
	mediaThumb,
	p,
	text,
} from "./lib/adf.mjs";
import { failures, traceToHar } from "./lib/har.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const rowsPath = flagValue(argv, "--from-rows");
const filesArg = flagValue(argv, "--files");
const harArg = flagValue(argv, "--har");
const noHar = argv.includes("--no-har");
const dryRun = argv.includes("--dry-run");

if (!rowsPath && !filesArg) fail("Pass --from-rows <rows.json> or --files a.png,b.webm.");

let wanted = [];
if (rowsPath) {
	if (!fs.existsSync(rowsPath)) fail(`No such rows file: ${rowsPath}`);
	wanted = [...mediaFromRows(JSON.parse(fs.readFileSync(rowsPath, "utf8")))];
} else {
	wanted = filesArg.split(",").map((f) => f.trim()).filter(Boolean);
}
wanted = wanted.filter((name) => !/\.har$/i.test(name));
if (!wanted.length) fail("No media filenames found to embed.");

// ── Network captures ────────────────────────────────────────────────────────
const dir = evidenceTicketDir(ticket);
const captures = [];
if (harArg) {
	const file = path.join(dir, harArg);
	if (!fs.existsSync(file)) fail(`--har: no ${harArg} in ${dir}`);
	captures.push({ name: harArg, file, har: JSON.parse(fs.readFileSync(file, "utf8")) });
}
if (!noHar && fs.existsSync(dir)) {
	const used = new Set(captures.map((c) => c.name));
	for (const trace of fs.readdirSync(dir).filter((f) => /-FAILED-trace\.zip$/i.test(f)).sort()) {
		const env = trace.match(/-([a-z0-9]+)-FAILED-trace\.zip$/i)?.[1] ?? "run";
		let name = `${ticket}-${env}.har`;
		for (let n = 2; used.has(name); n++) name = `${ticket}-${env}-${n}.har`;
		used.add(name);
		const har = traceToHar(path.join(dir, trace));
		const file = path.join(dir, name);
		fs.writeFileSync(file, `${JSON.stringify(har, null, 2)}\n`);
		captures.push({ name, file, har, trace });
	}
}
for (const c of captures) {
	console.log(
		`  network ${c.name}${c.trace ? ` ← ${c.trace}` : ""}: ` +
			`${c.har.log.entries.length} request(s), ${failures(c.har).length} failing`,
	);
}

// ── Resolve media ───────────────────────────────────────────────────────────
let attachments = await attachmentsByFilename(ticket);
const pending = captures.filter((c) => {
	const attached = attachments.get(c.name);
	return !attached || attached.size !== fs.statSync(c.file).size;
});
if (pending.length && dryRun) {
	console.log(`(dry-run) would attach ${pending.map((c) => c.name).join(", ")}`);
} else if (pending.length) {
	for (const c of pending) await uploadAttachment(ticket, c.name, c.file);
	attachments = await attachmentsByFilename(ticket);
}

const uuidByFilename = new Map();
const resolve = async (name) => {
	const attachment = attachments.get(name);
	if (!attachment) {
		if (dryRun && captures.some((c) => c.name === name)) return "<uploaded-on-run>";
		fail(`"${name}" is not attached to ${ticket} — run evidence:attach first.`);
	}
	uuidByFilename.set(name, await mediaUuid(attachment.id));
	console.log(`  media ${name} → ${uuidByFilename.get(name)}`);
	return uuidByFilename.get(name);
};

const mediaNodes = [];
for (const name of wanted) {
	await resolve(name);
	mediaNodes.push(mediaThumb(name, uuidByFilename));
	mediaNodes.push(p(text(name, [{ type: "code" }])));
}

/** The HAR as a file card under a note listing each failing call, for the developers. */
const networkCaptureNote = (capture, uuid) => {
	const failing = failures(capture.har);
	return [
		p(
			text("Network capture: ", [{ type: "strong" }]),
			text(capture.name, [{ type: "code" }]),
			text(
				capture.trace
					? " — built from the Playwright trace of the failing run above. Import it in DevTools → Network. Auth headers, cookies and tokens are redacted."
					: " — exported from the browser for this finding. Import it in DevTools → Network.",
			),
		),
		...(failing.length
			? [
					bulletList(
						failing.map((call) =>
							p(
								text(`${call.method} ${call.path}`, [{ type: "code" }]),
								text(` → ${call.status}`),
								...(call.response ? [text(" "), text(call.response, [{ type: "code" }])] : []),
								...(call.bodyMissing
									? [
											text(
												" (request body not in the capture — Playwright doesn't record multipart/form-data)",
											),
										]
									: []),
							),
						),
					),
				]
			: []),
		mediaFile(uuid),
	];
};
for (const capture of captures) {
	mediaNodes.push(...networkCaptureNote(capture, await resolve(capture.name)));
}

// ── Rewrite the description ─────────────────────────────────────────────────
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
const visual = wanted.filter(isVisualMedia).length;
console.log(
	`✔ Embedded ${visual} media and ${wanted.length - visual + captures.length} file card(s) in ${ticket} description — ${issueUrl(ticket)}`,
);
