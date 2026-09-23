#!/usr/bin/env node
/**
 * Post (or update) a Jira evidence comment with REAL inline media — image
 * thumbnails and playable video players inside the table, exactly as if the
 * media had been pasted in by hand.
 *
 *   TICKET=PROJ-123 node scripts/post-evidence-comment.mjs --rows src/evidence/PROJ-123/comment-rows.json
 *   … --comment-id 1234857   update an existing comment instead of adding one
 *   … --dry-run              print the ADF, post nothing
 *
 * Prerequisite: the files are already attached (`npm run evidence:attach`).
 *
 * rows JSON schema — see templates/comment-rows.example.json for a filled-in
 * version. In short:
 *
 * {
 *   "title":  "Automated E2E regression — Checkout (2026-05-04)",
 *   "intro":  "one paragraph of context",
 *   "version": "v2.4.0",          // optional build under test; falls back to $APP_VERSION
 *   "rows": [
 *     // Per-env form (preferred). Each env carries its own result + media, so a
 *     // run on two environments renders side by side. Env keys are free-form:
 *     // any key holding { result | note | media } becomes its own column.
 *     { "tc": "TC-001", "case": "…", "by": "spec file",
 *       "steps": ["action 1", "action 2"],
 *       "expectedResult": "observable outcome",
 *       "staging": { "result": "✅ Pass", "media": ["x-staging.png", "x-staging.webm"] },
 *       "prod":    { "result": "✅ Pass", "media": ["x-prod.png"] } },
 *     // Single-column form, still accepted:
 *     { "tc": "TC-002", "case": "…", "result": "✅ Pass", "media": ["y.png"] }
 *   ],
 *   "envColumns": [{ "key": "staging", "header": "Staging" }],   // optional: fixes column order
 *   "links":    [{ "label": "[PROJ-123] Checkout - Test Plan", "url": "…" }],
 *   "findings": [{ "title": "…", "ticket": "PROJ-999", "description": "…",
 *                  "replicate": ["step 1"], "media": ["finding.png"] }],
 *   "footer":   "closing paragraph"
 * }
 *
 * TC ids are always zero-padded hyphen form — TC-001, TC-002 — never TC1. The
 * same ids appear in Confluence and Zephyr, and bugs cite them, so the format
 * has to be stable across all three.
 */
import fs from "node:fs";
import {
	fail,
	flagValue,
	requireTicket,
} from "./lib/config.mjs";
import {
	attachmentsByFilename,
	issueUrl,
	jiraBaseUrl,
	jiraSend,
	mediaUuid,
} from "./lib/jira.mjs";
import {
	ADF_CHAR_LIMIT,
	adfSizeReport,
	cell,
	header,
	heading,
	link,
	mediaThumb,
	orderedList,
	p,
	text,
} from "./lib/adf.mjs";

const argv = process.argv.slice(2);
const ticket = requireTicket();
const rowsPath = flagValue(argv, "--rows");
const commentId = flagValue(argv, "--comment-id");
const dryRun = argv.includes("--dry-run");

if (!rowsPath || !fs.existsSync(rowsPath)) fail("Pass --rows <comment-rows.json>.");
const spec = JSON.parse(fs.readFileSync(rowsPath, "utf8"));

const versionUnderTest = (spec.version ?? process.env.APP_VERSION ?? "").trim();

const badTc = (spec.rows ?? []).filter(
	(r) => r?.tc != null && !/^TC-\d{3,}$/.test(String(r.tc)),
);
if (badTc.length) {
	fail(
		`Invalid tc id(s): ${badTc.map((r) => JSON.stringify(r.tc)).join(", ")}. ` +
			`Use zero-padded hyphen form TC-001, TC-002, … (never TC1 / TC5).`,
	);
}

// ── Columns ─────────────────────────────────────────────────────────────────
// A row key is an env column when its value is an object carrying result/note/
// media. Declaring `envColumns` pins the order and the header text; otherwise
// columns appear in first-seen order with a title-cased header.
const RESERVED = new Set(["tc", "case", "by", "steps", "expectedResult", "result", "media", "note"]);
const isEnvCell = (v) =>
	v && typeof v === "object" && !Array.isArray(v) &&
	("result" in v || "note" in v || "media" in v);

const titleCase = (k) =>
	k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const declared = spec.envColumns ?? null;
const discovered = [];
for (const row of spec.rows ?? []) {
	for (const [key, value] of Object.entries(row)) {
		if (RESERVED.has(key) || !isEnvCell(value)) continue;
		if (!discovered.some((c) => c.key === key)) {
			discovered.push({ key, header: titleCase(key) });
		}
	}
}
const envColumns = declared
	? declared.filter((c) => (spec.rows ?? []).some((r) => r[c.key]))
	: discovered;
const perEnv = envColumns.length > 0;

// ── Resolve every referenced file to its media UUID ─────────────────────────
const attachments = await attachmentsByFilename(ticket);
const uuidByFilename = new Map();
const neededFiles = [
	...new Set([
		...(spec.rows ?? []).flatMap((r) => [
			...(r.media ?? []),
			...envColumns.flatMap((c) => r[c.key]?.media ?? []),
		]),
		...(spec.findings ?? []).flatMap((f) => (typeof f === "string" ? [] : (f.media ?? []))),
	]),
];
for (const name of neededFiles) {
	const attachment = attachments.get(name);
	if (!attachment) {
		fail(`"${name}" is not attached to ${ticket} — run evidence:attach first.`);
	}
	uuidByFilename.set(name, await mediaUuid(attachment.id));
	console.log(`  media ${name} → ${uuidByFilename.get(name)}`);
}
const thumb = (file) => mediaThumb(file, uuidByFilename);

// ── Build the table ─────────────────────────────────────────────────────────
const caseCell = (row) =>
	cell(p(text(row.case)), ...(row.by ? [p(text(row.by, [{ type: "code" }]))] : []));

// Steps get their own column as a numbered list — the same one-action-per-step
// convention the Zephyr cases use, so the two read identically side by side.
// Older rows files carry `steps` as one pre-joined string; treat that as a
// single-item list rather than crashing on it.
const stepsCell = (row) => {
	const steps = Array.isArray(row.steps) ? row.steps : row.steps ? [row.steps] : [];
	return steps.length ? cell(orderedList(steps)) : cell(p(text("—")));
};

const expectedCell = (row) =>
	row.expectedResult ? cell(p(text(row.expectedResult))) : cell(p(text("—")));

const envCell = (data) => {
	if (!data) return cell(p(text("—")));
	const content = [];
	if (data.result) content.push(p(text(data.result)));
	if (data.note) content.push(p(text(data.note)));
	for (const file of data.media ?? []) content.push(thumb(file));
	if (!content.length) content.push(p(text("—")));
	return cell(...content);
};

const tableRows = perEnv
	? [
			{
				type: "tableRow",
				content: [
					header("TC"),
					header("Case"),
					header("Steps"),
					header("Expected result"),
					...envColumns.map((c) => header(c.header)),
				],
			},
			...(spec.rows ?? []).map((row) => ({
				type: "tableRow",
				content: [
					cell(p(text(row.tc, [{ type: "strong" }]))),
					caseCell(row),
					stepsCell(row),
					expectedCell(row),
					...envColumns.map((c) => envCell(row[c.key])),
				],
			})),
		]
	: [
			{
				type: "tableRow",
				content: [
					header("TC"),
					header("Case"),
					header("Steps"),
					header("Expected result"),
					header("Result"),
					header("Evidence"),
				],
			},
			...(spec.rows ?? []).map((row) => ({
				type: "tableRow",
				content: [
					cell(p(text(row.tc, [{ type: "strong" }]))),
					caseCell(row),
					stepsCell(row),
					expectedCell(row),
					cell(p(text(row.result ?? "—"))),
					cell(
						...((row.media ?? []).length
							? row.media.map(thumb)
							: [p(text(row.note ?? "—"))]),
					),
				],
			})),
		];

// Findings: plain-string entries become description-only rows, for back-compat
// with hand-written bundles.
const findings = (spec.findings ?? []).map((f) =>
	typeof f === "string" ? { title: "—", description: f } : f,
);
const findingsTable = {
	type: "table",
	attrs: { layout: "default" },
	content: [
		{
			type: "tableRow",
			content: [
				header("Finding"),
				header("Ticket"),
				header("Description"),
				header("How to replicate"),
				header("Evidence"),
			],
		},
		...findings.map((f) => ({
			type: "tableRow",
			content: [
				cell(p(text(f.title ?? "—", [{ type: "strong" }]))),
				cell(
					f.ticket
						? p(link(f.ticket, `${jiraBaseUrl()}/browse/${f.ticket}`))
						: p(text("—")),
				),
				cell(p(text(f.description ?? "—"))),
				cell(f.replicate?.length ? orderedList(f.replicate) : p(text("—"))),
				cell(...((f.media ?? []).length ? f.media.map(thumb) : [p(text("—"))])),
			],
		})),
	],
};

const body = {
	type: "doc",
	version: 1,
	content: [
		heading(3, spec.title ?? `Evidence — ${ticket}`),
		...(spec.intro ? [p(text(spec.intro))] : []),
		...(versionUnderTest
			? [p(text("Version under test: ", [{ type: "strong" }]), text(versionUnderTest))]
			: []),
		heading(4, "Test Scenario"),
		{ type: "table", attrs: { layout: "default" }, content: tableRows },
		...(findings.length ? [heading(4, "Findings"), findingsTable] : []),
		...(spec.links?.length
			? [
					{
						type: "bulletList",
						content: spec.links.map((l) => ({
							type: "listItem",
							content: [p(link(l.label, l.url))],
						})),
					},
				]
			: []),
		...(spec.footer ? [p(text(spec.footer))] : []),
	],
};

// ── Size guard ──────────────────────────────────────────────────────────────
const size = adfSizeReport(body, tableRows);
console.log(
	`  ADF ${size.bodyChars} chars — ${size.pct}% of the ${ADF_CHAR_LIMIT} limit ` +
		`(${size.rows} row(s) @ ~${size.perRow} chars/row)`,
);
if (size.over) {
	fail(
		`Comment is ${size.bodyChars - ADF_CHAR_LIMIT} chars over Jira's ${ADF_CHAR_LIMIT} ADF limit.\n` +
			`  ${size.rows} rows @ ~${size.perRow} chars/row + ${size.fixedChars} chars of heading/intro/findings.\n` +
			`  At most ~${size.fits} rows fit in one comment. Options:\n` +
			`    • split into parts of ≤${size.fits} rows, each with its own --rows file\n` +
			`    • drop an evidence column that carries only a note (~130 chars/row)\n` +
			`    • move "steps" into the linked Zephyr case (~390 chars/row)`,
	);
}
if (size.bodyChars > ADF_CHAR_LIMIT * 0.9) {
	console.warn(
		`⚠ ${size.pct}% of the ADF limit — roughly ${Math.floor(
			(ADF_CHAR_LIMIT - size.bodyChars) / Math.max(size.perRow, 1),
		)} more row(s) would break this comment.`,
	);
}

// ── Post ────────────────────────────────────────────────────────────────────
const layout = perEnv ? envColumns.map((c) => c.header).join("|") : "Result|Evidence";
if (dryRun) {
	console.log(
		`(dry-run) would ${commentId ? `update comment ${commentId}` : "create a comment"} on ${ticket}`,
	);
	console.log(
		`(dry-run) ${(spec.rows ?? []).length} row(s) [${layout}], ${findings.length} finding(s), ${neededFiles.length} media file(s)`,
	);
	console.log(JSON.stringify(body, null, 2));
	process.exit(0);
}

const endpoint = commentId
	? `/rest/api/3/issue/${encodeURIComponent(ticket)}/comment/${commentId}`
	: `/rest/api/3/issue/${encodeURIComponent(ticket)}/comment`;
const saved = await jiraSend(commentId ? "PUT" : "POST", endpoint, { body });
console.log(
	`✔ Comment ${commentId ? "updated" : "created"} (id ${saved.id}). View: ${issueUrl(ticket)}`,
);
