/**
 * Stable seed data — records that already exist in the environment and that
 * tests read but never create or delete.
 *
 * The distinction matters. Anything a test CREATES gets a generated name from
 * `e2eName()` and is torn down in `afterEach`. Anything a test merely reads —
 * a seeded account, a reference product, a fixture file — belongs here, where
 * it is named once instead of being retyped as a string literal in nine specs.
 *
 * Keep the values themselves out of the code when they differ per environment:
 * read them from `.env.<TEST_ENV>` and export the accessor, not the constant.
 */

/** Products the demo environment always ships with. */
export const SEED_PRODUCTS = {
	backpack: "Sauce Labs Backpack",
	bikeLight: "Sauce Labs Bike Light",
	tShirt: "Sauce Labs Bolt T-Shirt",
} as const;

/** Accounts with deliberately broken behaviour, for negative slices. */
export const SEED_ACCOUNTS = {
	lockedOut: "locked_out_user",
	problem: "problem_user",
	performanceGlitch: "performance_glitch_user",
} as const;
