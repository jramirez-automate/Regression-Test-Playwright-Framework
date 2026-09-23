import { test, expect } from "../../fixtures";
import { InventoryPage } from "../../pages";

/**
 * Product catalogue.
 *
 * The sort test is the one worth studying: it asserts the ORDER of the prices
 * the page rendered, not that a `<select>` holds a value. A test that only
 * checks the control's value passes even when sorting is completely broken —
 * it verifies the widget, not the feature.
 */
test.describe("Product catalogue", { tag: ["@smoke", "@PROJ-102"] }, () => {
	test("catalogue lists products for a signed-in user", async ({ page }) => {
		const inventory = new InventoryPage(page);
		await inventory.gotoList();

		const names = await inventory.itemNames();
		expect(names.length).toBeGreaterThan(0);
		expect(names).toContain("Sauce Labs Backpack");
	});

	test("sorting by price low to high reorders the listed prices", async ({
		page,
	}) => {
		const inventory = new InventoryPage(page);
		await inventory.gotoList();

		await inventory.sortBy("Price (low to high)");

		const prices = await inventory.itemPrices();
		expect(prices.length).toBeGreaterThan(1);
		// Compare against an independently sorted copy rather than re-deriving the
		// expectation from the same reading — an assertion that recomputes the
		// value the way the page did can never disagree with it.
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
	});

	test("sorting by name Z to A reverses the listed names", async ({ page }) => {
		const inventory = new InventoryPage(page);
		await inventory.gotoList();

		await inventory.sortBy("Name (Z to A)");

		const names = await inventory.itemNames();
		expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
	});
});
