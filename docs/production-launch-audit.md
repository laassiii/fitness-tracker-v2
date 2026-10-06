# Production validation hold — 2026-10-06

**PHASE 1 REMAINS OPEN.** Validation stopped at the user's explicit paid-usage gate. No Phase 2 work or new product features were added.

## Verified in this continuation

- Created Cloudflare Pages project `fitness-tracker-prod` with production branch `codex/phase-1`.
- Deployed only `apps/web/dist`, plus a thin Pages Function forwarding `/api/*` to the existing `fitness-tracker-api` through a service binding. The original Origin and cookie headers reach the API; no database credentials are present in the frontend/Function.
- Production URL: https://fitness-tracker-prod.pages.dev
- Deployment URL: https://4345a0d1.fitness-tracker-prod.pages.dev
- Existing Worker URL: https://fitness-tracker-api.fitness-fastapi-worker-spike.workers.dev
- Actual deployed HTTP checks: frontend `/` 200 HTML, `/api/v1/health` 200 JSON, `/api/v1/legal` 200 JSON. These are deployment smoke checks, **not authenticated browser workflow evidence**.
- Frontend response includes CSP, framing protection, no-referrer, nosniff, Permissions Policy and HSTS. Pages `_headers` does not apply to Function responses; API headers still require remaining hardening validation.
- Frontend build passed. Workspace typechecks passed with zero Svelte warnings/errors.
- Production Supabase target remains `iewlobsbtwovcgpalgva`; no migration or application data was introduced in this continuation.

## Backup blocker

`wrangler r2 bucket list` failed with Cloudflare code **10042**, requiring R2 enablement. The actual account dashboard redirected to `/r2/plans` and showed:

- Standard storage: 10 GB/month included; $0.015 per additional GB/month.
- Class A: 1 million operations/month included; $4.50 per additional million.
- Class B: 10 million operations/month included; $0.36 per additional million.
- $0 due now and monthly **plus additional usage**.
- Activation accepts terms and a subscription that automatically renews, bills the payment method on file for usage, and may preauthorize that payment method.

R2 was **not enabled**. No subscription accepted, bucket created, backup uploaded or restore drill performed. Free allowance alone is not evidence of a hard zero-spend guarantee. The user explicitly required stopping rather than enabling paid usage if the backup approach cannot remain genuinely free. A zero-cost backup destination must be resolved before validation resumes.

Sources checked: https://developers.cloudflare.com/r2/pricing/ and https://developers.cloudflare.com/r2/get-started/ plus the actual logged-in account R2 activation screen.

## Audit status

| Requirement                                        | Status                        | Evidence / outstanding work                                           |
| -------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Accepted plan-read CPU gate                        | PASS, prior accepted evidence | Commit `8850279`; not reopened                                        |
| Production schema/migrations                       | PASS, prior milestone         | Migrations 001–005; unchanged here                                    |
| Production API/RLS isolation                       | PASS, prior milestone         | Accepted deployed security tests; not rerun here                      |
| Pages deployment and API connection                | PASS                          | Actual deployed HTTP smoke checks above                               |
| Deployed authenticated browser workflows           | UNTESTED                      | Signup through signout still pending                                  |
| Production browser storage inspection              | UNTESTED                      | localStorage, IndexedDB, sessionStorage inspection pending            |
| Production email delivery/recovery                 | UNTESTED                      | SMTP, real mailbox, verification/reset links pending                  |
| Refresh 429 investigation and handling             | UNTESTED                      | Previous provider 429 retained; no changes made here                  |
| Full deployed security hardening                   | UNTESTED                      | Static headers added; API/CORS/logging/error checks pending           |
| Remaining representative endpoint CPU/wall         | UNTESTED                      | No new metrics taken                                                  |
| Actual GitHub Actions run                          | UNTESTED                      | `gh` unavailable locally; browser/API route not attempted before hold |
| R2 activation/access prerequisite                  | FAIL / BLOCKED                | Account requires usage-billed subscription activation                 |
| Encrypted backup/upload/retention/download/restore | UNTESTED                      | R2 not activated; no backup readiness claim                           |
| Auth identity recovery procedure                   | UNTESTED                      | Full backup/restore mechanism unresolved                              |

## Launch blockers

Unresolved zero-cost backup destination and actual restore drill; real email delivery and recovery; deployed browser session/workout/persistence validation; remaining security/rate-limit/endpoint metrics; actual CI run. Current legal documents remain development templates requiring publication review before real users.

## Accepted limitations retained

Existing v1 bounds and CPU sampling limitations remain as documented in `production-validation.md` and `plan-read-performance.md`. This continuation does not add or accept new product limitations.

No production test identities/data were created in this continuation. Deployment configuration changes are uncommitted pending review of this hold.

## Remaining production gates — 2026-10-06 continuation

This section supersedes the earlier hold above. The user accepted the independent zero-cost backup gate; it was not repeated and scheduled backups remain disabled. R2 remains inactive. Phase 1 remains OPEN pending review.

### Deployment and executed checks

- Commits `760c06a` (refresh concurrency/cooldown and response headers) and `e7d4b1a` (bounded endpoint CPU optimization and validation harnesses) were pushed to `codex/phase-1`.
- Current Worker deployment: `dc1854fd-9158-4e92-9340-1001c7d6a447`; final Pages deployment: `bbbbecee.fitness-tracker-prod.pages.dev`, with the production alias and compiled API service-binding Function.
- Seven real deployed browser tests passed: sign-in/explicit consent/profile, exercise and plan/session/set workflows, reload/resume, immutable history/progress/PR/body metrics, literal script text rendering/mobile layout, cross-context server persistence, sign-out and subsequent sign-in. Synthetic administrative fixture setup is not public signup/email evidence. Fixtures were deleted.
- Browser storage inspection: localStorage, sessionStorage, IndexedDB and CacheStorage empty. Authentication cookie checked Secure, HttpOnly, SameSite=Lax and __Host prefix. Persistent fitness data remained server-authoritative.
- Three deployed API regression tests passed after optimization: bidirectional isolation, UUID tampering, idempotent set retries, closed-session integrity and history.
- Actual HTTP checks passed for unauthenticated/invalid bearer denial, cross-origin cookie refresh rejection, malformed JSON and ownership-field validation. Cross-origin preflight did not grant Access-Control-Allow-Origin. API responses include no-store, nosniff, HSTS, restrictive CSP, framing protection and no-referrer.
- Worker secret inventory contains only the publishable key; no privileged credential handles normal requests. Privileged credentials were used only locally for explicitly disposable identity setup/cleanup. Compiled frontend scan found no recognizable privileged credential or private key patterns; this is a scoped scan, not proof against every possible secret encoding.
- Real managed-Auth refresh burst returned 429, Retry-After 60. Real frontend reload made one refresh request, displayed a safe error, and made no automatic retry during the 10-second observation. Focused tests cover in-memory single-flight, cooldown and delayed concurrent 401s. Provider IP limits can aggregate users behind the Worker; no bypass or quota increase was introduced.

### Actual CPU measurements

Initial deployed samples included body-metric PATCH at 9 ms and set creation at 8 ms. Metric mutation now includes JWT-derived ownership in its own predicate; open-session set creation skips the redundant retry lookup while retaining parent/session authorization and transactional RLS.

After optimization, 81 representative requests succeeded as expected (including intentional authorization/validation denials); 64 requests matched actual Cloudflare tail CPU events, maximum 6 ms. Unmatched CPU is unmeasured, not inferred. A targeted follow-up matched all six body-metric creations at 2–4 ms. Metric PATCH matched eight events at 3–5 ms (client wall 483–1032 ms), and ten set writes matched at 4–6 ms (client wall 833–1177 ms). Network/DB wait is wall time, not Worker CPU. These bounded samples fit the current 10 ms free CPU ceiling but do not guarantee every future invocation.

Sanitized evidence: `remaining-endpoint-performance.json` and `refresh-rate-limit-evidence.json`.

### Actual CI

GitHub Actions runs [37503912864](https://github.com/laassiii/fitness-tracker-v2/actions/runs/37503912864) and [37505404145](https://github.com/laassiii/fitness-tracker-v2/actions/runs/37505404145) succeeded. The latter tested commit e7d4b1a, including type checks, unit tests, build, actual local database lint/RLS tests, API integration and browser checks. CI does not deploy production or enable scheduled backups.

### Real email validation (still in progress)

Custom SMTP configured only in managed Supabase Auth using Brevo Free (300 daily messages verified in the account and vendor documentation), with dedicated SMTP key kept outside Git in local DPAPI storage. Project URL/allowlist point to the production Pages app. Correct inline confirmation/recovery templates are visible in the project dashboard and Management API.

Early real Gmail verification messages contained the old/default template. A fresh disposable signup subsequently received the correct custom confirmation template and subject. The user opened its real email link; the actual deployed callback tab showed authenticated Your profile and Sign out, with no token parameters in the URL. Administrative read-only verification confirmed email_confirmed_at for that exact disposable alias. Signup verification is PASS; no local simulation or administrative confirmation substituted for the email link. A real recovery message contained the custom template and successfully opened the deployed Choose a new password screen, with token parameters removed from the URL. The user completed the required password-change handoff and reported successful sign-in. The actual deployed browser then showed the authenticated Your profile screen with Sign out, confirming recovery sign-in PASS.

Brevo per-contact tracking consent is enabled, with unknown consent tracking disabled and saved/reloaded. Nevertheless newly received SMTP authentication links are still rewritten through Brevo tracking hosts. This discrepancy is unresolved; do not claim no email tracking or mark full email privacy PASS. The Gmail sender is not an owned authenticated domain; Brevo rewrites its sender domain, and delivery to one mailbox does not guarantee broad deliverability. No paid plan/domain was purchased.

An opaque authentication link was accidentally included once in an earlier tool output. Its value is not retained in committed evidence. Do not claim that no auth-bearing URL was ever displayed. Both named email-test identities were verified as created within this validation window with explicit signup consent, then deleted using local administrative cleanup only. A final lookup confirmed neither identity remains, invalidating their outstanding test links and removing associated fixture records through database cascades. No other identity was deleted.

### Remaining gates

| Gate                                       | Result                        | Evidence / outstanding work                                                        |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| Authenticated production browser workflows | PASS                          | 7 real deployed browser tests                                                      |
| Deployed persistence                       | PASS                          | Empty application browser databases; independent context sees server records       |
| Real verification email                    | UNTESTED (delivery PASS)      | Default confirmation template/callback unresolved                                  |
| Real recovery/reset                        | UNTESTED (delivery/link PASS) | User password-update/sign-in handoff pending                                       |
| Refresh 429 handling                       | PASS                          | Real 429, one browser refresh, safe message, no observed retry storm               |
| Security hardening                         | FAIL / OPEN                   | Scoped API/RLS/rendering/header checks PASS; email tracking discrepancy unresolved |
| Representative CPU vs wall time            | PASS                          | 64 matched events plus 6 targeted metric writes; maximum 6 ms after optimization   |
| Actual GitHub Actions CI                   | PASS                          | Successful actual runs linked above                                                |

Legal documents remain templates requiring review/operator details before public launch. No scheduled backups, Phase 2 or architecture change was introduced.


Final continuation: oversized deployed auth JSON request returned HTTP 413 without a raw stack trace. Recovery and signup email gates both PASS after user handoffs. Email privacy remains FAIL/OPEN because newly delivered links still pass through Brevo tracking hosts despite saved consent settings. Resolve provider-wide SMTP tracking behavior before asserting tracking-free email or final production approval; no alternate provider or architecture change was introduced automatically.
