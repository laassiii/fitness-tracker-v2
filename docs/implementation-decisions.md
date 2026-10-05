# Phase 1 implementation decisions

- Approved stack: Svelte 5, TypeScript, Vite, Cloudflare Pages and a TypeScript Worker; Supabase Auth and authenticated PostgREST with independent PostgreSQL RLS.
- Application project: `iewlobsbtwovcgpalgva`. The disposable deployment project is never an application target.
- The existing root static app remains preserved during development. Only `apps/web/dist` will be deployed as the new frontend; old friend JSON/photos are not build inputs.
- Application state is temporary memory only. No offline queue, browser database, or persistent fitness cache.
- Ordinary Worker requests use only the publishable key and the authenticated user's token. Privileged credentials are reserved for migration/admin tooling, never normal request handling.
- Production migrations require validation against local PostgreSQL first. Docker's local engine must be available for independent database tests.
- Email delivery, backups, deployed performance and deployment configuration remain launch gates until actually verified.
- Foundation screens are development scaffolding, not completed Phase 1 workflows.

## Authentication boundary milestone

- `GET /api/v1/me` verifies the access token with Supabase Auth and uses only the verified identity. No user data queries exist yet.
- Initial login/refresh adapters return access tokens for in-memory use and set a Secure, HttpOnly, SameSite=Lax host-only refresh cookie. These adapters require an exact configured Origin and JSON request body. Production must expose the API under the frontend origin before this cookie flow is deployed. Cross-site Pages/Workers defaults are not a tested session topology.
- Signup, logout, recovery, consent and frontend session restoration are not implemented yet. No production deployment has occurred.
- Unit tests mock the Auth transport; they are not evidence of deployed authentication or database RLS.
- Supabase CLI management authentication was completed through its interactive browser verification flow. The local project is linked to `iewlobsbtwovcgpalgva`. Management authentication remains confined to CLI migration tooling, never Worker bindings.

## Database/API milestone

- The local Supabase stack uses ports 55320–55329 and project id `fitness-tracker-phase1` to avoid modifying another local project's stack. Production linking uses the ignored `.temp/project-ref`, independently of this local container name.
- Core migrations create profiles, preferences, private-only privacy settings, a global exercise catalog, user exercises, templates and targets, plans/days/exercises/targets, sessions with snapshots, performed sets, optional body metrics, and versioned consent records.
- Each owned exposed table has owner SELECT/INSERT/UPDATE/DELETE policies (consent only SELECT/INSERT). Composite foreign keys prevent cross-owner parent references. Public catalogs are read-only. Security-invoker views derive progress and PRs.
- Closed session data is immutable for ordinary authenticated requests. Privileged database administration may erase accounts and their dependent data; it is explicitly permitted in maintenance triggers. This privileged path is not available in Worker request handling.
- The local integration harness temporarily uses a local-only admin key to create and erase two disposable Auth identities. Worker requests receive only the publishable key and each user's real JWT. The harness refuses a non-local URL and tests cannot create fixtures in production.
- 32 pgTAP assertions independently exercise RLS/integrity. 11 local API integration tests exercise real Auth/PostgREST reads/writes plus the 5 authentication unit tests. None are substitutes for deployed Cloudflare CPU measurements.
- Plans/custom exercises are archived via PATCH rather than hard-deleted through the API. Historical snapshots remain intact. Sessions can be completed/discarded; ordinary completed-session correction is intentionally not exposed yet.
- Progress is currently bounded to 500 session/exercise observations. PRs are server-derived over all completed working sets. Estimated 1RM uses Epley for 1–10 reps and is an estimate, not a measured record. Progress-window filtering and chart UX remain unfinished.
- Full browser authentication workflows, email delivery, rate limiting, legal content publication, the frontend fitness workflows, production deployment/CPU evidence, and backups remain unfinished launch work.

## Verification references

- https://developers.cloudflare.com/workers/platform/limits/
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://vite.dev/guide/

## Local workflows milestone (supersedes earlier unfinished-work notes)

All core local frontend workflows are now wired and tested; see `local-workflows.md` for setup, evidence and outstanding production gates. Signup, verification, recovery, logout, consent gating and template copying are implemented locally. No new migration was applied remotely and no application deployment occurred. New migrations 004/005 add atomic template/set operations, legal content and the narrowly scoped signup-consent trigger; previously accepted migrations remain unchanged. The privileged Auth insert trigger is documented separately from ordinary invoker RPCs and user-JWT PostgREST requests.
