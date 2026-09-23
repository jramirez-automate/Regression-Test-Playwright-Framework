#!/usr/bin/env node
/**
 * Post a "testing passed" message to a Microsoft Teams webhook.
 *
 *   TICKET=PROJ-123 ENV=prod npm run notify:teams
 *   TICKET=PROJ-123 ENV=prod npm run notify:teams -- --dry-run
 *   TICKET=PROJ-123 ENV=prod npm run notify:teams -- \
 *     --evidence-url "https://your-org.atlassian.net/browse/PROJ-123?focusedCommentId=123" \
 *     --test-plan-url "https://your-org.atlassian.net/wiki/…"
 *
 * `ENV` must cover every environment listed in publish.config.json →
 * teams.requiredEnvs. The gate exists because a pass on a lower environment is
 * not the thing a channel of non-testers should be told about, and a retracted
 * announcement costs more trust than a late one.
 *
 * Formats:
 *   simple   (default) flat JSON with `html` — Power Automate "Post message"
 *   card     AdaptiveCard root only — "Post card" actions
 *   envelope Teams message wrapper around an AdaptiveCard
 *
 * Template: templates/teams-notification.json ({{TOKEN}} placeholders).
 * Credentials: .env.publish — TEAMS_WEBHOOK_URL, plus JIRA_* to resolve the
 * issue summary and your display name.
 */
import fs from "node:fs";
import path from "node:path";
import {
	config,
	fail,
	flagValue,
	jiraBaseUrl,
	loadPublishEnv,
	requireTicket,
	root,
} from "./lib/config.mjs";
import { jiraGet } from "./lib/jira.mjs";

loadPublishEnv();

const argv = process.argv.slice(2);
const ticket = requireTicket();
const dryRun = argv.includes("--dry-run");
const settings = config().teams ?? {};
const webhook = (process.env.TEAMS_WEBHOOK_URL ?? "").trim();

const envRaw = (process.env.ENV ?? process.env.TEST_ENV ?? "").trim();
const envs = envRaw.split(",").map((e) => e.trim()).filter(Boolean);
const required = settings.requiredEnvs ?? [];
const missing = required.filter((r) => !envs.includes(r));
if (missing.length) {
	fail(
		`ENV="${envRaw || "(unset)"}" does not cover the required env(s): ${required.join(", ")}. ` +
			`Pass ENV=${required.join(",")} once those runs are green.`,
	);
}

const evidenceUrl = flagValue(argv, "--evidence-url") ?? process.env.TEAMS_EVIDENCE_URL ?? "";
const testPlanUrl = flagValue(argv, "--test-plan-url") ?? process.env.TEAMS_TEST_PLAN_URL ?? "";
const summaryOverride = flagValue(argv, "--summary") ?? "";
const testerOverride = flagValue(argv, "--tester") ?? "";
const format = (flagValue(argv, "--format") ?? settings.format ?? "simple").toLowerCase();

/** Teams renders the payload as HTML, and a stray tag in a Jira summary breaks the card. */
const escapeHtml = (s) =>
	String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
const sanitize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const issue = summaryOverride
	? null
	: await jiraGet(`/rest/api/3/issue/${encodeURIComponent(ticket)}?fields=summary`).catch(
			() => null,
		);
const me = testerOverride ? null : await jiraGet("/rest/api/3/myself").catch(() => null);

const values = {
	TICKET: ticket,
	SUMMARY: sanitize(summaryOverride || issue?.fields?.summary || ticket),
	ENV: envs.join(" + "),
	DATE: new Date().toISOString().slice(0, 10),
	TESTER: sanitize(testerOverride || me?.displayName || process.env.JIRA_EMAIL || "QA"),
	JIRA_URL: `${jiraBaseUrl()}/browse/${ticket}`,
	EVIDENCE_URL: evidenceUrl,
	TEST_PLAN_URL: testPlanUrl,
};

/** Walk a cloned template replacing {{TOKEN}} strings in place. */
function substitute(node, map) {
	if (typeof node === "string") {
		return node.replace(/\{\{(\w+)\}\}/g, (_, key) =>
			Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : `{{${key}}}`,
		);
	}
	if (Array.isArray(node)) return node.map((item) => substitute(item, map));
	if (node && typeof node === "object") {
		return Object.fromEntries(
			Object.entries(node).map(([k, v]) => [k, substitute(v, map)]),
		);
	}
	return node;
}

const templatePath = path.join(root, "templates", "teams-notification.json");
if (!fs.existsSync(templatePath)) fail(`Template not found: ${templatePath}`);
const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const card = substitute(structuredClone(template), values);

let payload;
if (format === "simple") {
	const links = [`<a href="${escapeHtml(values.JIRA_URL)}">Open in Jira</a>`];
	if (evidenceUrl) links.push(`<a href="${escapeHtml(evidenceUrl)}">Evidence</a>`);
	if (testPlanUrl) links.push(`<a href="${escapeHtml(testPlanUrl)}">Test plan</a>`);
	payload = {
		title: `✅ ${values.TICKET} passed testing`,
		html:
			`<p><strong>${escapeHtml(values.TICKET)}</strong> — ${escapeHtml(values.SUMMARY)}</p>` +
			`<p>Environment: ${escapeHtml(values.ENV)}<br/>Tested by: ${escapeHtml(values.TESTER)} on ${values.DATE}</p>` +
			`<p style="margin:12px 0 0 0">${links.join(" · ")}</p>`,
	};
} else if (format === "card") {
	payload = card;
} else {
	payload = {
		type: "message",
		attachments: [
			{
				contentType: "application/vnd.microsoft.card.adaptive",
				contentUrl: null,
				content: card,
			},
		],
	};
}

if (dryRun) {
	console.log(`(dry-run) format=${format}, env=${values.ENV}`);
	console.log(JSON.stringify(payload, null, 2));
	process.exit(0);
}

if (!webhook) {
	console.log("Teams: skipped (TEAMS_WEBHOOK_URL unset in .env.publish)");
	process.exit(0);
}

const res = await fetch(webhook, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(payload),
});
if (!res.ok) fail(`Teams webhook → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
console.log(`✔ Teams notified for ${ticket} (${values.ENV}).`);
