import { Locator, Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

/** Cart contents and the route onward to checkout. */
export class CartPage extends BasePage {
	readonly title: Locator;
	readonly checkoutButton: Locator;
	readonly continueShoppingButton: Locator;

	constructor(page: Page) {
		super(page);
		this.title = page.getByText("Your Cart", { exact: true });
		this.checkoutButton = page.getByRole("button", { name: "Checkout" });
		this.continueShoppingButton = page.getByRole("button", {
			name: /continue shopping/i,
		});
	}

	async gotoCart() {
		await super.goto("/cart.html");
		await expect(this.title).toBeVisible({ timeout: 15_000 });
	}

	row(name: string): Locator {
		return this.page
			.locator('[data-test="inventory-item"]')
			.filter({ hasText: name })
			.first();
	}

	async itemNames(): Promise<string[]> {
		const names = this.page.locator('[data-test="inventory-item-name"]');
		if ((await names.count()) === 0) return [];
		return (await names.allInnerTexts()).map((t) => t.trim());
	}

	/** Best-effort removal for cleanup — never throws. */
	async removeByName(name: string): Promise<boolean> {
		const remove = this.row(name).getByRole("button", { name: /remove/i });
		if (!(await remove.isVisible().catch(() => false))) return false;
		await remove.click().catch(() => undefined);
		return true;
	}

	async startCheckout() {
		await this.checkoutButton.click();
	}
}
