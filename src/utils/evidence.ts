import type { Locator, Page, TestInfo } from "@playwright/test";

/**
 * evidence.ts — capture the frame that proves the criterion.
 *
 * Playwright's end-of-test screenshot is the final viewport, so a criterion
 * proven inside a dialog, an inline error or an open dropdown leaves no trace
 * once the test dismisses it. Those runs publish a blank page as their
 * "evidence", which is worse than no evidence: it looks like proof. Attach the
 * frame while the subject is still on screen.
 *
 * Pass `test.info()` from the spec rather than importing `test` here, so this
 * module stays independent of the fixtures file.
 */
export async function attachSubject(page: Page, info: TestInfo): Promise<void> {
	await info.attach("screenshot", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
}

/**
 * A padded close-up around one control, for criteria whose subject is an
 * icon-only button that a full-viewport frame renders too small to read.
 */
export async function attachCloseUp(
	page: Page,
	info: TestInfo,
	target: Locator,
	pad = 200,
): Promise<void> {
	const box = await target.boundingBox();
	if (!box) {
		await attachSubject(page, info);
		return;
	}
	const view = page.viewportSize() ?? { width: 1920, height: 1080 };
	const x = Math.max(0, box.x - pad);
	const y = Math.max(0, box.y - pad);
	await info.attach("screenshot", {
		body: await page.screenshot({
			clip: {
				x,
				y,
				width: Math.min(box.width + pad * 2, view.width - x),
				height: Math.min(box.height + pad * 2, view.height - y),
			},
		}),
		contentType: "image/png",
	});
}

/**
 * Two frames covering a dropdown taller than the container clipping it.
 *
 * A viewport-anchored menu inside a card that clips it can only ever paint part
 * of itself, and scrolling changes which part. Anchoring on the first and then
 * the last item yields frames that together show every entry — the only honest
 * way to evidence that a given item is ABSENT from a menu.
 */
export async function attachClippedMenu(
	page: Page,
	info: TestInfo,
	first: Locator,
	last: Locator,
): Promise<void> {
	await first.scrollIntoViewIfNeeded();
	await attachSubject(page, info);
	await last.scrollIntoViewIfNeeded();
	await attachSubject(page, info);
}
