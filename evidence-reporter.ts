import fs from "fs";
import path from "path";
import type {
	FullResult,
	Reporter,
	TestCase,
	TestResult,
} from "@playwright/test/reporter";

interface EvidenceReporterOptions {
	/** Root evidence folder for this run, e.g. "src/evidence/PROJ-123". */
	outputDir?: string;
	/**
	 * Env this run targets (develop / beta-au / …). Appended to every artifact
	 * name so a develop run and a beta-au run of the same test land side by side
	 * instead of overwriting each other — the two-column evidence comment needs
	 * both files to exist at once. Falls back to TEST_ENV.
	 */
	env?: string;
}

/**
 * Evidence reporter — active only in evidence mode (wired in playwright.config.ts
 * when EVIDENCE=true). Copies each test's screenshot/video/trace attachments to
 * <outputDir>/ under a descriptive name derived from the test title AND the env,
 * so develop and beta-au artifacts coexist:
 *
 *   src/evidence/PROJ-123/checkout-rejects-empty-postcode-staging.png
 *   src/evidence/PROJ-123/checkout-rejects-empty-postcode-staging.webm
 *   src/evidence/PROJ-123/checkout-rejects-empty-postcode-prod.png
 *   src/evidence/PROJ-123/checkout-rejects-empty-postcode-staging-trace.zip   (trace)
 *
 * Failed tests keep their artifacts too, suffixed "-FAILED", so a regression
 * bundle shows exactly what broke. Copies happen in onEnd because video files
 * are not finalised until the test's browser context closes.
 */
class EvidenceReporter implements Reporter {
	private outputDir: string;
	private env: string;
	private entries: { test: TestCase; result: TestResult }[] = [];

	constructor(options: EvidenceReporterOptions = {}) {
		this.outputDir = options.outputDir ?? "src/evidence";
		this.env = options.env ?? process.env.TEST_ENV ?? "";
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		// Keep only the final attempt per test (retries overwrite earlier entries).
		this.entries = this.entries.filter((e) => e.test.id !== test.id);
		this.entries.push({ test, result });
	}

	async onEnd(_result: FullResult): Promise<void> {
		fs.mkdirSync(this.outputDir, { recursive: true });
		const used = new Set<string>();

		const envSuffix = this.env ? `-${slug(this.env)}` : "";
		for (const { test, result } of this.entries) {
			const failed = result.status !== "passed" && result.status !== "skipped";
			const base = uniqueName(
				`${slug(test.title)}${envSuffix}${failed ? "-FAILED" : ""}`,
				used,
			);

			// Prefer mid-test subject screenshots (attach body, no path) as the
			// primary `${base}.png` — Playwright's end-of-test viewport shot often
			// catches SPA remount / spinner / wrong scroll (e2e-evidence-visibility).
			const screenshots: {
				fromBody: boolean;
				ext: string;
				path?: string;
				body?: Buffer;
			}[] = [];
			for (const attachment of result.attachments) {
				const fromBody =
					!attachment.path &&
					// eslint-disable-next-line eqeqeq -- loose check is deliberate: catches null and undefined
					attachment.body != null &&
					attachment.body.length > 0;
				const fromPath = !!attachment.path && fs.existsSync(attachment.path);
				if (!fromBody && !fromPath) continue;

				const ext = fromPath
					? path.extname(attachment.path!)
					: attachment.contentType === "image/png"
						? ".png"
						: attachment.contentType === "image/jpeg"
							? ".jpg"
							: ".bin";

				if (attachment.name === "screenshot") {
					screenshots.push({
						fromBody,
						ext,
						path: fromPath ? attachment.path : undefined,
						body: fromBody ? Buffer.from(attachment.body as Buffer) : undefined,
					});
					continue;
				}

				let name: string | undefined;
				if (attachment.name === "video") {
					name = `${base}${ext}`;
				} else if (attachment.name === "trace") {
					name = `${base}-trace${ext}`;
				}
				if (!name) continue;
				const dest = path.join(this.outputDir, name);
				if (fromPath) {
					fs.copyFileSync(attachment.path!, dest);
				} else {
					fs.writeFileSync(dest, attachment.body!);
				}
			}

			const ordered = [
				...screenshots.filter((s) => s.fromBody),
				...screenshots.filter((s) => !s.fromBody),
			];
			ordered.forEach((shot, i) => {
				const name =
					i === 0 ? `${base}${shot.ext}` : `${base}-${i + 1}${shot.ext}`;
				const dest = path.join(this.outputDir, name);
				if (shot.path) {
					fs.copyFileSync(shot.path, dest);
				} else if (shot.body) {
					fs.writeFileSync(dest, shot.body);
				}
			});
		}

		console.log(`\nEvidence bundle: ${path.resolve(this.outputDir)}`);
	}
}

/** "Rejects empty postcode @PROJ-123" → "rejects-empty-postcode-proj-123" (tags kept — they carry the ticket). */
function slug(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "test"
	);
}

/** Avoid collisions when two tests slug to the same name. */
function uniqueName(base: string, used: Set<string>): string {
	let candidate = base;
	let n = 2;
	while (used.has(candidate)) candidate = `${base}-${n++}`;
	used.add(candidate);
	return candidate;
}

export default EvidenceReporter;
