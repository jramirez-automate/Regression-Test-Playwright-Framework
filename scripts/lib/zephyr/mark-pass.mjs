/**
 * Record results against the executions that `create` already made.
 *
 *   TICKET=PROJ-123 node scripts/zephyr.mjs mark-pass
 *   TICKET=PROJ-123 node scripts/zephyr.mjs mark-pass --status Fail --only TC-004,TC-007
 *   TICKET=PROJ-123 node scripts/zephyr.mjs mark-pass --cycle-status Done --dry-run
 *
 * New executions are created rather than mutated: Zephyr treats each execution
 * as an immutable record of one attempt, so overwriting would erase the planned
 * "Not Executed" state that proves the cases predated the run.
 */
import {
	fail,
	flagValue,
	loadCreated,
	projectKeyFrom,
	requireTicket,
	requireZephyrToken,
	writeCreated,
	zephyr,
} from "./api.mjs";

export async function run(argv = []) {
	requireZephyrToken();
	const ticket = requireTicket();
	const dryRun = argv.includes("--dry-run");
	const status = flagValue(argv, "--status") ?? "Pass";
	const cycleStatus = flagValue(argv, "--cycle-status") ?? "Done";
	const comment = flagValue(argv, "--comment") ?? "";
	const onlyRaw = flagValue(argv, "--only");
	const only = onlyRaw
		? new Set(onlyRaw.split(",").map((s) => s.trim()).filter(Boolean))
		: null;

	const created = loadCreated(ticket);
	if (!created.cycle?.key) fail(`No cycle recorded in zephyr-created.json for ${ticket}.`);
	const projectKey = projectKeyFrom(ticket);

	// `--only` accepts either the TC id from the seam table or the Zephyr key,
	// because which one you have to hand depends on where you are reading.
	const targets = (created.tests ?? []).filter(
		(t) => !only || only.has(t.tc ?? "") || only.has(t.key),
	);
	if (!targets.length) fail(`No matching tests${onlyRaw ? ` for --only ${onlyRaw}` : ""}.`);

	console.log(`${ticket}: marking ${targets.length} execution(s) ${status} in ${created.cycle.key}`);
	for (const t of targets) console.log(`  ${t.tc ? `${t.tc} ` : ""}${t.key}  ${t.name}`);
	if (dryRun) {
		console.log("(dry-run — nothing recorded)");
		return;
	}

	const recorded = [];
	for (const t of targets) {
		const ex = await zephyr("POST", "/testexecutions", {
			projectKey,
			testCaseKey: t.key,
			testCycleKey: created.cycle.key,
			statusName: status,
			...(comment ? { comment } : {}),
		});
		recorded.push({ key: ex.key ?? ex.id, testCase: t.key, status });
		console.log(`  ✔ ${t.key} → ${status}`);
	}

	if (cycleStatus) {
		await zephyr("PUT", `/testcycles/${created.cycle.key}`, {
			id: created.cycle.id,
			key: created.cycle.key,
			name: created.cycle.name,
			project: { id: created.cycle.projectId },
			status: { id: created.cycle.statusId },
			statusName: cycleStatus,
		}).catch(() =>
			console.warn(`  ⚠ could not set cycle status to ${cycleStatus} — set it in Zephyr`),
		);
	}

	created.executions = [...(created.executions ?? []), ...recorded];
	created.lastMarked = { status, at: new Date().toISOString(), count: recorded.length };
	writeCreated(ticket, created);
	console.log(`✔ Recorded ${recorded.length} execution(s). Test player: ${created.testPlayerUrl ?? "(unknown)"}`);
}
