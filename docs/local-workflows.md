# Local core workflows milestone

This milestone implements local Phase 1 workflows. It does not approve production deployment or declare Phase 1 complete.

## Run locally

Requirements: Node 24, Docker, Supabase CLI (npx), and a Playwright-supported browser.

1. Start this repository's isolated stack: `npx supabase start`. It uses project ID `fitness-tracker-phase1` and ports 55320–55329; never substitute the disposable cloud spike.
2. Run `npm run local:configure`. This writes ignored `apps/api/.dev.vars` with only the local URL, public key and frontend origin. It refuses a non-local URL. Do not print CLI status output or commit credentials.
3. In separate terminals run `npm run dev:api` and `npm run dev -- --port 5173 --strictPort`. Open http://localhost:5173. Vite proxies `/api` to the local Worker.
4. Local verification/recovery mail goes to Mailpit at http://127.0.0.1:55324. Production SMTP is not configured or verified by this milestone.

## Local checks

- `npm run typecheck` and `npm run build` (Worker build is a deployment dry run).
- `npx supabase db lint --local --level error` and `npx supabase test db`.
- PowerShell: `$env:RUN_LOCAL_INTEGRATION='1'; npm test`. On POSIX: `RUN_LOCAL_INTEGRATION=1 npm test`.
- `npx playwright install chromium`, then `npm run test:browser`. On this PC, set `PW_BROWSER_EXECUTABLE` to the installed Brave executable instead of downloading Chromium.

The API harness uses actual local Supabase Auth, PostgreSQL and PostgREST. Local-only admin fixture setup/cleanup is outside Worker handling and refuses a remote database. Browser tests exercise the running local Worker and Svelte frontend. They create disposable identities and remove them after testing. pgTAP rolls back its fixtures. No personal/friend demo data is imported.

## Scope and security

Implemented signup, verification, recovery, signin/out/restoration; consent; profile/onboarding; generic and owned exercise catalogs; templates and plans; actual workout sessions and sets; completion/history; metrics, progression and derived PR charts. UI state and access tokens exist only in memory. Authentication refresh uses a Secure HttpOnly SameSite=Lax cookie. Exact Origin and JSON are required on auth cookie operations; production needs a tested same-origin API topology.

API authorization derives identity from verified Supabase JWTs, checks ownership and consent, and uses the public key plus the user's JWT for PostgREST. PostgreSQL RLS is an independent ownership layer. RLS ownership alone does not enforce the product's current-consent gate.

Signup must record accepted versions before an email-confirmed JWT exists. The narrowly scoped `record_signup_consent` security-definer Auth insert trigger is the only newly added privileged runtime database operation: it uses Auth's generated NEW.id, validates the two current versions, and records server timestamps. Client metadata cannot choose ownership or acceptance time. Direct execution is revoked for public/anon/authenticated. No privileged key enters Worker request handling. Migration and test-admin operations remain privileged tooling.

Sessions snapshot planned names/targets. Later plan changes do not rewrite history. Session start and template copying use UUID idempotency keys; sets require stable UUIDs. Identical concurrent set retries return one row; changed payloads with the same key fail. Closed sessions reject new or changed sets, while identical saved retries remain valid.

## Evidence and remaining gates

Local checks: 36 API/unit/integration tests, 40 PostgreSQL assertions, and 8 browser workflow tests. Browser checks include mobile overflow, safe user text rendering, restoration, recovery and empty browser storage. CI workflow includes these checks but has not been run on GitHub for this milestone.

Migrations 004/005 are local only. Previously accepted 001–003 are unchanged. Do not push the new migrations or deploy without the next milestone's authorization.

Before production: apply reviewed migrations; run production disposable two-user RLS/API checks; validate deployed Worker and CPU separately from wall time; deploy/test same-origin frontend/session topology; verify actual transactional email, verification and recovery delivery; execute CI; validate external encrypted backup and restore; configure/test rate limits and security headers; review/publish legal templates. No production email readiness or Cloudflare performance claim is made here.

Known limits: progress returns 500 observations; catalog and PR results are bounded; metrics/history use pagination. Planned set editing uses uniform targets per exercise. Completed-workout corrections are not exposed. Plan edits use last-write-wins rather than optimistic concurrency. Legal documents are development templates requiring appropriate review. No social functionality or persistent offline queue exists.
