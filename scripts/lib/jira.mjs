/**
 * jira.mjs — the Jira Cloud REST v3 calls the evidence pipeline needs.
 *
 * Why REST and not an MCP/integration: uploading an attachment and posting a
 * comment with INLINE media both require calls that markdown-level integrations
 * cannot make. Inline thumbnails need ADF `media` nodes carrying each
 * attachment's media-services UUID, and that UUID is only discoverable from the
 * attachment content endpoint's redirect.
 */
import fs from "node:fs";
import { fail, jiraBaseUrl, loadPublishEnv } from "./config.mjs";

export function jiraAuthHeader() {
	loadPublishEnv();
	const email = (process.env.JIRA_EMAIL ?? "").trim();
	const token = (process.env.JIRA_API_TOKEN ?? "").trim();
	if (!email || !token) {
		fail(
			"Missing JIRA_EMAIL / JIRA_API_TOKEN in .env.publish (gitignored). " +
				"Create a token at https://id.atlassian.com/manage-profile/security/api-tokens",
		);
	}
	return {
		Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
	};
}

export async function jiraGet(endpoint) {
	const res = await fetch(`${jiraBaseUrl()}${endpoint}`, {
		headers: { ...jiraAuthHeader(), Accept: "application/json" },
	});
	if (!res.ok) fail(`GET ${endpoint} → HTTP ${res.status}`);
	return res.json();
}

export async function jiraSend(method, endpoint, body) {
	const res = await fetch(`${jiraBaseUrl()}${endpoint}`, {
		method,
		headers: {
			...jiraAuthHeader(),
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const text = await res.text();
	if (!res.ok) {
		fail(`${method} ${endpoint} → HTTP ${res.status}: ${text.slice(0, 400)}`);
	}
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}

export function issueUrl(ticket) {
	return `${jiraBaseUrl()}/browse/${ticket}`;
}

/** Content-Type matters: a Blob with no type uploads as octet-stream, and Jira then renders "Preview unavailable" instead of a video player. */
export function mimeFor(name) {
	if (/\.webm$/i.test(name)) return "video/webm";
	if (/\.mp4$/i.test(name)) return "video/mp4";
	if (/\.png$/i.test(name)) return "image/png";
	if (/\.jpe?g$/i.test(name)) return "image/jpeg";
	if (/\.gif$/i.test(name)) return "image/gif";
	if (/\.md$/i.test(name)) return "text/markdown";
	if (/\.json$/i.test(name)) return "application/json";
	if (/\.zip$/i.test(name)) return "application/zip";
	return "application/octet-stream";
}

export async function uploadAttachment(ticket, name, filePath) {
	const form = new FormData();
	form.append(
		"file",
		new Blob([fs.readFileSync(filePath)], { type: mimeFor(name) }),
		name,
	);
	const res = await fetch(
		`${jiraBaseUrl()}/rest/api/3/issue/${encodeURIComponent(ticket)}/attachments`,
		{
			method: "POST",
			headers: { ...jiraAuthHeader(), "X-Atlassian-Token": "no-check" },
			body: form,
		},
	);
	if (!res.ok) {
		return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
	}
	const [attachment] = await res.json();
	return {
		ok: true,
		id: attachment?.id,
		url:
			attachment?.content ??
			`${jiraBaseUrl()}/rest/api/3/attachment/content/${attachment?.id ?? ""}`,
	};
}

/**
 * filename → attachment, preferring the NEWEST upload of a repeated filename.
 * Re-attaching after a recapture leaves duplicates, and the API's order is not
 * guaranteed, so a naive last-wins map can pin a comment to the stale file.
 */
export async function attachmentsByFilename(ticket) {
	const issue = await jiraGet(
		`/rest/api/3/issue/${encodeURIComponent(ticket)}?fields=attachment`,
	);
	const byName = new Map();
	for (const a of issue.fields?.attachment ?? []) {
		const prev = byName.get(a.filename);
		if (!prev || Date.parse(a.created) >= Date.parse(prev.created)) {
			byName.set(a.filename, a);
		}
	}
	return byName;
}

/**
 * Media-services UUID for an attachment — the id an ADF `media` node needs.
 * The content endpoint 303-redirects to `…/file/<uuid>/binary`, so the UUID is
 * read off the Location header rather than any documented field.
 */
export async function mediaUuid(attachmentId) {
	const res = await fetch(
		`${jiraBaseUrl()}/rest/api/3/attachment/content/${attachmentId}`,
		{ headers: jiraAuthHeader(), redirect: "manual" },
	);
	const location = res.headers.get("location") ?? "";
	const uuid = location.match(/\/file\/([0-9a-f-]{36})/i)?.[1];
	if (!uuid) {
		fail(`No media UUID in redirect for attachment ${attachmentId} (HTTP ${res.status})`);
	}
	return uuid;
}

export async function fetchAllComments(ticket) {
	const comments = [];
	for (let startAt = 0; ; ) {
		const data = await jiraGet(
			`/rest/api/3/issue/${encodeURIComponent(ticket)}/comment?startAt=${startAt}&maxResults=100`,
		);
		comments.push(...(data.comments ?? []));
		startAt += data.comments?.length ?? 0;
		if (startAt >= (data.total ?? 0) || !(data.comments?.length ?? 0)) break;
	}
	return comments;
}

/**
 * Link a bug to a parent issue so it lands under the parent's **Bug** section.
 *
 * Direction is not cosmetic: the link type reads one way as "Bug" and the other
 * as "is a Bug on". The parent must be `inwardIssue` and the bug `outwardIssue`,
 * or the bug is filed as a different relationship and never shows up where
 * anyone looks for it.
 */
export async function linkBugToParent(parentKey, bugKey, linkType = "Bug") {
	return jiraSend("POST", "/rest/api/3/issueLink", {
		type: { name: linkType },
		inwardIssue: { key: parentKey },
		outwardIssue: { key: bugKey },
	});
}
