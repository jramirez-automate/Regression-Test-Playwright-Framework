/**
 * adf.mjs — Atlassian Document Format builders for the evidence comment.
 *
 * Jira comments posted as markdown can only ever produce LINKS to attachments.
 * Real inline thumbnails and playable videos require ADF `media` nodes, which
 * is why the pipeline assembles the document by hand instead of handing Jira a
 * string.
 */

export const text = (t, marks) => ({
	type: "text",
	text: String(t ?? ""),
	...(marks ? { marks } : {}),
});
export const p = (...content) => ({ type: "paragraph", content });
export const heading = (level, t) => ({
	type: "heading",
	attrs: { level },
	content: [text(t)],
});
export const cell = (...content) => ({ type: "tableCell", attrs: {}, content });
export const header = (label) => ({
	type: "tableHeader",
	attrs: {},
	content: [p(text(label, [{ type: "strong" }]))],
});
export const orderedList = (items) => ({
	type: "orderedList",
	attrs: { order: 1 },
	content: items.map((item) => ({ type: "listItem", content: [p(text(item))] })),
});
export const link = (label, href) =>
	text(label, [{ type: "link", attrs: { href } }]);

/**
 * One media node. `align-start`, not centre: a centred thumbnail sits inside a
 * full-width bounding box and leaves a large blank gutter beside a narrow image.
 * Videos carry explicit dimensions so Media Services picks player chrome rather
 * than rendering a still.
 */
export const mediaThumb = (filename, uuidByFilename) => {
	const isVideo = /\.(webm|mp4|mov)$/i.test(filename);
	return {
		type: "mediaSingle",
		attrs: { layout: "align-start" },
		content: [
			{
				type: "media",
				attrs: {
					type: "file",
					id: uuidByFilename.get(filename),
					collection: "",
					...(isVideo ? { width: 1920, height: 1080 } : {}),
				},
			},
		],
	};
};

/** Every media filename a rows spec references, across rows, env cells and findings. */
export function mediaFromRows(spec) {
	const names = new Set();
	const take = (list) => {
		for (const item of list ?? []) {
			if (typeof item === "string") names.add(item);
			else if (item && typeof item === "object" && Array.isArray(item.media)) {
				for (const m of item.media) if (typeof m === "string") names.add(m);
			}
		}
	};
	for (const row of spec.rows ?? []) {
		take(row.media);
		for (const key of Object.keys(row)) {
			const value = row[key];
			if (value && typeof value === "object" && Array.isArray(value.media)) {
				take(value.media);
			}
		}
	}
	for (const finding of spec.findings ?? []) {
		if (finding && typeof finding === "object") take(finding.media);
	}
	return names;
}

/**
 * Jira Cloud rejects a comment over 32,767 characters and measures that against
 * the whole ADF JSON — node types, attrs and media UUIDs included, not the
 * visible text. A TC row with steps, a screenshot and a video costs roughly
 * 1,700 characters, so the real ceiling is around 17 rows. Reporting the
 * arithmetic beats taking an opaque HTTP 400 after a long upload.
 */
export const ADF_CHAR_LIMIT = 32767;

export function adfSizeReport(body, tableRows) {
	const rowChars = tableRows.slice(1).map((r) => JSON.stringify(r).length);
	const perRow = rowChars.length
		? Math.round(rowChars.reduce((a, b) => a + b, 0) / rowChars.length)
		: 0;
	const bodyChars = JSON.stringify(body).length;
	const fixedChars = bodyChars - rowChars.reduce((a, b) => a + b, 0);
	return {
		bodyChars,
		perRow,
		rows: rowChars.length,
		fixedChars,
		pct: Math.round((bodyChars / ADF_CHAR_LIMIT) * 100),
		over: bodyChars > ADF_CHAR_LIMIT,
		fits: perRow
			? Math.max(1, Math.floor((ADF_CHAR_LIMIT - fixedChars) / perRow))
			: Infinity,
	};
}
