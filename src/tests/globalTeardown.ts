import type { FullConfig } from "@playwright/test";

/**
 * Runs once after all tests.
 *
 * Deliberately almost empty. Per-test data is removed by `CleanupRegistry` in
 * `afterEach`, which is where teardown belongs: a global teardown runs once, so
 * a crashed run never reaches it and anything it was responsible for leaks.
 *
 * Reach for this hook only for genuinely run-scoped concerns — releasing an
 * environment lock, flushing a metrics batch, packaging a report.
 */
async function globalTeardown(_config: FullConfig) {
	// Intentionally a no-op. See the note above before adding cleanup here.
}

export default globalTeardown;
