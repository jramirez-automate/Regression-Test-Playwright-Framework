import { Locator, Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

/**
 * Login page.
 *
 * This is the one page object the framework itself depends on: `globalSetup`
 * drives it once per account to produce the saved storage state that every
 * other test starts from. Point it at your own login form and the rest of the
 * suite needs no changes.
 *
 * Selectors are written against the public demo app (saucedemo.com) so a fresh
 * clone runs green; swap them for yours when you adopt the framework.
 */
export class LoginPage extends BasePage {
	readonly usernameInput: Locator;
	readonly passwordInput: Locator;
	readonly submitButton: Locator;
	readonly errorMessage: Locator;

	constructor(page: Page) {
		super(page);
		this.usernameInput = page.getByPlaceholder("Username");
		this.passwordInput = page.getByPlaceholder("Password");
		this.submitButton = page.getByRole("button", { name: "Login" });
		// The demo app renders errors in a container with this test id; prefer a
		// role-based locator when your app exposes one (`role="alert"`).
		this.errorMessage = page.locator('[data-test="error"]');
	}

	async goto() {
		await super.goto("/");
		await expect(this.usernameInput).toBeVisible({ timeout: 15_000 });
	}

	async login(username: string, password: string) {
		await this.usernameInput.fill(username);
		await this.passwordInput.fill(password);
		await this.submitButton.click();
	}

	/**
	 * Log in and wait until the app is genuinely ready.
	 *
	 * Waiting on the URL alone is not enough: a client-rendered app changes the
	 * URL before it has rendered anything, so the storage state can be captured
	 * mid-boot with a half-written session.
	 */
	async loginAndWaitForApp(username: string, password: string) {
		await this.goto();
		await this.login(username, password);
		await this.page.waitForURL(/inventory/, { timeout: 30_000 });
		await expect(
			this.page.getByRole("button", { name: /open menu/i }),
		).toBeVisible({ timeout: 30_000 });
	}

	/** The visible validation message, for negative slices. */
	async errorText(): Promise<string> {
		await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
		return (await this.errorMessage.innerText()).trim();
	}
}
