# APP-MAP — accumulated knowledge about the app under test

This file is the suite's **memory**. It exists so nobody re-discovers the same route twice or
re-writes the same widget driver twice.

Agents read it **first**, before exploring source or clicking around, and append to it after
each ticket. Two indexes carry the weight:

- **Navigation index** — "how do I reach page X"
- **Helpers index** — "is there already a helper for this interaction"

The version below is a skeleton with worked examples from the shipped demo app. Replace the
contents with your own application's as you go; keep the structure.

---

## Environments

| TEST_ENV | URL | Notes |
| --- | --- | --- |
| `demo` | https://www.saucedemo.com | The shipped example. `standard_user` / `secret_sauce`. |
| `staging` | _fill in_ | |
| `prod` | _fill in_ | Read-only — `@smoke` only. Ask before running. |

### Known accounts

| Account | Behaviour | Use for |
| --- | --- | --- |
| `standard_user` | Normal | Happy paths |
| `locked_out_user` | Login is rejected | Negative login slice |
| `problem_user` | Broken images, some controls misbehave | Resilience checks |
| `performance_glitch_user` | Deliberately slow | Timeout / wait tuning |

---

## Feature map

### Navigation index

How to reach each page. A deep link beats a click-path; record the click-path only when the page
has no clean URL. When a route here turns out to be wrong, **fix the row** — a stale index is
worse than none.

| Page | Deep link | Page object | Notes |
| --- | --- | --- | --- |
| Login | `/` | `LoginPage.goto()` | Redirects here when the session is absent |
| Product catalogue | `/inventory.html` | `InventoryPage.gotoList()` | Requires a session |
| Product detail | `/inventory-item.html?id=<id>` | — | Id is not stable across environments |
| Cart | `/cart.html` | `CartPage.gotoCart()` | |
| Checkout — details | `/checkout-step-one.html` | `CheckoutPage` | Reachable only from the cart |
| Checkout — overview | `/checkout-step-two.html` | `CheckoutPage` | Reached via Continue, not by URL |
| Order confirmation | `/checkout-complete.html` | `CheckoutPage` | |

### Helpers index

Shared interaction drivers. Check here **and** `src/utils/interactions.ts` before writing any
dropdown, modal or download code.

| Interaction | Helper | Where |
| --- | --- | --- |
| Whitespace-tolerant label matching | `labelRegex(label)` | `src/utils/interactions.ts` |
| Custom dropdown — find an option without clicking | `findListboxOption()` | `src/utils/interactions.ts` |
| Custom dropdown — pick an option | `selectFromListbox()` | `src/utils/interactions.ts` |
| Async dropdown settles to options or a known empty state | `expectAsyncOptionsLoad()` | `src/utils/interactions.ts` |
| Modal submit success sequence (detached → toast) | `waitForModalDetachedThenToast()` | `src/utils/interactions.ts` |
| `target="_blank"` download (tab, popup, or error page) | `clickDownloadInNewTab()` | `src/utils/interactions.ts` |
| Dismiss a cookie banner / walkthrough blocking the page | `BasePage.dismissBlockingDialog()` | `src/pages/BasePage.ts` |
| Retry a specific known-flaky control | `retryClick` / `retryFill` | `src/utils/retry.ts` |
| Capture the proving frame before dismissing | `attachSubject` / `attachCloseUp` | `src/utils/evidence.ts` |

---

## Cross-cutting quirks

Things that cost someone an afternoon. Add yours.

- **A URL change is not a rendered page.** Client-rendered apps update the URL before painting.
  Wait on a rendered control, or `globalSetup` captures a half-written session.
- **An `aria-hidden` backdrop blocks everything underneath it.** A cookie banner or walkthrough
  makes a perfectly correct locator time out. Use `dismissBlockingDialog({ waitFor })`.
- **Several dialogs are often mounted at once.** An unscoped `getByRole("dialog")` resolves to
  whichever the DOM offers first — scope by heading.
- **Sorting assertions must read the rendered values**, not the `<select>`'s value. A test that
  checks the control passes while sorting is completely broken.

---

## How to append to this file

After each ticket, record:

- **`NEW NAV FACT`** — a page that was not in the Navigation index, was indexed wrongly, or took
  more than a couple of attempts to reach. Add or fix the row.
- **`NEW HELPER`** — an interaction you have now written twice. Extract it to
  `src/utils/interactions.ts`, export it from the barrel, and add the index row pointing at it.
- **A quirk** — anything that cost real time and will cost it again.

Graduation: a click-path used by specs becomes a page-object `goto*()`, and inline interaction
code becomes a named helper. The index row then points at the code rather than describing it.
