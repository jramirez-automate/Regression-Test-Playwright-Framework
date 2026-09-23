/**
 * Allure reporter wiring.
 *
 * Allure is the **run** report — what the last execution did, how it trended,
 * which failures cluster together. It is not the evidence record: ticket proof
 * lives on Jira / Confluence / Zephyr with `EVIDENCE=true` captures, because
 * Allure has no notion of a TC id or an acceptance criterion.
 *
 * Consumed by `playwright.config.ts`; report generation is `allurerc.mjs`.
 */
import { currentTestEnv, playwrightBaseURL, tenantName } from "./env";
import type { Label, TestResult } from "allure-js-commons";

/**
 * Jira site for issue links, from `ALLURE_JIRA_BROWSE_URL` (or the publishing
 * config's base URL + `/browse`). Unset simply means no links are added.
 */
const JIRA_BROWSE = (process.env.ALLURE_JIRA_BROWSE_URL ?? "").replace(
	/\/$/,
	"",
);

/**
 * Ticket tags to promote to links. Matches `@PROJ-123` for any project key;
 * narrow it with `ALLURE_TICKET_PATTERN` when a repo tags several systems.
 */
const TICKET_TAG = new RegExp(
	process.env.ALLURE_TICKET_PATTERN ?? "^@?([A-Z][A-Z0-9]+-\\d+)$",
);

/**
 * The rollup tag every spec carries (a regression campaign, an epic). It says
 * nothing about an individual test, so it is linked as the campaign rather than
 * as that test's issue.
 */
const ROLLUP_TAG = (process.env.ALLURE_ROLLUP_TAG ?? "").replace(/^@/, "");

/**
 * Feature area and severity per ticket, so the report groups the way your
 * release readout does and the severity chart is not one flat bar.
 *
 * Severity is worth setting deliberately: band it from whatever risk scoring
 * sequenced the campaign (impact × likelihood), and one ranking then drives
 * both the run order and the height of a red bar.
 *
 *   blocker   login, permissions, anything that gates the rest of the suite
 *   critical  primary revenue / data paths
 *   normal    supporting features
 *   minor     cosmetic, secondary screens
 *   trivial   reporting, exports
 */
export const STORIES: Record<string, { area: string; severity: string }> = {
	// "PROJ-101": { area: "Authentication", severity: "blocker" },
	// "PROJ-102": { area: "Checkout", severity: "critical" },
};

/**
 * Promote describe tags to Allure links, areas and severities.
 *
 * Doing it here rather than calling `allure.issue()` inside every test keeps
 * the spec free of reporting concerns: the tag is already the traceability
 * convention, and a link makes each failure one click from its criteria.
 */
function linkStoryTags(result: TestResult): void {
	const tags = (result.labels ?? []).filter(
		(l: Label) => l.name === "tag" && TICKET_TAG.test(l.value),
	);
	for (const tag of tags) {
		const key = TICKET_TAG.exec(tag.value)?.[1];
		if (!key) continue;
		const isRollup = ROLLUP_TAG && key === ROLLUP_TAG;

		if (JIRA_BROWSE && !result.links?.some((l) => l.url?.endsWith(key))) {
			result.links = [
				...(result.links ?? []),
				{
					type: isRollup ? "tms" : "issue",
					name: isRollup ? `${key} (campaign)` : key,
					url: `${JIRA_BROWSE}/${key}`,
				},
			];
		}

		const story = STORIES[key];
		if (!story) continue;
		// The reporter's default parentSuite is the Playwright project name, which
		// groups every test under one "chromium" node. Only Chromium runs here, so
		// the feature area is the grouping actually worth having.
		result.labels = [
			...result.labels.filter(
				(l) => l.name !== "parentSuite" && l.name !== "severity",
			),
			{ name: "parentSuite", value: story.area },
			{ name: "severity", value: story.severity },
		];
	}
}

/**
 * Buckets for the Categories view. These describe *shapes* of failure rather
 * than specific defects — a shape survives the next release, a message from one
 * build does not.
 */
const CATEGORIES = [
	{
		name: "Blocked — environment cannot perform the step",
		description:
			"The environment cannot exercise the step (no transactional email, absent integration, seed data missing). Not a defect in the feature under test.",
		messageRegex: ".*(no message arrived|inbox|mail delivery|SMTP|seed data).*",
		matchedStatuses: ["failed", "broken", "skipped"],
	},
	{
		name: "Not entitled — feature flag off",
		description:
			"The feature is gated off here, so the criterion cannot be exercised.",
		messageRegex: ".*(feature flag|not entitled|gated|entitlement).*",
		matchedStatuses: ["skipped"],
	},
	{
		name: "Server rejected the request",
		description:
			"The app called its own API and got a 4xx/5xx — the signature of most defects a suite like this raises.",
		messageRegex:
			".*(status code 4\\d\\d|status code 5\\d\\d|Unknown Server Error|undefined/).*",
		matchedStatuses: ["failed", "broken"],
	},
	{
		name: "Waiting for something that never appeared",
		description:
			"Timeout on a locator or navigation. Read before blaming the product: a stale selector fails exactly the same way a missing control does.",
		messageRegex:
			".*(Timeout .* exceeded|waiting for locator|waiting for navigation).*",
		matchedStatuses: ["failed", "broken"],
	},
	{
		name: "Assertion failed",
		description: "The behaviour ran but did not match the criterion.",
		messageRegex: ".*expect.*",
		matchedStatuses: ["failed"],
	},
	{
		name: "Flaky",
		description:
			"Passed only after a retry — triage before trusting either result.",
		matchedStatuses: ["passed", "failed", "broken"],
		flaky: true,
	},
];

export function allureReporterOptions(testEnv = currentTestEnv()) {
	return {
		resultsDir: "allure-results",
		...(JIRA_BROWSE
			? {
					links: {
						issue: { urlTemplate: `${JIRA_BROWSE}/%s`, nameTemplate: "%s" },
						tms: { urlTemplate: `${JIRA_BROWSE}/%s`, nameTemplate: "%s" },
					},
				}
			: {}),
		/**
		 * Which build and environment the run describes. Without this a green
		 * report proves nothing later: environments are redeployed mid-cycle, so
		 * "227 passed" is only meaningful against a named release. Set
		 * `APP_VERSION` from your deploy pipeline, or read it off the running app.
		 */
		environmentInfo: {
			"Test env": testEnv,
			"Base URL": safely(playwrightBaseURL),
			Tenant: safely(tenantName) || "n/a",
			"App version": process.env.APP_VERSION ?? "unset",
			Ticket: process.env.TICKET ?? "full suite",
			Evidence: process.env.EVIDENCE === "true" ? "capturing" : "off",
			Commit: process.env.GITHUB_SHA ?? process.env.GIT_COMMIT ?? "local",
			CI: process.env.CI ? "yes" : "no",
		},
		categories: CATEGORIES,
		listeners: [{ beforeTestResultWrite: linkStoryTags }],
	};
}

/** Env helpers throw when a var is missing; the report should still generate. */
function safely(read: () => string): string {
	try {
		return read();
	} catch {
		return "unset";
	}
}
