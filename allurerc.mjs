/**
 * Allure Report 3 configuration (Node CLI — no Java anywhere in this setup).
 *
 * Two report flavours from one results dir:
 *   awesome   — the per-test report engineers read (steps, retries, history)
 *   dashboard — the charts view for a release readout
 *
 * One `generate` builds both. Running them as separate CLI passes appends a
 * trend point per pass, so a single run would appear twice in Status dynamics.
 *
 * History lives in an appendable `docs/allure-history.jsonl` that IS committed,
 * so the trend survives a machine wipe and a fresh CI runner. Without it every
 * run looks like the first one and "is this getting better" has no answer.
 */
export default {
	name: "Regression test report",
	output: "allure-report",
	historyPath: "docs/allure-history.jsonl",
	appendHistory: true,
	/**
	 * Declare failures that are already raised defects, so the report stops
	 * reading them as new regressions.
	 *
	 * Left out by default so generation works with no setup. Uncomment and fill
	 * in `links` + `rules` to enable it. Note that `rules` MUST be an array once
	 * `resolutions` is present at all — an object there fails validation.
	 *
	 * A rule matches on any of `messageRegexp`, `testCaseId`, `retryHash` or
	 * `environment` (at least one is required), and carries one resolution:
	 *   "issue"    — needs `issue: { id, type }`, where `type` names a key in
	 *                `links` below; the report then renders a link to the defect
	 *   "muted"    — needs `comment`; the failure is hidden from the headline
	 *   "accepted" — needs `comment`; known and tolerated
	 *
	 * Rules belong HERE, not in `known-issues.json`. That file is a record of
	 * matched failures which the report writes itself; hand-editing it into a
	 * `{ rules: [...] }` shape breaks generation.
	 *
	 * resolutions: {
	 * 	links: {
	 * 		jira: {
	 * 			urlTemplate: "https://your-org.atlassian.net/browse/%s",
	 * 			nameTemplate: "%s",
	 * 		},
	 * 	},
	 * 	rules: [
	 * 		{
	 * 			resolution: "issue",
	 * 			issue: { id: "PROJ-456", type: "jira" },
	 * 			messageRegexp: "SignatureDoesNotMatch|presigned",
	 * 		},
	 * 	],
	 * },
	 */
	plugins: {
		awesome: {
			options: {
				reportName: "Regression test report",
				groupBy: ["parentSuite", "suite"],
			},
		},
		dashboard: {
			options: {
				reportName: "Regression health",
				singleFile: true,
			},
		},
	},
	/**
	 * CI gate. `successRate` sits below 1 on purpose: a suite running against a
	 * shared environment usually carries known, already-raised defects, and
	 * demanding 100% fails every build for faults nobody is about to fix today.
	 * Declare the known ones in `resolutions.rules` above, then raise this — at
	 * which point a NEW failure is the only thing that can break the build.
	 */
	qualityGate: {
		rules: [{ successRate: 0.9 }],
	},
};
