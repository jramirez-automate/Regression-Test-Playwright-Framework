import { test, expect } from "../../fixtures";
import { LoginPage, InventoryPage } from "../../pages";
import { credentials } from "../../utils";

/**
 * Authentication.
 *
 * Read this file as the shape of a spec in this suite: the describe carries a
 * ticket tag, every test states one criterion, and the assertions run against
 * things a user can see. No locator appears here — those live in the page
 * objects, which is what stops a markup change from touching ten specs.
 */
test.describe("Login", { tag: ["@smoke", "@PROJ-101"] }, () => {
	test("valid credentials land the user in the product catalogue", async ({
		page,
	}) => {
		const login = new LoginPage(page);
		const inventory = new InventoryPage(page);
		const { username, password } = credentials();

		await test.step("Sign in with the run's account", async () => {
			// A fresh context is used deliberately: this test is about the login
			// flow itself, so it must not start from the saved storage state.
			await page.context().clearCookies();
			await login.goto();
			await login.login(username, password);
		});

		await expect(inventory.title).toBeVisible();
		await expect(page).toHaveURL(/inventory/);
	});

	test("rejected credentials keep the user on the login page with a reason", async ({
		page,
	}) => {
		const login = new LoginPage(page);

		await page.context().clearCookies();
		await login.goto();
		await login.login("locked_out_user", credentials().password);

		// The criterion is that the user is TOLD why — "still on /" would pass
		// even if the app silently swallowed the attempt.
		expect(await login.errorText()).toMatch(/locked out/i);
		await expect(login.submitButton).toBeVisible();
	});
});
