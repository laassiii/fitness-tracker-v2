# Production validation: stopped at CPU gate

Date: 2026-10-05. Accepted baseline: 680c710. Phase 1 remains OPEN.

## Implemented

Production migrations 004/005 applied through authenticated CLI to fitness-tracker-prod (iewlobsbtwovcgpalgva). Prior migrations unchanged. Worker deployed at https://fitness-tracker-api.fitness-fastapi-worker-spike.workers.dev (the account subdomain name does not indicate use of the disposable Supabase project). Measured version: 466e01bd-45c7-4d9c-b5e6-fdfc20460f1a. Cloudflare dashboard explicitly identifies Workers Free as Current plan; no upgrade or paid service was added. Frontend remains undeployed.

## Tested locally

Accepted baseline: 36 API/unit/integration tests, 40 database assertions, eight browser workflows; frontend/Worker builds and typecheck passed. These do not prove production email or deployed browser behavior. New opt-in production harness is separate from local tests and refuses any project reference other than the intended application project.

## Tested in production

- All five migrations recorded; 118 constraints validated, no invalid indexes, no public table without RLS; derived views use security_invoker. No unexpected user/application records existed before tests.
- Production Auth/PostgREST with local handler: three grouped security/workflow tests passed after correcting a test assertion to the existing {id} response contract. The initial assertion failure was not a production API failure.
- Deployed Worker with real production Auth/PostgREST: same three grouped tests passed. Both identities authenticate with real JWTs, own profile create/read/update, plan/day/exercise/session/set operations, metrics read/write, consent and history. Both directions deny foreign profiles/plans/sessions/metrics/consent through direct PostgREST RLS; resource API IDs deny foreign records; query/body owner tampering cannot select another identity. The consent endpoint ignores extraneous identity query fields and still returns only the JWT owner's records.
- Session/set retry integrity, completion, closed-session mutation rejection, snapshots after day edits and history retrieval pass.
- Deployed health 200, unauthenticated /me 401, public legal 200. Normal Worker binds only project URL, exact frontend origin and public key, verified with secret names and source.
- Privileged production credential appears only in the opt-in test process for temporary Auth creation/deletion. Never passed to Worker Env or ordinary requests. These are administrative validation operations, not product request handling.
- Both runs cleaned their temporary Auth identities. Final production checks: zero Auth users, profiles, plans, sessions, session exercises, sets, metrics and consent records. No friend/demo data imported or modified.

## CPU stop condition

Cloudflare tail reported 72 sanitized invocations with actual cpuTime and wallTime, not CPU inferred from client latency. Maximum observed CPU: 8 ms for GET plan; that particular invocation's Worker wall time was 1572 ms. Overall measured version above. No observed sample exceeded 10 ms; an 8 ms observation leaves only 2 ms margin, so it is treated conservatively as approaching the cap and triggers the user's STOP instruction. This is a validation hold, not proof the TypeScript architecture is incompatible. No optimization was deployed after the stop condition. The already running security test completed and cleaned its fixtures.

Cloudflare documents 10 ms Free CPU and excludes network waiting from CPU: https://developers.cloudflare.com/workers/platform/limits/

| Endpoint                                     | Captured samples | CPU ms range | Worker wall ms range |
| -------------------------------------------- | ---------------: | -----------: | -------------------: |
| GET /api/v1/me                               |                3 |          0–1 |                1–169 |
| GET /api/v1/health                           |                1 |          0–0 |                  1–1 |
| GET /api/v1/legal                            |                1 |          1–1 |              690–690 |
| POST /api/v1/me/consents                     |                2 |          3–4 |             788–1102 |
| PUT /api/v1/me/profile                       |                6 |          2–3 |              452–945 |
| GET /api/v1/me/profile                       |                3 |          1–2 |              426–614 |
| POST /api/v1/plans                           |                4 |          2–3 |              442–865 |
| GET /api/v1/plans/REDACTED                   |                4 |          3–8 |             862–1877 |
| POST /api/v1/plans/REDACTED/days             |                2 |          3–4 |              777–786 |
| GET /api/v1/exercises                        |                2 |          4–4 |             770–1019 |
| POST /api/v1/days/REDACTED/exercises         |                2 |          3–3 |              926–940 |
| POST /api/v1/sessions                        |                4 |          3–6 |             915–1237 |
| GET /api/v1/sessions/REDACTED                |                6 |          2–3 |              597–815 |
| POST /api/v1/session-exercises/REDACTED/sets |                6 |          3–4 |             947–1379 |
| POST /api/v1/body-metrics                    |                2 |          4–4 |              604–651 |
| PATCH /api/v1/body-metrics/REDACTED          |                2 |          2–3 |              770–776 |
| GET /api/v1/body-metrics/REDACTED            |                4 |          2–3 |              605–879 |
| GET /api/v1/me/consents                      |                6 |          1–2 |              449–689 |
| POST /api/v1/sessions/REDACTED/complete      |                4 |          2–4 |              612–922 |
| PATCH /api/v1/sets/REDACTED                  |                2 |          3–4 |             930–1167 |
| PATCH /api/v1/days/REDACTED                  |                2 |          3–3 |              782–793 |
| GET /api/v1/history                          |                2 |          2–2 |              638–897 |
| GET /api/v1/progress                         |                2 |          2–2 |              624–626 |

Samples include legitimate ownership-denied requests and retries as well as successes. Cloudflare redacts resource UUIDs in tail paths. Tail headers and JWTs are processed only in memory and discarded; only endpoint/method, timings, outcome and deployed version are persisted. Reports do not contain credentials. These are small validation fixtures, not maximum-size data or sustained-load evidence. Login/refresh CPU was not measured because fixture login used Supabase Auth directly; /me verifies authentication but is not a session-cookie test.

## Gate table

| Gate                                                  | Status                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Production migrations/schema/RLS configuration        | PASS                                                                   |
| Two-user production RLS, authorization and tampering  | PASS                                                                   |
| Disposable identity/data removal                      | PASS                                                                   |
| Worker deployment, JWT identity, DB read/write        | PASS                                                                   |
| Representative CPU approval                           | FAIL — hold at 8 ms approaching cap; full budget validation incomplete |
| Production frontend/browser workflows                 | UNTESTED                                                               |
| Deployed browser persistence                          | UNTESTED                                                               |
| Production verification/recovery email                | UNTESTED                                                               |
| Actual GitHub Actions execution                       | UNTESTED                                                               |
| Complete deployed security hardening                  | UNTESTED                                                               |
| Encrypted R2 backup/upload/checksum/retention/restore | UNTESTED                                                               |
| Final launch audit                                    | UNTESTED                                                               |

## Launch blockers and next work

Investigate plan-read CPU, remove redundant database work while retaining explicit JWT-derived owner predicates and RLS, then redeploy/repeat measurements with representative populated plans/progress. Do not infer the observed 8 ms cause or CPU from wall time. Measure login/refresh separately. Continue later stages only after the CPU hold is resolved. Frontend same-origin session topology, actual email delivery, CI, security headers/rate limits and backup/restore remain mandatory gates. Legal templates require review/contact/retention details before real-user launch. The Supabase security-advisor CLI request did not complete and was interrupted; do not treat it as passing.

R2 pricing was verified read-only: Standard storage includes 10 GB-month, one million Class A and ten million Class B operations monthly, with free egress; excess usage is billable. No R2 resource or billing enrollment was created. This is pricing research only, not backup validation: https://developers.cloudflare.com/r2/pricing/

Known limits remain the accepted bounded catalog/progress responses, last-write-wins plan editing, no completed-workout correction UI and development legal templates. Production workload/scaling, browser session and production SMTP readiness are unverified. No Phase 2, friend data migration, Git history rewrite or paid infrastructure. D:\fitness-tracker-v2 is unchanged.
