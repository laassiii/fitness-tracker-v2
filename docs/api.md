# Phase 1 API — database milestone

All paths start with `/api/v1`. Fitness endpoints require a verified Supabase access token in `Authorization: Bearer …`. Responses are JSON and `Cache-Control: no-store`. Errors contain `code`, `message`, `request_id`; provider/database details are suppressed. No ordinary request receives a privileged credential.

| Method | Path | Request / response |
|---|---|---|
| GET | /health | Public liveness only; does not claim database availability |
| POST | /auth/login | Email/password; memory access token and HttpOnly refresh cookie; strict Origin |
| POST | /auth/refresh | Empty object, refresh cookie; rotated session; strict Origin |
| GET | /me | Verified identity only |
| GET, PUT | /me/profile | Handle/display name/bio; owner context |
| GET, PUT | /me/preferences | kg/lb, timezone |
| GET | /me/privacy | Private-only Phase 1 defaults |
| GET | /exercises | Global catalog and own custom exercises, capped at 200 each |
| POST | /custom-exercises | Name, optional muscle/equipment/instructions |
| GET, PATCH | /custom-exercises/:id | Own exercise; name/metadata/archive timestamp |
| GET | /templates | Generic templates/exercises/targets, capped at 50 |
| GET, POST | /plans | Cursor page / name and description |
| GET, PATCH | /plans/:id | Own nested plan / name, description, archive timestamp |
| POST | /plans/:id/days | Name, position |
| PATCH, DELETE | /days/:id | Own day; name/position; history retains snapshot |
| POST | /days/:id/exercises | Exactly one global/custom exercise id; position, notes |
| PATCH, DELETE | /planned-exercises/:id | Position/notes or remove from current plan |
| POST | /planned-exercises/:id/targets | Position, optional reps/weight_kg/rest_seconds |
| PATCH, DELETE | /targets/:id | Edit/remove own target |
| GET, POST | /sessions | Cursor page; start with day_id or name and required UUID idempotency_key |
| GET | /sessions/:id | Own historical snapshot with exercises and actual sets |
| POST | /sessions/:id/exercises | Add an exercise to an open workout |
| POST | /session-exercises/:id/sets | Position, reps, weight_kg; optional UUID id, RPE, type, notes |
| PATCH, DELETE | /sets/:id | Edit/remove own set only while session is open |
| POST | /sessions/:id/complete | Empty object; close session; repeat completion returns existing state |
| POST | /sessions/:id/discard | Empty object; discard session |
| GET | /history | Completed sessions, bounded cursor page |
| GET | /progress | Up to 500 recent server-derived session/exercise observations |
| GET | /personal-records | Derived heaviest working set, most reps, estimated 1RM; capped at 200 exercises |
| GET, POST | /body-metrics | Cursor page / at least one optional measurement |
| GET, PATCH, DELETE | /body-metrics/:id | Own measurement; observed_at/weight/body-fat/waist/chest/notes |

## Authorization and validation

- GET/list queries always include authenticated ownership; global catalogs are the deliberate read-only exception. Resource IDs require an explicit owner lookup before mutation.
- Child creation verifies the parent's owner in the API; composite FKs and RLS independently reject forged parent/owner combinations.
- Client ownership fields and unrecognized query/body fields are rejected. `/me` never uses query identity as ownership.
- Numeric ranges and UUID/date/string validation are enforced in the API and again in database constraints. Request bodies are streamed with a 16 KiB cap.
- Pagination uses an opaque `(timestamp,id)` cursor, a default of 20 and maximum of 50. Session `status` filters use a closed enum.
- Typical errors: 401 authentication, 403 denied/origin, 404 inaccessible resource, 409 duplicate/closed workout, 413 request size, 415 content type, 422 invalid data, 503 upstream unavailable.

## Remaining API work

Signup, verification, logout/recovery, consent gating, template-to-plan copying, optimistic version checks, detailed progress windows, and rate limiting are not completed at this milestone. These routes must not be represented as finished or deployed. Sets prevent duplicates with position and optional UUID constraints; returning the existing response for a retried set write is still a follow-up. No frontend workflow is wired to these routes yet.
