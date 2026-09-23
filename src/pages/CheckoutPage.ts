import { Locator, Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export interface CheckoutDetails {
	firstName: string;
	lastName: string;
	postalCode: string;
}

/** Checkout: the details form, the overview, and the confirmation. */
export class CheckoutPage extends BasePage {
	readonly firstNameInput: Locator;
	readonly lastNameInput: Locator;
	readonly postalCodeInput: Locator;
	readonly continueButton: Locator;
	readonly finishButton: Locator;
	readonly errorMessage: Locator;
	readonly confirmationHeading: Locator;
	readonly totalLabel: Locator;

	constructor(page: Page) {
		super(page);
		this.firstNameInput = page.getByPlaceholder("First Name");
		this.lastNameInput = page.getByPlaceholder("Last Name");
		this.postalCodeInput = page.getByPlaceholder("Zip/Postal Code");
		this.continueButton = page.getByRole("button", { name: "Continue" });
		this.finishButton = page.getByRole("button", { name: "Finish" });
		this.errorMessage = page.locator('[data-test="error"]');
		this.confirmationHeading = page.getByRole("heading", {
			name: /thank you for your order/i,
		});
		this.totalLabel = page.locator('[data-test="total-label"]');
	}

	async fillDetails({ firstName, lastName, postalCode }: CheckoutDetails) {
		await this.firstNameInput.fill(firstName);
		await this.lastNameInput.fill(lastName);
		await this.postalCodeInput.fill(postalCode);
	}

	async continueToOverview() {
		await this.continueButton.click();
		await expect(this.finishButton).toBeVisible({ timeout: 15_000 });
	}

	async finish() {
		await this.finishButton.click();
		await expect(this.confirmationHeading).toBeVisible({ timeout: 15_000 });
	}

	/** The visible validation message, for negative slices. */
	async errorText(): Promise<string> {
		await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
		return (await this.errorMessage.innerText()).trim();
	}

	/** Order total as shown on the overview, e.g. `Total: $32.39` → 32.39. */
	async total(): Promise<number> {
		const text = await this.totalLabel.innerText();
		return Number(text.replace(/[^0-9.]/g, ""));
	}
}
