/**
 * Create Zephyr Scale test cases + a test cycle for a ticket, from a spec file.
 *
 *   TICKET=PROJ-123 node scripts/zephyr.mjs create --spec src/evidence/PROJ-123/zephyr-spec.json
 *   … --dry-run   validate and print without creating
 *   … --force     create again even though zephyr-created.json exists
 *
 * Cases are created in PLANNED mode by default — `executionStatus: "Not
 * Executed"`, cycle "In Progress" — because the cases come from the seam table
 * BEFORE any spec is written. After a green evidence run, `mark-pass` records
 * the result against the same executions rather than creating new ones.
 *
 * Case names and steps follow the Test Scenario convention: numbered user
 * actions, expected result on the last step only, no framework internals. A
 * step that reads `await page.getByRole(...)` is useless to a manual tester
 * reading the same case next release.
 *
 * Spec shape — see templates/zephyr-spec.json.
 */
import fs from "node:fs";
import {
	createdPath,
	escapeHtml,
	fail,
	flagValue,
	listAllFolders,
	loadCreated,
	projectKeyFrom,
	requireRootFolder,
	requireTicket,
	requireZephyrToken,
	testPlayerUrl,
	writeCreated,
	zephyr,
	zephyrSettings,
} from "./api.mjs";
import { jiraBaseUrl } from "../config.mjs";
import { jiraGet, jiraSend } from "../jira.mjs";

export async function run(argv = []) {
	requireZephyrToken();
	const ticket = requireTicket();
	const specPath = flagValue(argv, "--spec");
	const dryRun = argv.includes("--dry-run");
	const force = argv.includes("--force");

	if (!specPath || !fs.existsSync(specPath)) fail("Pass --spec <zephyr-spec.json>.");
	const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
	if (!spec.tests?.length) fail("Spec has no tests.");

	const settings = zephyrSettings();
	const projectKey = projectKeyFrom(ticket);
	const rootFolder = spec.rootFolder ?? settings.rootFolder ?? "Regression";
	const cycleFolderName = spec.cycleFolder ?? settings.primaryCycleFolder ?? "STAGING";

	const createdFile = createdPath(ticket);
	if (fs.existsSync(createdFile) && !force && !dryRun) {
		fail(`${createdFile} exists — Zephyr items were already created. Use --force to create again.`);
	}

	const issue = await jiraGet(`/rest/api/3/issue/${ticket}?fields=summary`);
	const issueId = Number(issue.id);
	const summary = String(issue.fields?.summary ?? "")
		.replace(/\s+/g, " ")
		.replace(/[/\\]/g, "-")
		.trim();

	const defaultExec = spec.executionStatus ?? "Not Executed";
	const cycleStatus =
		spec.cycleStatus ?? (defaultExec === "Not Executed" ? "In Progress" : "Done");
	const folderName = spec.folderName ?? `[${ticket}] ${summary}`;
	const cycleName = spec.cycleName ?? `[${ticket}] ${summary} - ${cycleFolderName} test cycle`;

	console.log(`Ticket ${ticket} (issue id ${issueId})`);
	console.log(`Test cases folder: ${rootFolder} / ${folderName}`);
	console.log(`Cycle: "${cycleName}" → ${rootFolder} / ${cycleFolderName} [${cycleStatus}]`);
	for (const t of spec.tests) {
		console.log(
			`  test: ${t.tc ? `${t.tc} ` : ""}${t.name} (${t.steps.length} steps) [${t.executionStatus ?? defaultExec}]`,
		);
	}
	if (dryRun) {
		console.log("(dry-run — nothing created)");
		return;
	}

	// ── Folders ───────────────────────────────────────────────────────────────
	const caseFolders = await listAllFolders(projectKey, "TEST_CASE");
	const caseRoot = requireRootFolder(caseFolders, rootFolder, "TEST_CASE");
	let ticketFolder = caseFolders.find(
		(f) => f.parentId === caseRoot.id && f.name === folderName,
	);
	if (!ticketFolder) {
		ticketFolder = await zephyr("POST", "/folders", {
			projectKey,
			name: folderName,
			folderType: "TEST_CASE",
			parentId: caseRoot.id,
		});
		console.log(`✔ folder ${ticketFolder.id}  ${folderName}`);
	} else {
		console.log(`✔ folder ${ticketFolder.id}  ${folderName} (existing)`);
	}

	const cycleFolders = await listAllFolders(projectKey, "TEST_CYCLE");
	const cycleRoot = requireRootFolder(cycleFolders, rootFolder, "TEST_CYCLE");
	const cycleFolder = cycleFolders.find(
		(f) => f.name === cycleFolderName && f.parentId === cycleRoot.id,
	);
	if (!cycleFolder) fail(`Zephyr cycle folder "${rootFolder} / ${cycleFolderName}" not found.`);

	// ── Cases ─────────────────────────────────────────────────────────────────
	const created = {
		ticket,
		folder: { id: ticketFolder.id, name: folderName, parent: rootFolder },
		cycle: null,
		tests: [],
		executions: [],
	};

	for (const t of spec.tests) {
		const tc = await zephyr("POST", "/testcases", {
			projectKey,
			name: t.name,
			priorityName: spec.priorityName ?? settings.priorityName ?? "Normal",
			statusName: spec.testCaseStatus ?? settings.testCaseStatus ?? "Approved",
			folderId: ticketFolder.id,
		});
		await zephyr("POST", `/testcases/${tc.key}/teststeps`, {
			mode: "OVERWRITE",
			items: t.steps.map((s, i) => ({
				inline: {
					description: escapeHtml(s),
					// Expected result belongs on the LAST step only — one observable
					// outcome per case, not a running commentary.
					...(i === t.steps.length - 1
						? { expectedResult: escapeHtml(t.expectedResult ?? "") }
						: {}),
				},
			})),
		});
		await zephyr("POST", `/testcases/${tc.key}/links/issues`, { issueId }).catch((err) => {
			console.warn(`  ⚠ link ${tc.key} → ${ticket}: ${err.message}`);
		});
		created.tests.push({
			key: tc.key,
			name: t.name,
			...(t.tc ? { tc: t.tc } : {}),
			executionStatus: t.executionStatus ?? defaultExec,
			executionComment: t.executionComment ?? spec.executionComment ?? undefined,
		});
		console.log(`  ✔ ${tc.key}  ${t.name}`);
	}

	// ── Cycle + executions ────────────────────────────────────────────────────
	const cycle = await zephyr("POST", "/testcycles", {
		projectKey,
		name: cycleName,
		statusName: cycleStatus,
		folderId: cycleFolder.id,
		...(spec.cycleDescription ? { description: spec.cycleDescription } : {}),
	});
	await zephyr("POST", `/testcycles/${cycle.key}/links/issues`, { issueId }).catch(() => {});
	created.cycle = {
		key: cycle.key,
		name: cycleName,
		folder: `${rootFolder} / ${cycleFolderName}`,
	};
	console.log(`✔ cycle ${cycle.key} → ${rootFolder} / ${cycleFolderName}`);

	for (const t of created.tests) {
		const statusName = t.executionStatus ?? defaultExec;
		const ex = await zephyr("POST", "/testexecutions", {
			projectKey,
			testCaseKey: t.key,
			testCycleKey: cycle.key,
			statusName,
			...(t.executionComment ? { comment: t.executionComment } : {}),
		});
		created.executions.push({
			key: ex.key ?? ex.id,
			testCase: t.key,
			status: statusName,
		});
		console.log(`  ✔ execution ${ex.key ?? ex.id} (${t.key}: ${statusName})`);
	}

	// Zephyr's issue panel stays hidden until these properties exist, which
	// makes a correctly-created cycle look like it never happened.
	for (const [prop, value] of [
		["com.kanoah.test-manager_issue-content", { added: "com.kanoah.test-manager_issue-content" }],
		["issue.content.panel.customised.flag", { createdOn: new Date().toISOString() }],
	]) {
		await jiraSend("PUT", `/rest/api/3/issue/${ticket}/properties/${prop}`, value).catch(
			() => console.warn(`  ⚠ could not set ${prop} — open the Zephyr panel via the issue's Apps menu`),
		);
	}

	created.testPlayerUrl = testPlayerUrl(jiraBaseUrl(), projectKey, cycle.key);
	const file = writeCreated(ticket, created);
	console.log(`\nKeys written: ${file}`);
	console.log(`Test player: ${created.testPlayerUrl}`);
	void loadCreated;
}
