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
	 * reading them as new regressions. Rules match on `messageRegexp`,
	 * `testCaseId`, `environmentId` and `retryHash`; the decision's reason and
	 * links are what the report shows against the test.
	 *
	 * Rules belong HERE, not in `known-issues.json` — that file is a record of
	 * matched failures keyed by historyId which the report writes itself, and
	 * hand-editing it into a `{ rules: [...] }` shape crashes generation with
	 * `known.forEach is not a function`.
	 */
	knownIssues: {
		rules: [
			// {
			// 	messageRegexp: "SignatureDoesNotMatch|presigned",
			// 	decision: {
			// 		reason: "PROJ-456 — presigned URLs signed for the wrong region",
			// 		links: [{ url: "https://your-org.atlassian.net/browse/PROJ-456" }],
			// 	},
			// },
		],
	},
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
	 * Declare the known ones in `knownIssues.rules` above, then raise this — at
	 * which point a NEW failure is the only thing that can break the build.
	 */
	qualityGate: {
		rules: [{ successRate: 0.9 }],
	},
};
