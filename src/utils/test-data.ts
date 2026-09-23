let sequence = 0;

/**
 * Unique, identifiable name for entities the tests create, e.g.
 * `e2eName("Order")` → `E2E-Order-1751871234567-1a3f`.
 *
 * The `E2E-` prefix is the data-discipline contract: any stray row left behind
 * by a crashed run is instantly recognisable and safe to purge. Timestamp +
 * per-worker sequence + random suffix keep names unique across parallel workers
 * and retries.
 */
export function e2eName(kind: string): string {
	sequence += 1;
	const random = Math.random().toString(36).slice(2, 6);
	return `E2E-${kind}-${Date.now()}-${sequence}${random}`;
}

/** Unique name that fits a field with a low `maxLength` (e.g. 20 characters). */
export function e2eShortName(kind = "", max = 20): string {
	sequence += 1;
	const stamp = Date.now().toString(36).slice(-7);
	const rand = Math.random().toString(36).slice(2, 5);
	const kindBit = kind.replace(/[^A-Za-z]/g, "").slice(0, 3);
	return `E2E${kindBit}${stamp}${rand}`.slice(0, max);
}

/** Base-26 lowercase encoding (digits → letters only). */
function toAlphaId(n: number): string {
	let x = Math.max(0, Math.floor(n));
	let out = "";
	do {
		out = String.fromCharCode(97 + (x % 26)) + out;
		x = Math.floor(x / 26);
	} while (x > 0);
	return out;
}

/**
 * Letters-only unique name, for fields that reject digits or punctuation —
 * person-name inputs are the usual offender.
 *
 * Example: `e2eAlphaName("Customer")` → `EeCustomerxyzabcaaaaqrst`. The prefix
 * `Ee` stands in for `E2E` without digits; uniqueness still comes from an
 * encoded timestamp + sequence + random letters.
 */
export function e2eAlphaName(kind: string): string {
	sequence += 1;
	const kindAlpha = kind.replace(/[^A-Za-z]/g, "") || "Name";
	const stamp = toAlphaId(Date.now());
	const seq = toAlphaId(sequence);
	const rand = Array.from({ length: 4 }, () =>
		String.fromCharCode(97 + Math.floor(Math.random() * 26)),
	).join("");
	return `Ee${kindAlpha}${stamp}${seq}${rand}`;
}

/** A disposable person's identifying fields, all safely unique. */
export interface PersonFixture {
	firstName: string;
	lastName: string;
	userName: string;
	email: string;
	fullName: string;
}

/**
 * Names for a disposable test person. `fullName` is how most list rows and user
 * pickers identify them, so it is returned pre-joined rather than rebuilt at
 * each call site.
 */
export function personFixture(
	firstKind = "First",
	lastKind = "Last",
): PersonFixture {
	const firstName = e2eAlphaName(firstKind);
	const lastName = e2eAlphaName(lastKind);
	const userName = `${firstName}.${lastName}`.toLowerCase();
	return {
		firstName,
		lastName,
		userName,
		email: `${userName}@example.com`,
		fullName: `${firstName} ${lastName}`,
	};
}

/**
 * True when every part looks like data this suite minted (`E2E-*`, `Ee*`).
 *
 * Guard destructive helpers with this: a purge routine that walks a list and
 * deletes rows must never be one bad filter away from deleting real records.
 */
export function isGeneratedTestName(...parts: string[]): boolean {
	const text = parts.filter(Boolean).join(" ");
	if (!text.trim()) return false;
	return /\bE2E[-A-Za-z]/i.test(text) || /\bEe[A-Z]/.test(text);
}
