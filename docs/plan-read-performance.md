# Plan-read CPU diagnosis and validation

Date: 2026-10-06. Decision: **A) CPU GATE PASSED — continue remaining production validation**. This clears only the CPU hold; Phase 1 and other launch gates remain open. No frontend/email/CI/backup/Phase 2 work was performed in this task.

## Before

Accepted earlier production observation: 8 ms plan-read CPU on version 466e01bd-45c7-4d9c-b5e6-fdfc20460f1a (1572 ms Worker wall time). In the controlled realistic-data baseline, 12 successful matched reads measured 4–5 ms (median/mean 4.5 ms), five upstream requests and 30,948–30,996 response bytes. Instrumented baseline version: 387625bd-ef61-4007-b429-4faaa3b0677e. The earlier 8 ms outlier remains part of the evidence; it was not replaced or hidden by the later baseline.

## Diagnosis

Client uses same-origin /api/v1/plans/:id. Worker performs exactly one online Supabase JWT verification. The old path made five sequential upstream calls: Auth /user; current legal documents (including full content/hash); own consent records; owner-filtered parent lookup; owner-filtered nested plan fetch. The parent lookup read the same plan root twice. Legal content was downloaded/parsed for every fitness request although the gate only uses document type/version. The wildcard nested projection included owner UUIDs, parent references and timestamps unused by the current frontend. PostgREST already builds the nested result; Worker does no client-data merging or ORM hydration, but parses the response and serializes it again as JSON. Existing plan/day/exercise/target indexes cover the parent joins, so no index or schema change was justified.

Cloudflare tail reports invocation CPU, not per-function CPU. No reliable production per-function CPU profile was obtained. We measured upstream counts, response bytes and total CPU in a controlled before/after test. Those measurements support removing redundant fetch/parsing/serialization work; they do not establish how many CPU milliseconds each function consumes. Network waiting and the roughly 1.5 s wall time were never used as CPU estimates.

## Changes

1. GET resource reads authorize in the resource fetch with both id and verified JWT-derived owner_id predicates, and return 404 for an empty result. UUID validation remains. Separate ownership lookups before mutation remain. This removes one redundant read for plans, sessions, custom exercises and body metrics, without replacing Worker authorization with RLS.
2. Plan GET selects only frontend-required plan/day/exercise/target fields. Exercise references, notes, all targets/reps/kg/rest and historical semantics remain. Plan list, snapshots and mutations are unchanged.
3. Fitness consent gate reads current document versions and the user's accepted versions, rather than full legal text/timestamps. The two independent consent reads run in parallel after successful JWT verification. Both still run on every request; full legal/consent endpoint responses are unchanged. Parallelism reduces sequential waiting; the measured CPU reduction is the combined effect of the changes, not a claim that parallel network waits equal CPU savings.
4. A request-scoped upstream counter exposes an integer X-Upstream-Requests header. It neither caches data nor stores user identity. It is included in both baseline and optimized CPU measurements. Correlation uses random performance sample headers; capture saves only sample ID, endpoint, method, timings, outcome and version, not passwords/JWTs/cookies/header dumps.

No second backend, paid service, cache, service-role Worker binding, Redis, Durable Objects, database migration or authentication bypass.

## After

Measured optimized deployed version: 1b4be985-15a7-4f8a-8b42-c0802579436a.

- Successful plan reads sent: 60; matched Cloudflare CPU events: 36.
- CPU min 2 ms; median 2 ms; mean 2.167 ms; max 5 ms. The 5 ms first-read outlier is included.
- Worker wall time: median 473 ms, mean 505.556 ms, range 458–1074 ms.
- Client wall time across all successful plan requests: median 523 ms, range 500–1201 ms.
- Upstream requests: exactly four, down from five. Response: 14,758 bytes, down about 52%.
- All 60 successful plan responses retained four days, six exercises per day and four targets per exercise.

| Successful representative endpoint | Sent / CPU matched | CPU min / median / mean / max (ms) | Worker wall median (ms) | Upstream requests |
| ---------------------------------- | -----------------: | ---------------------------------- | ----------------------: | ----------------- |
| GET /plans/:id                     |            60 / 36 | 2 / 2 / 2.167 / 5                  |                     473 | 4                 |
| GET /plans                         |            18 / 11 | 2 / 2 / 2.182 / 3                  |                     497 | 4                 |
| GET /me/profile                    |            18 / 10 | 2 / 2 / 2.1 / 3                    |                     465 | 4                 |
| GET /exercises                     |            18 / 11 | 2 / 3 / 2.818 / 4                  |                     622 | 5                 |
| GET /sessions/:id                  |            18 / 10 | 2 / 2 / 2.3 / 3                    |                     467 | 4                 |
| POST /auth/login                   |            19 / 11 | 1 / 1 / 1.273 / 3                  |                     227 | 1                 |
| POST /auth/refresh                 |            44 / 12 | 1 / 1 / 1 / 1                      |                   157.5 | 1                 |
| POST /sessions                     |              4 / 4 | 4 / 4 / 4.25 / 5                   |                    1090 | 6                 |

Tail did not yield matched timing events for every request. Missing CPU values remain null, never zero or presumed passes; statistics use only actual matched events. All captured optimized representative/security invocations were at most 5 ms CPU. This is evidence for the measured representative workload, not a guarantee for arbitrary plan sizes, burst traffic, every location or all future endpoints.

The rapid auth-only burst had 26 successful refreshes followed by one upstream Supabase rate-limit response (HTTP 429). Across optimized batches, 44 refreshes succeeded; 12 have matched CPU events. The 429's CPU was not captured and is UNTESTED. The auth-only run stopped on that response and cleaned up; it originally exited nonzero. The repeatable script now treats 429 as a stress-burst stop and still verifies cleanup rather than retrying or hiding the response. This is separate from CPU headroom. Provider rate limits remain a consideration for later session/deployment validation. No limit was raised and no paid plan was introduced.

## Security and data

- 37 local API/unit/integration tests, 40 independent database assertions and eight browser workflows passed. New plan regression asserts four upstream calls, required response shape, omitted owner/timestamp metadata and invalid-UUID rejection. Typecheck: zero errors/warnings. Frontend and Worker dry-run builds pass.
- Optimized production Worker: three grouped production security/workflow tests pass, including bidirectional RLS/owner isolation and tampering, real Auth/JWT, sessions/set retries, closure/history and own metrics/consent.
- Realistic benchmark security checks pass in both directions: foreign plan 404; forged query/body ownership 422; invalid JWT 401; direct PostgREST RLS foreign read returns no rows.
- Fixture Auth admin credentials stay only in the test process for create/delete and cleanup verification. All data seeding uses each real user's JWT with the public key, exercising RLS. Ordinary Worker bindings contain only URL/origin/public key, verified by secret-name listing.
- Each realistic identity owns 3 plans, 12 days, 72 planned exercises and 288 targets (6 plans / 24 days / 144 exercises / 576 targets across two users), plus a snapshotted session. Two separate optimized batches used fresh identities/data; generic exercises only.
- Every benchmark and production security run erased its disposable users and verified deletion. Final independent production count check: zero Auth users, profiles, plans, days, planned exercises, targets, sessions, session exercises, sets, metrics and consents. Main D:\fitness-tracker-v2 and friend/demo data are unchanged.

## Repeatable regression procedure

Run from this worktree with authenticated CLIs; no production credential is pasted into a command.

1. Start capture with METRICS_FILE=performance-results/optimized-runtime.json: node scripts/capture-production-metrics.mjs.
2. Explicitly opt in with PRODUCTION_VALIDATION_REF=iewlobsbtwovcgpalgva and PERF_PHASE=optimized, then run node scripts/benchmark-production-plan.mjs. It creates only disposable identities, seeds realistic records, checks data/security and cleans up even on failure.
3. If more timing coverage is needed, capture a separate optimized-confirmation or optimized-auth runtime file and run the corresponding PERF_PHASE. Repeated auth requests may hit managed rate limits; stop rather than increase limits.
4. Run node scripts/summarize-plan-performance.mjs. It exits nonzero unless there is a single measured optimized version, at least 30 matched plan reads, at least 3 matched observations for every other requested representative/auth path, plan max <=6 ms, all matched requests <10 ms, four plan upstream calls and a <=20 KB response for this fixed fixture. Missing evidence produces OPEN, not a pass. Clear old performance datasets before a fresh gate run; the version guard prevents pooling incompatible deployed versions.

The 6 ms plan ceiling is a conservative operational regression budget chosen to preserve meaningful margin, not a Cloudflare guarantee or a replacement for the 10 ms platform limit. This run passes with a measured plan max of 5 ms (50% margin) and typical 2 ms CPU; the decision is not merely absence of samples over 10 ms.

## Decision

**A) CPU GATE PASSED — continue remaining production validation.** The CPU hold is cleared for this representative Phase 1 workload. Frontend, real email, GitHub CI, complete security hardening, backup/restore and final launch audit are still pending; Phase 1 is not complete.
