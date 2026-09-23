/**
 * confluence.mjs — page create/update plus attachment upload.
 *
 * Confluence has two live APIs and the pipeline needs both: v2 for pages (the
 * only one that exposes spaceId/parentId cleanly) and v1 for attachments (v2
 * has no upload endpoint). That split is the reason for the mixed URLs below.
 */
import fs from "node:fs";
import { fail, jiraBaseUrl } from "./config.mjs";
import { jiraAuthHeader } from "./jira.mjs";

const jsonHeaders = () => ({
	...jiraAuthHeader(),
	"Content-Type": "application/json",
	Accept: "application/json",
});

export async function findPage({ pageId, spaceId, title }) {
	if (pageId) {
		const res = await fetch(`${jiraBaseUrl()}/wiki/api/v2/pages/${pageId}`, {
			headers: jsonHeaders(),
		});
		if (!res.ok) fail(`Page lookup failed: HTTP ${res.status}`);
		return res.json();
	}
	const url = `${jiraBaseUrl()}/wiki/api/v2/pages?space-id=${spaceId}&title=${encodeURIComponent(title)}&status=current`;
	const res = await fetch(url, { headers: jsonHeaders() });
	if (!res.ok) fail(`Lookup failed: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const data = await res.json();
	return data.results?.[0] ?? null;
}

/**
 * Create the page empty first, then upload, then write the real body.
 *
 * Attachments can only be uploaded to a page that already exists, and the body
 * references them by filename — publishing the body first would render every
 * embed as a broken attachment until the second pass.
 */
export async function createStubPage({ spaceId, parentId, title, ticket }) {
	const res = await fetch(`${jiraBaseUrl()}/wiki/api/v2/pages`, {
		method: "POST",
		headers: jsonHeaders(),
		body: JSON.stringify({
			spaceId,
			parentId,
			title,
			status: "current",
			body: {
				representation: "storage",
				value: `<p>Uploading evidence for ${ticket}…</p>`,
			},
		}),
	});
	if (!res.ok) fail(`Create failed: HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
	const page = await res.json();
	console.log(`✔ Created page ${page.id} (stub — evidence next)`);
	return page;
}

export async function updatePageBody(page, { spaceId, parentId, title, body, message, sendParentId }) {
	const res = await fetch(`${jiraBaseUrl()}/wiki/api/v2/pages/${page.id}`, {
		method: "PUT",
		headers: jsonHeaders(),
		body: JSON.stringify({
			id: page.id,
			status: "current",
			title,
			spaceId,
			// A folder parent rejects parentId on update while a page parent
			// accepts it, so this is configured per target rather than assumed.
			...(sendParentId ? { parentId } : {}),
			body: { representation: "storage", value: body },
			version: { number: page.version.number + 1, message },
		}),
	});
	if (!res.ok) fail(`Update failed: HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
	return res.json();
}

/** Upload, or replace the data of an existing attachment with the same name. */
export async function uploadPageAttachment(pageId, name, filePath) {
	const post = (url, body) =>
		fetch(url, {
			method: "POST",
			headers: { ...jiraAuthHeader(), "X-Atlassian-Token": "no-check" },
			body,
		});

	const form = new FormData();
	form.append("file", new Blob([fs.readFileSync(filePath)]), name);
	const res = await post(
		`${jiraBaseUrl()}/wiki/rest/api/content/${pageId}/child/attachment`,
		form,
	);
	if (res.ok) {
		console.log(`  ✔ ${name}`);
		return;
	}

	const text = await res.text();
	if (text.includes("already exists") || res.status === 400) {
		const listRes = await fetch(
			`${jiraBaseUrl()}/wiki/rest/api/content/${pageId}/child/attachment?filename=${encodeURIComponent(name)}`,
			{ headers: jsonHeaders() },
		);
		if (listRes.ok) {
			const attId = (await listRes.json()).results?.[0]?.id;
			if (attId) {
				const form2 = new FormData();
				form2.append("file", new Blob([fs.readFileSync(filePath)]), name);
				const upRes = await post(
					`${jiraBaseUrl()}/wiki/rest/api/content/${pageId}/child/attachment/${attId}/data`,
					form2,
				);
				if (upRes.ok) {
					console.log(`  ↻ ${name}`);
					return;
				}
			}
		}
	}
	console.warn(`  ⚠ ${name}: HTTP ${res.status} — ${text.slice(0, 120)}`);
}

export async function listPageAttachments(pageId) {
	const out = [];
	for (let start = 0; ; start += 100) {
		const res = await fetch(
			`${jiraBaseUrl()}/wiki/rest/api/content/${pageId}/child/attachment?limit=100&start=${start}`,
			{ headers: jsonHeaders() },
		);
		if (!res.ok) fail(`Listing attachments: HTTP ${res.status}`);
		const data = await res.json();
		out.push(...(data.results ?? []));
		if ((data.results ?? []).length < 100) break;
	}
	return out;
}

export async function deletePageAttachment(attachmentId) {
	const res = await fetch(`${jiraBaseUrl()}/wiki/rest/api/content/${attachmentId}`, {
		method: "DELETE",
		headers: jsonHeaders(),
	});
	return res.ok;
}

export function pageWebUrl(page, spaceKey) {
	return page._links?.webui
		? `${jiraBaseUrl()}/wiki${page._links.webui}`
		: `${jiraBaseUrl()}/wiki/spaces/${spaceKey}/pages/${page.id}`;
}
