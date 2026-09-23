#!/usr/bin/env node
/**
 * Zephyr Scale CLI — one entrypoint for the test-management side of a ticket.
 *
 *   TICKET=PROJ-123 node scripts/zephyr.mjs <command> [options]
 *
 * Commands:
 *   create    --spec <path> [--dry-run] [--force]
 *             Cases + cycle + planned executions, from the seam table.
 *   mark-pass [--status Pass|Fail] [--only TC-001,TC-004] [--cycle-status Done] [--dry-run]
 *             Record results after a green evidence run.
 *
 * Cases are created BEFORE the Playwright specs, not generated from them. The
 * seam table is the design artifact; the specs and the Zephyr cases are two
 * renderings of it, which is what keeps a manual tester and the suite testing
 * the same thing.
 */
import { fail } from "./lib/config.mjs";

const USAGE = `Usage:
  TICKET=<ISSUE-KEY> node scripts/zephyr.mjs <command> [options]

Commands:
  create    --spec <path> [--dry-run] [--force]
  mark-pass [--status Pass] [--only TC-001,TC-004] [--cycle-status Done] [--dry-run]`;

const COMMANDS = {
	create: () => import("./lib/zephyr/create.mjs"),
	"mark-pass": () => import("./lib/zephyr/mark-pass.mjs"),
};

const [, , command, ...rest] = process.argv;

if (!command || command === "-h" || command === "--help") {
	console.log(USAGE);
	process.exit(command ? 0 : 1);
}

const loader = COMMANDS[command];
if (!loader) fail(`Unknown command "${command}".\n\n${USAGE}`);

try {
	const mod = await loader();
	await mod.run(rest);
} catch (err) {
	fail(err?.message ?? String(err));
}
