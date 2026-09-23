import {
	type Page,
	type Locator,
	type Download,
	expect,
} from "@playwright/test";

/**
 * interactions.ts — shared drivers for the widgets your app repeats everywhere.
 *
 * Rule of thumb: an interaction with a SHARED component (a custom dropdown, a
 * toast, a modal submit sequence) lives here; page-SPECIFIC selectors stay in
 * the page object. Look here — and at the Helpers index in `docs/APP-MAP.md` —
 * BEFORE writing new interaction code. The second time you hand-roll the same
 * dropdown dance, extract it into this file instead.
 */

/**
 * Whitespace-tolerant, case-insensitive matcher for a visible label.
 *
 * The DOM collapses, expands and wraps runs of whitespace, so a literal string
 * match is brittle: this turns `"Order total"` into `/Order\s+total/i`.
 */
export function labelRegex(label: string): RegExp {
	return new RegExp(label.replace(/\s+/g, "\\s+"), "i");
}

/** Options for {@link selectFromListbox}. */
export interface ListboxOptions {
	/** Control that opens the list — a `<button>`, combobox, or select chrome. */
	toggle: Locator;
	/** Visible label (or a substring) of the option to pick. */
	label: string;
	/**
	 * The open list container. Defaults to any visible `[role="listbox"]` /
	 * `[role="menu"]`. Pass a scoped locator when the page renders more than one.
	 */
	list?: Locator;
	/** Search/filter input inside the list, when the widget has one. */
	search?: Locator;
	/** How long to wait for the option row to appear. Default 15s. */
	timeout?: number;
}

/**
 * Open a custom dropdown and resolve the option matching `label` WITHOUT
 * clicking it, so a caller can read extra text off the row first (a price, a
 * secondary line) before deciding to select it.
 */
export async function findListboxOption(
	page: Page,
	{ toggle, label, list, search, timeout = 15_000 }: ListboxOptions,
): Promise<Locator> {
	await toggle.click();

	const menu = (
		list ??
		page.locator('[role="listbox"], [role="menu"]').filter({ visible: true })
	).first();
	await menu.waitFor({ state: "visible", timeout: 10_000 });

	if (search && (await search.isVisible().catch(() => false))) {
		await search.fill(label);
	}

	const option = menu
		.getByRole("option")
		.or(menu.getByRole("menuitem"))
		.filter({ hasText: labelRegex(label) })
		.first();
	await option.waitFor({ state: "visible", timeout });
	return option;
}

/**
 * Open a custom dropdown and CLICK the option matching `label` — the common
 * "just pick it" case.
 */
export async function selectFromListbox(
	page: Page,
	opts: ListboxOptions,
): Promise<void> {
	const option = await findListboxOption(page, opts);
	await option.click();
}

/** Options for {@link expectAsyncOptionsLoad}. */
export interface AsyncOptionsLoadOptions {
	toggle: Locator;
	list?: Locator;
	/** Copy the widget shows when it legitimately has nothing to offer. */
	emptyPattern?: RegExp;
	timeout?: number;
}

/**
 * Open a dropdown whose options arrive over the network and assert it settles
 * to either real options or a known empty state — without an error toast.
 *
 * Worth its own helper because "the list never populated" and "the list is
 * genuinely empty" look identical to a naive `toBeVisible`, and only one of
 * them is a passing test.
 */
export async function expectAsyncOptionsLoad(
	page: Page,
	{
		toggle,
		list,
		emptyPattern = /no results|no options|nothing found/i,
		timeout = 30_000,
	}: AsyncOptionsLoadOptions,
): Promise<"options" | "empty"> {
	await toggle.click();

	const menu = (
		list ??
		page.locator('[role="listbox"], [role="menu"]').filter({ visible: true })
	).first();
	await menu.waitFor({ state: "visible", timeout: 10_000 });

	await expect
		.poll(
			async () => {
				if (
					await menu
						.getByText(/^loading/i)
						.isVisible()
						.catch(() => false)
				) {
					return "";
				}
				if (
					await menu
						.getByText(emptyPattern)
						.isVisible()
						.catch(() => false)
				) {
					return "empty";
				}
				const options = menu.getByRole("option").or(menu.getByRole("menuitem"));
				return (await options.count()) > 0 ? "options" : "";
			},
			{ timeout, intervals: [500, 1_000, 2_000] },
		)
		.not.toBe("");

	const errorToast = page.getByText(
		/something went wrong|internal server error|network error|failed to load/i,
	);
	expect(await errorToast.isVisible().catch(() => false)).toBe(false);

	return (await menu
		.getByText(emptyPattern)
		.isVisible()
		.catch(() => false))
		? "empty"
		: "options";
}

/** Options for {@link waitForModalDetachedThenToast}. */
export interface ModalThenToastOptions {
	/** The modal/dialog locator — awaited to DETACH from the DOM first. */
	modal: Locator;
	/** The success-toast locator — awaited to become VISIBLE after the modal is gone. */
	toast: Locator;
	/** How long to wait for the modal to detach. Default 15s. */
	modalTimeout?: number;
	/** How long to wait for the toast to appear. Default 10s. */
	toastTimeout?: number;
}

/**
 * Assert the success sequence after a modal submit: the modal leaves the DOM
 * FIRST, then the toast appears.
 *
 * Order matters. Asserting the toast alone passes while the modal is still open
 * over a failed save, and asserting them in parallel races a toast that renders
 * before the dialog unmounts.
 */
export async function waitForModalDetachedThenToast({
	modal,
	toast,
	modalTimeout = 15_000,
	toastTimeout = 10_000,
}: ModalThenToastOptions): Promise<void> {
	await modal.waitFor({ state: "detached", timeout: modalTimeout });
	await toast.waitFor({ state: "visible", timeout: toastTimeout });
}

/**
 * Click a `target="_blank"` download link and return whatever it produced.
 *
 * Apps commonly serve stored files as anchors that open a new tab pointing at a
 * presigned URL. Chromium may turn that into a download on the current page, on
 * the popup, or — when the URL is broken — into a popup rendering the storage
 * provider's error XML. All three are reported, so a caller can both assert the
 * outcome and capture evidence of it.
 */
export async function clickDownloadInNewTab(
	page: Page,
	trigger: Locator,
	timeout = 20_000,
): Promise<{ download: Download | null; popup: Page | null }> {
	const popupPromise = page
		.context()
		.waitForEvent("page", { timeout })
		.catch(() => null);
	const samePageDownload = page
		.waitForEvent("download", { timeout })
		.catch(() => null);

	await trigger.click();

	const [popup, direct] = await Promise.all([popupPromise, samePageDownload]);
	if (direct) return { download: direct, popup };
	if (!popup) return { download: null, popup: null };

	const fromPopup = await popup
		.waitForEvent("download", { timeout })
		.catch(() => null);
	if (!fromPopup) await popup.waitForLoadState().catch(() => undefined);
	return { download: fromPopup, popup };
}
