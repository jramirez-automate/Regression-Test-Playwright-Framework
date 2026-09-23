import { Locator, Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export type SortOption =
	| "Name (A to Z)"
	| "Name (Z to A)"
	| "Price (low to high)"
	| "Price (high to low)";

/**
 * Product catalogue — the list, its sort control, and add/remove to cart.
 *
 * Worth reading as an example of the seam rule: every method takes a user's
 * vocabulary (a product NAME, a sort option's visible LABEL) and returns an
 * observable outcome. No test ever passes this class a CSS selector or an
 * index, so a markup change is fixed here once instead of across every spec.
 */
export class InventoryPage extends BasePage {
	readonly title: Locator;
	readonly sortSelect: Locator;
	readonly cartLink: Locator;
	readonly cartBadge: Locator;
	readonly menuButton: Locator;

	constructor(page: Page) {
		super(page);
		this.title = page.getByText("Products", { exact: true });
		this.sortSelect = page.locator('[data-test="product-sort-container"]');
		this.cartLink = page.locator('[data-test="shopping-cart-link"]');
		this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
		this.menuButton = page.getByRole("button", { name: /open menu/i });
	}

	async gotoList() {
		await super.goto("/inventory.html");
		await expect(this.title).toBeVisible({ timeout: 15_000 });
	}

	/** One product card, located by its visible name. */
	item(name: string): Locator {
		return this.page
			.locator('[data-test="inventory-item"]')
			.filter({ hasText: name })
			.first();
	}

	async itemNames(): Promise<string[]> {
		await expect(
			this.page.locator('[data-test="inventory-item-name"]').first(),
		).toBeVisible();
		return (
			await this.page
				.locator('[data-test="inventory-item-name"]')
				.allInnerTexts()
		).map((t) => t.trim());
	}

	/** Prices in listed order, as numbers, so a sort assertion can compare them. */
	async itemPrices(): Promise<number[]> {
		const texts = await this.page
			.locator('[data-test="inventory-item-price"]')
			.allInnerTexts();
		return texts.map((t) => Number(t.replace(/[^0-9.]/g, "")));
	}

	async sortBy(option: SortOption) {
		await this.sortSelect.selectOption({ label: option });
		// The list re-renders in place, so there is no navigation to await. Wait
		// for the control to report the new value instead of a fixed timeout.
		await expect(this.sortSelect).toHaveValue(/.+/);
	}

	async addToCart(name: string) {
		await this.item(name)
			.getByRole("button", { name: /add to cart/i })
			.click();
		await expect(
			this.item(name).getByRole("button", { name: /remove/i }),
		).toBeVisible({ timeout: 10_000 });
	}

	/** Best-effort removal for cleanup — never throws. */
	async removeFromCart(name: string): Promise<boolean> {
		const remove = this.item(name).getByRole("button", { name: /remove/i });
		if (!(await remove.isVisible().catch(() => false))) return false;
		await remove.click().catch(() => undefined);
		return true;
	}

	/** Items currently in the cart, read from the header badge. */
	async cartCount(): Promise<number> {
		if (!(await this.cartBadge.isVisible().catch(() => false))) return 0;
		return Number((await this.cartBadge.innerText()).trim()) || 0;
	}

	async openCart() {
		await this.cartLink.click();
	}
}
