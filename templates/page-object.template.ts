/**
 * PAGE OBJECT TEMPLATE.
 *
 * Copy to src/pages/<Feature>Page.ts, extend BasePage, and export it from
 * src/pages/index.ts.
 *
 * The contract: methods take a user's vocabulary (a NAME, a visible LABEL) and
 * return observable outcomes. Raw locators live in here and nowhere else — the
 * moment a spec contains a CSS selector, a markup change becomes a sweep across
 * the suite instead of a one-line fix here.
 */
import { Locator, Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";
// import { waitForModalDetachedThenToast } from "../utils/interactions";

export class FeaturePage extends BasePage {
	readonly createModal: Locator;
	readonly createdToast: Locator;

	constructor(page: Page) {
		super(page);
		// Scope modal locators to the dialog AND its heading: apps commonly keep
		// several dialogs mounted, and an unscoped `getByRole("dialog")` will
		// happily resolve to the wrong one.
		this.createModal = page.getByRole("dialog");
		this.createdToast = page.getByText(/created/i);
	}

	/** Navigate by deep link, then record the route in the APP-MAP Navigation index. */
	async gotoList() {
		await this.goto("/<route>");
		await this.waitForPageLoad();
	}

	/** One row, located by its visible name. */
	row(name: string): Locator {
		return this.page.getByRole("row").filter({ hasText: name }).first();
	}

	async create(_name: string) {
		// TODO: open the create modal, fill it, submit, then assert the app's
		// success sequence — modal detached FIRST, then the toast:
		// await waitForModalDetachedThenToast({
		// 	modal: this.createModal,
		// 	toast: this.createdToast,
		// });
		await expect(this.createModal).toBeHidden();
	}

	/** Best-effort cleanup by name — NEVER throws, or it masks the real failure. */
	async deleteByName(_name: string): Promise<boolean> {
		// TODO: search → open the row's actions menu → confirm delete.
		// Return whether a deletion actually happened.
		return false;
	}
}
