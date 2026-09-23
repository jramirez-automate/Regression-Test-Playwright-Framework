import { test, expect } from "../../fixtures";
import { CartPage, CheckoutPage, InventoryPage } from "../../pages";
import { CleanupRegistry, personFixture } from "../../utils";

/**
 * Checkout.
 *
 * This file is the worked example of the data-discipline contract: state is
 * created with generated names, registered for teardown the moment it is
 * created, and removed LIFO in `afterEach`. The cart is modest state, but the
 * pattern is the point — on a real app these would be orders, users or files,
 * and a suite without it leaves a trail that eventually breaks its own runs.
 */
test.describe("Checkout", { tag: "@PROJ-103" }, () => {
	const cleanup = new CleanupRegistry();

	test.afterEach(async ({ page }) => {
		await cleanup.run(page);
	});

	test("a completed order confirms back to the shopper", async ({ page }) => {
		const inventory = new InventoryPage(page);
		const cart = new CartPage(page);
		const checkout = new CheckoutPage(page);
		const shopper = personFixture("Buyer", "Test");
		const product = "Sauce Labs Backpack";

		await test.step("Add a product to the cart", async () => {
			await inventory.gotoList();
			await inventory.addToCart(product);
			// Registered immediately, not at the end: a test that fails midway
			// still has to leave the environment as it found it.
			cleanup.add(async () => {
				await cart.gotoCart();
				await cart.removeByName(product);
			});
		});

		expect(await inventory.cartCount()).toBe(1);

		await test.step("Check out with generated shopper details", async () => {
			await cart.gotoCart();
			await cart.startCheckout();
			await checkout.fillDetails({
				firstName: shopper.firstName,
				lastName: shopper.lastName,
				postalCode: "4000",
			});
			await checkout.continueToOverview();
		});

		await test.step("Confirm the order", async () => {
			await checkout.finish();
		});

		await expect(checkout.confirmationHeading).toBeVisible();
		// The order completed, so the cart is empty and the cleanup task above
		// becomes a no-op — which is exactly why it must never throw.
		expect(await inventory.cartCount()).toBe(0);
	});

	test("checkout refuses to continue without a postcode", async ({ page }) => {
		const inventory = new InventoryPage(page);
		const cart = new CartPage(page);
		const checkout = new CheckoutPage(page);
		const shopper = personFixture("Buyer", "Test");
		const product = "Sauce Labs Bike Light";

		await inventory.gotoList();
		await inventory.addToCart(product);
		cleanup.add(async () => {
			await cart.gotoCart();
			await cart.removeByName(product);
		});

		await cart.gotoCart();
		await cart.startCheckout();
		await checkout.fillDetails({
			firstName: shopper.firstName,
			lastName: shopper.lastName,
			postalCode: "",
		});
		await checkout.continueButton.click();

		expect(await checkout.errorText()).toMatch(/postal code is required/i);
		// The negative half of the criterion: rejected means it did NOT proceed.
		await expect(checkout.finishButton).toBeHidden();
	});
});
