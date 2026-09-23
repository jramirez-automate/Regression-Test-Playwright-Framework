#!/usr/bin/env node
/**
 * Attach a ticket's evidence bundle to its Jira issue.
 *
 * Curate before you upload. `--from-rows` restricts the upload to exactly the
 * media the evidence comment references, which is almost always what you want:
 * the capture folder also holds unused env runs, extra subject screenshots and
 * traces, and dumping all of it buries the three files a reviewer needs.
 *
 *   TICKET=PROJ-123 npm run evidence:attach -- --from-rows src/evidence/PROJ-123/comment-rows.json
 *   TICKET=PROJ-123 npm run evidence:attach                # every .png/.webm + SUMMARY.md
 *   TICKET=PROJ-123 npm run evidence:attach -- --dry-run
 *   TICKET=PROJ-123 npm run evidence:attach -- --traces    # include -trace.zip
 *   TICKET=PROJ-123 npm run evidence:attach -- --only finding-
 *
 * A failing TC's `*-FAILED.png` / `*-FAILED.webm` belong on the parent ticket
 * AND on every bug raised from it — proof that lives only on the parent makes
 * the bug unreadable on its own:
 *
 *   mkdir -p src/evidence/<BUG-KEY>
 *   cp src/evidence/<TICKET>/*-FAILED.* src/evidence/<BUG-KEY>/
 *   # write src/evidence/<BUG-KEY>/comment-rows.json listing those files
 *   TICKET=<BUG-KEY> npm run evidence:attach -- --from-rows src/evidence/<BUG-KEY>/comment-rows.json
 *
 * Credentials: .env.publish (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import {
	evidenceRoot,
	evidenceTicketDir,
	fail,
	flagValue,
	requireTicket,
	root,
} from "./lib/config.mjs";
import { issueUrl, uploadAttachment } from "./lib/jira.mjs";
import { mediaFromRows } from "./lib/adf.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const dryRun = argv.includes("--dry-run");
const includeTraces = argv.includes("--traces");
const only = flagValue(argv, "--only");
const fromRowsArg = flagValue(argv, "--from-rows");
const fromRowsPath = fromRowsArg ? path.resolve(root, fromRowsArg) : null;

const evidenceDir = evidenceTicketDir(ticket);
if (!fs.existsSync(evidenceDir)) {
	fail(
		`No evidence bundle at ${evidenceRoot()}/${ticket}/ — run TICKET=${ticket} npm run test:evidence first.`,
	);
}

let allowed = null;
if (fromRowsPath) {
	if (!fs.existsSync(fromRowsPath)) fail(`--from-rows file not found: ${fromRowsPath}`);
	let spec;
	try {
		spec = JSON.parse(fs.readFileSync(fromRowsPath, "utf8"));
	} catch (err) {
		fail(`--from-rows is not valid JSON: ${err.message}`);
	}
	allowed = mediaFromRows(spec);
	if (allowed.size === 0) fail(`${fromRowsPath} lists no media filenames.`);
}

const files = fs
	.readdirSync(evidenceDir)
	.filter((name) => {
		if (allowed) return name === "SUMMARY.md" || allowed.has(name);
		if (only && !name.includes(only)) return false;
		if (name === "SUMMARY.md") return true;
		if (/\.(png|webm)$/i.test(name)) return true;
		if (includeTraces && /-trace\.zip$/i.test(name)) return true;
		return false;
	})
	.sort();

if (files.length === 0) fail(`Nothing to attach in ${evidenceRoot()}/${ticket}/.`);

if (allowed) {
	const missing = [...allowed].filter((n) => !files.includes(n));
	if (missing.length) {
		fail(
			`--from-rows references file(s) missing from ${evidenceRoot()}/${ticket}/:\n  ${missing.join("\n  ")}`,
		);
	}
}

console.log(`Attaching ${files.length} file(s) from ${evidenceRoot()}/${ticket}/ to ${ticket}:`);
if (dryRun) {
	for (const name of files) console.log(`  (dry-run) ${name}`);
	process.exit(0);
}

let failed = 0;
const uploaded = [];
for (const name of files) {
	const result = await uploadAttachment(ticket, name, path.join(evidenceDir, name));
	if (result.ok) {
		uploaded.push({ file: name, url: result.url });
		console.log(`  ✔ ${name} → ${result.url}`);
	} else {
		failed += 1;
		console.error(`  ✖ ${name} → ${result.error}`);
	}
}
if (failed) fail(`${failed} attachment(s) failed.`);

// A filename → URL map, so a hand-written comment or a summary can link each
// artifact directly without re-querying the API.
const links = uploaded
	.map(({ file, url }) => {
		const icon = /\.webm$/i.test(file) ? "🎬" : /\.png$/i.test(file) ? "📷" : "📄";
		return `- ${icon} \`${file}\` → [${file}](${url})`;
	})
	.join("\n");
const linksPath = path.join(evidenceDir, "attachment-links.md");
if (only && fs.existsSync(linksPath)) fs.appendFileSync(linksPath, `${links}\n`);
else fs.writeFileSync(linksPath, `# Jira attachment links — ${ticket}\n\n${links}\n`);

console.log(`Link map written: ${evidenceRoot()}/${ticket}/attachment-links.md`);
console.log(`Done. View: ${issueUrl(ticket)}`);
