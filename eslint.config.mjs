import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import playwright from "eslint-plugin-playwright";

/** Page objects, utilities, config — general TypeScript quality. */
const tsRules = {
	"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
	"@typescript-eslint/no-explicit-any": "warn",
	"@typescript-eslint/no-non-null-assertion": "off",
	"no-console": "off",
	"no-debugger": "warn",
	"prefer-const": "warn",
	"no-var": "error",
	eqeqeq: ["warn", "always"],
};

export default [
	{
		files: ["src/tests/**/*.spec.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { ecmaVersion: 2022, sourceType: "module" },
		},
		plugins: { "@typescript-eslint": tseslint, playwright },
		rules: {
			...tsRules,
			"playwright/no-page-pause": "error",
			// Conditional skips are feature gates (entitlements, flags), not
			// forgotten tests — the framework relies on them.
			"playwright/no-skipped-test": "off",
			"playwright/no-focused-test": "error",
			"playwright/no-force-option": "warn",
			"playwright/no-wait-for-timeout": "warn",
		},
	},
	{
		files: ["src/**/*.ts"],
		ignores: ["src/tests/**/*.spec.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { ecmaVersion: 2022, sourceType: "module" },
		},
		plugins: { "@typescript-eslint": tseslint },
		rules: { ...tsRules },
	},
	{
		files: ["playwright.config.ts", "evidence-reporter.ts", "progress-reporter.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { ecmaVersion: 2022, sourceType: "module" },
		},
		plugins: { "@typescript-eslint": tseslint },
		rules: { ...tsRules },
	},
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"test-results/**",
			"src/test-results/**",
			"playwright-report/**",
			"allure-report/**",
			"evidence/**",
			"src/evidence/**",
			".auth/**",
			"scripts/**/*.js",
			"scripts/**/*.mjs",
			"templates/**",
		],
	},
];
