# Coverage ledger

One row per ticket, newest first. Append after the specs are green — this is the answer to "is
that covered?" without grepping the suite.

Record the exception too. A criterion that **cannot** be automated is a finding worth keeping:
the next person will otherwise spend a day rediscovering why.

| Date | Ticket | Feature | Specs | Criteria covered | Not automated (and why) |
| --- | --- | --- | --- | --- | --- |
| 2026-05-04 | PROJ-103 | Checkout | `src/tests/checkout/checkout.spec.ts` | Order completes and confirms; postcode is required | Payment capture — no sandbox gateway in this environment |
| 2026-05-04 | PROJ-102 | Product catalogue | `src/tests/catalog/inventory.spec.ts` | Catalogue renders; sort by price; sort by name | — |
| 2026-05-04 | PROJ-101 | Authentication | `src/tests/auth/login.spec.ts` | Valid login; locked-out account is rejected with a reason | SSO path — no test identity provider |

_The rows above describe the shipped example specs. Replace them with your own._
