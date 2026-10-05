import type { Env } from "./index";

// Request-scoped diagnostics only; never shared between users or cached.
export function upstream(env: Env, url: string, init: RequestInit) {
  if (env.REQUEST_STATS) env.REQUEST_STATS.calls++;
  return fetch(url, init);
}
