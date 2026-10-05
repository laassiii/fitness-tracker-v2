import { ApiError } from "./auth";
import type { Env } from "./index";
import { upstream } from "./upstream";
export interface Identity {
  id: string;
  token: string;
}
export async function database(
  env: Env,
  user: Identity,
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<unknown> {
  const response = await upstream(env, `${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
    };
    if (problem.code === "23505")
      throw new ApiError(
        409,
        "conflict",
        "A record with these values already exists",
      );
    if (problem.code === "P0002")
      throw new ApiError(404, "not_found", "Resource not found");
    if (["23503", "23514", "23502", "22P02"].includes(problem.code ?? ""))
      throw new ApiError(
        422,
        "validation_error",
        "Invalid record or workout state",
      );
    if (response.status === 401)
      throw new ApiError(401, "unauthenticated", "Sign in to continue");
    if (response.status === 403)
      throw new ApiError(403, "forbidden", "This operation is not allowed");
    throw new ApiError(
      503,
      "database_unavailable",
      "Data service is temporarily unavailable",
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function owned(
  env: Env,
  user: Identity,
  table: string,
  id: string,
  key = "id",
  owner = "owner_id",
): Promise<Record<string, unknown>> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new ApiError(422, "validation_error", "Invalid identifier");
  const rows = (await database(
    env,
    user,
    `${table}?${key}=eq.${id}&${owner}=eq.${user.id}&limit=1`,
  )) as Record<string, unknown>[];
  if (!rows.length) throw new ApiError(404, "not_found", "Resource not found");
  return rows[0];
}
