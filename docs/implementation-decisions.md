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
- Supabase CLI management authentication is currently missing. `supabase projects list` returns `AccessTokenRequiredError`. Public application configuration cannot authorize migration administration. Authenticate the CLI locally before linking the application project; never put management credentials into Worker bindings.

## Verification references

- https://developers.cloudflare.com/workers/platform/limits/
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://vite.dev/guide/
