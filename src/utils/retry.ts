/**
 * retry.ts — retry helpers for known-flaky UI (legacy widgets, 504 / nav timeout).
 *
 * Do not wrap every click. Blanket retries hide real regressions: a control
 * that needs three attempts is telling you something, and a suite that retries
 * everything can no longer tell a broken feature from a slow one. Use these
 * only where a specific widget is known to flake (overlay intercepts, tree
 * pickers, transient infrastructure). Playwright's own retries and state-based
 * waits stay the default.
 *
 *   Click / fill / select     retryClick / retryFill / retrySelect
 *   Wait for element state    retryWaitFor
 *   Infra (504, nav timeout)  retryWithBackoff
 *   Brief animation/disable   withRetry
 */

import { Locator, Page } from "@playwright/test";

export interface RetryOptions {
	/** Maximum attempts (default: 3). */
	maxRetries?: number;
	/** Delay between retries in milliseconds (default: 1000). */
	delay?: number;
	/** Exponential backoff (default: false). */
	exponentialBackoff?: boolean;
	/** Custom error message prefix. */
	errorMessage?: string;
	/** Log retry attempts (default: false — Playwright output stays quiet). */
	verbose?: boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
	maxRetries: 3,
	delay: 1000,
	exponentialBackoff: false,
	errorMessage: "Operation failed",
	verbose: false,
};

export async function retry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let lastError: Error | unknown;

	for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (opts.verbose) {
				console.log(
					`Attempt ${attempt}/${opts.maxRetries} failed: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				);
			}
			if (attempt < opts.maxRetries) {
				const waitTime = opts.exponentialBackoff
					? opts.delay * Math.pow(2, attempt - 1)
					: opts.delay;
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}
	}

	throw new Error(
		`${opts.errorMessage} after ${opts.maxRetries} attempts: ${
			lastError instanceof Error ? lastError.message : "Unknown error"
		}`,
	);
}

export async function retryClick(
	locator: Locator,
	options: RetryOptions = {},
): Promise<void> {
	await retry(
		async () => {
			await locator.scrollIntoViewIfNeeded();
			await locator.click();
		},
		{ errorMessage: "Click failed", ...options },
	);
}

export async function retryFill(
	locator: Locator,
	value: string,
	options: RetryOptions = {},
): Promise<void> {
	await retry(
		async () => {
			await locator.scrollIntoViewIfNeeded();
			await locator.clear();
			await locator.fill(value);
		},
		{ errorMessage: "Fill failed", ...options },
	);
}

export async function retrySelect(
	locator: Locator,
	value: string,
	options: RetryOptions = {},
): Promise<void> {
	await retry(
		async () => {
			await locator.scrollIntoViewIfNeeded();
			await locator.selectOption(value);
		},
		{ errorMessage: "Select failed", ...options },
	);
}

export async function retryAction(
	_page: Page,
	action: () => Promise<void>,
	options: RetryOptions = {},
): Promise<void> {
	await retry(action, { errorMessage: "Action failed", ...options });
}

export async function retryWaitFor(
	locator: Locator,
	state: "visible" | "hidden" | "attached" | "detached" = "visible",
	options: RetryOptions = {},
): Promise<void> {
	await retry(
		async () => {
			await locator.waitFor({ state, timeout: 5000 });
		},
		{ errorMessage: `Wait for ${state} failed`, ...options },
	);
}

export async function retryUntil(
	condition: () => Promise<boolean>,
	options: RetryOptions = {},
): Promise<boolean> {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
		try {
			if (await condition()) return true;
		} catch {
			// condition threw — treat as not-yet and retry
		}
		if (attempt < opts.maxRetries) {
			const waitTime = opts.exponentialBackoff
				? opts.delay * Math.pow(2, attempt - 1)
				: opts.delay;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
	}
	return false;
}

/**
 * Retry with exponential backoff for transient infrastructure errors
 * (504, navigation timeout, browser/page closure).
 */
export async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	maxRetries = 3,
	initialDelay = 2000,
	operationName = "Operation",
): Promise<T> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			const msg = lastError.message.toLowerCase();
			const isRetryable =
				msg.includes("504") ||
				msg.includes("gateway") ||
				msg.includes("timeout") ||
				msg.includes("timed out") ||
				msg.includes("net::err") ||
				msg.includes("navigation timeout") ||
				msg.includes("target page") ||
				msg.includes("context or browser has been closed") ||
				msg.includes("page has been closed") ||
				msg.includes("browser has been closed");

			if (!isRetryable || attempt === maxRetries) {
				throw lastError;
			}

			const delay = initialDelay * Math.pow(2, attempt - 1);
			console.warn(
				`${operationName}: retryable error on attempt ${attempt}. Retrying in ${delay}ms…`,
			);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw (
		lastError ??
		new Error(`${operationName}: Failed after ${maxRetries} retries`)
	);
}

/** Fixed-delay retry for briefly disabled or animating elements. */
export async function withRetry<T>(
	operation: () => Promise<T>,
	retries = 3,
	delayMs = 500,
): Promise<T> {
	let lastError: Error | null = null;
	for (let i = 0; i < retries; i++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
		}
	}
	throw lastError ?? new Error("Operation failed after retries");
}
