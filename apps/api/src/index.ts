import { ApiError, authenticate, authSession } from "./auth";
import { fitness } from "./fitness";
import {
  documents,
  consentStatus,
  acceptance,
  hasCurrentConsent,
} from "./legal";
import { jsonBody } from "./auth";
import { database } from "./database";
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  APP_ORIGIN: string;
  REQUEST_STATS?: { calls: number };
}
const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId,
    };
    try {
      if (request.method === "GET" && url.pathname === "/api/v1/health") {
        return Response.json({ status: "ok" }, { headers });
      }
      if (request.method === "GET" && url.pathname === "/api/v1/legal")
        return Response.json({ items: await documents(env) }, { headers });
      if (
        request.method === "POST" &&
        /^\/api\/v1\/auth\/(login|signup|refresh|logout|recover|verify|password)$/.test(
          url.pathname,
        )
      ) {
        const response = await authSession(
          request,
          env,
          url.pathname.split("/").at(-1)!,
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
        return response;
      }
      if (request.method === "GET" && url.pathname === "/api/v1/me") {
        const user = await authenticate(request, env);
        return Response.json({ user: { id: user.id } }, { headers });
      }
      if (url.pathname.startsWith("/api/v1/")) {
        const user = await authenticate(request, env);
        if (url.pathname === "/api/v1/me/consents") {
          if (request.method === "GET")
            return Response.json(await consentStatus(env, user), { headers });
          if (request.method === "POST") {
            const body = await jsonBody(request);
            if (
              Object.keys(body).some(
                (k) => !["accepted", "versions"].includes(k),
              )
            )
              throw new ApiError(422, "validation_error", "Unexpected field");
            acceptance(body, await documents(env));
            await database(env, user, "rpc/accept_current_documents", "POST", {
              p_terms: (body.versions as Record<string, string>).terms,
              p_privacy: (body.versions as Record<string, string>).privacy,
            });
            return Response.json(await consentStatus(env, user), { headers });
          }
        }
        if (!(await hasCurrentConsent(env, user)))
          throw new ApiError(
            403,
            "consent_required",
            "Accept the current Terms and Privacy Policy to continue",
          );
        if (
          !["GET", "HEAD"].includes(request.method) &&
          request.headers.get("Content-Type")?.split(";")[0] !==
            "application/json"
        )
          throw new ApiError(
            415,
            "unsupported_media_type",
            "Use application/json",
          );
        return Response.json(await fitness(request, env, user), {
          status: request.method === "POST" ? 201 : 200,
          headers,
        });
      }
      return Response.json(
        {
          code: "not_found",
          message: "Endpoint not found",
          request_id: requestId,
        },
        { status: 404, headers },
      );
    } catch (error) {
      const failure =
        error instanceof ApiError
          ? error
          : new ApiError(
              503,
              "service_unavailable",
              "Service is temporarily unavailable",
            );
      return Response.json(
        { code: failure.code, message: failure.message, request_id: requestId },
        { status: failure.status, headers },
      );
    }
  },
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stats = { calls: 0 };
    const response = await handler.fetch(request, {
      ...env,
      REQUEST_STATS: stats,
    });
    response.headers.set("X-Upstream-Requests", String(stats.calls));
    return response;
  },
};
