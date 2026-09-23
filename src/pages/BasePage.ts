import { Page, Locator, expect } from "@playwright/test";

export interface DismissDialogOptions {
	/** Once this locator is visible, stop polling — the interruption is gone. */
	waitFor?: Locator;
	/** Overall time budget for the poll loop. */
	timeout?: number;
	/** Cap on dismiss clicks, for multi-step tours. */
	maxSteps?: number;
}

/**
 * Base page object — every page-specific class extends this.
 *
 * What belongs here: behaviour every screen shares (navigation, load waiting,
 * dismissing app-wide interruptions). What does not: anything that names a
 * particular screen's controls. When a helper here starts needing a page's
 * vocabulary, it belongs in that page object instead.
 */
export abstract class BasePage {
	readonly page: Page;
	/** Full-page spinner. Override the selector in a subclass when yours differs. */
	readonly loadingSpinner: Locator;

	constructor(page: Page) {
		this.page = page;
		this.loadingSpinner = page.locator(
			'.loading, .spinner, [aria-busy="true"]',
		);
	}

	async goto(path = "/") {
		await this.page.goto(path);
	}

	/** Wait for any full-page loading spinner to disappear. */
	async waitForPageLoad() {
		await this.loadingSpinner
			.first()
			.waitFor({ state: "hidden", timeout: 15_000 })
			.catch(() => undefined);
	}

	async screenshot(name: string) {
		await this.page.screenshot({ path: `src/test-results/${name}.png` });
	}

	/** Visible level-1 heading matching `name` — the usual smoke assertion. */
	pageH1(name: string | RegExp): Locator {
		return this.page
			.getByRole("heading", { level: 1 })
			.filter({ hasText: name })
			.filter({ visible: true })
			.first();
	}

	/**
	 * Dismiss a first-visit walkthrough, cookie banner or announcement modal.
	 *
	 * These are per-account and per-browser, so they often do not render at all
	 * on a seeded automation account — this is a safe no-op in that case. It
	 * still matters: an `aria-hidden` backdrop silently blocks every locator
	 * underneath it, so a test that ignores the banner fails on a selector that
	 * is perfectly correct.
	 *
	 * Pass `waitFor` (the locator you actually need next) to bound the poll:
	 * stop as soon as it is visible, whether or not an interruption appeared.
	 */
	async dismissBlockingDialog({
		waitFor,
		timeout = 15_000,
		maxSteps = 6,
	}: DismissDialogOptions = {}) {
		const dialog = this.page
			.locator('[role="dialog"], .modal, .cookie-banner')
			.filter({ visible: true })
			.first();
		const namedButton = dialog.getByRole("button", {
			name: /^(got it|next|finish|skip|close|ok|accept|dismiss)\b/i,
		});

		// Two independent budgets. The OUTER poll spans the whole `timeout`,
		// because the dialog can take a while to mount on a slow environment;
		// `maxSteps` only caps how many dismiss CLICKS we are willing to make,
		// as a runaway-tour safety valve.
		const deadline = Date.now() + timeout;
		let clicks = 0;
		while (Date.now() < deadline) {
			if (waitFor && (await waitFor.isVisible().catch(() => false))) return;

			if (!(await dialog.isVisible().catch(() => false))) {
				if (!waitFor) return;
				await this.page.waitForTimeout(300);
				continue;
			}
			if (clicks >= maxSteps) {
				// Escape closes most dialogs, so the backdrop clears even when no
				// button matched the names above.
				await this.page.keyboard.press("Escape").catch(() => undefined);
				await this.page.waitForTimeout(300);
				break;
			}
			const button = namedButton.first();
			if (!(await button.isVisible().catch(() => false))) {
				// Shell mounted before its buttons — keep polling rather than
				// giving up with most of the budget unspent.
				await this.page.waitForTimeout(300);
				continue;
			}
			await button.click();
			clicks += 1;
			await dialog
				.waitFor({ state: "hidden", timeout: 3_000 })
				.catch(() => undefined);
		}

		if (waitFor) {
			const remaining = Math.max(deadline - Date.now(), 0);
			// Always leave a real budget after the poll loop, never the 1s that
			// happens to be left over.
			await waitFor.waitFor({
				state: "visible",
				timeout: Math.max(remaining, 15_000),
			});
		}
	}

	/** Assert an element is both present and inside the viewport. */
	async expectInViewport(target: Locator) {
		await expect(target).toBeVisible({ timeout: 15_000 });
		await target.scrollIntoViewIfNeeded();
	}
}
