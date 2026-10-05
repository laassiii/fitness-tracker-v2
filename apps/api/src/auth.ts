import type { Env } from "./index";
import { acceptance, documents } from "./legal";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function authenticate(
  request: Request,
  env: Env,
): Promise<{ id: string; token: string }> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 16384) {
    throw new ApiError(401, "unauthenticated", "Sign in to continue");
  }
  const token = authorization.slice(7);
  const result = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (result.status === 401 || result.status === 403)
    throw new ApiError(
      401,
      "unauthenticated",
      "Your session is invalid or expired",
    );
  if (!result.ok)
    throw new ApiError(
      503,
      "auth_unavailable",
      "Authentication is temporarily unavailable",
    );
  const user = (await result.json()) as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id))
    throw new ApiError(
      503,
      "auth_unavailable",
      "Authentication is temporarily unavailable",
    );
  return { id: user.id, token };
}

export function requireSameOrigin(request: Request, env: Env): void {
  const expected = env.APP_ORIGIN;
  if (!expected || request.headers.get("Origin") !== expected)
    throw new ApiError(403, "origin_rejected", "Request origin is not allowed");
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json")
    throw new ApiError(415, "unsupported_media_type", "Use application/json");
}

export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new ApiError(413, "payload_too_large", "Request is too large");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(422, "validation_error", "Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiError(422, "validation_error", "Expected an object");
  return body as Record<string, unknown>;
}

export async function authSession(
  request: Request,
  env: Env,
  action: string,
): Promise<Response> {
  requireSameOrigin(request, env);
  const body = await jsonBody(request);
  const fields: Record<string, string[]> = {
    login: ["email", "password"],
    signup: ["email", "password", "accepted", "versions"],
    refresh: [],
    logout: [],
    recover: ["email"],
    verify: ["token_hash", "type"],
    password: ["password"],
  };
  if (
    !fields[action] ||
    Object.keys(body).some((key) => !fields[action].includes(key))
  )
    throw new ApiError(422, "validation_error", "Unexpected field");
  const refresh = request.headers
    .get("Cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("__Host-fitness-refresh="))
    ?.slice("__Host-fitness-refresh=".length);
  let endpoint: string;
  let payload: Record<string, unknown>;
  const providerHeaders: Record<string, string> = {
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
  let method = "POST";
  if (action === "refresh") {
    if (!refresh || Object.keys(body).length)
      throw new ApiError(401, "unauthenticated", "Sign in to continue");
    endpoint = "token?grant_type=refresh_token";
    payload = { refresh_token: refresh };
  } else if (action === "login" || action === "signup") {
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !body.email.includes("@") ||
      typeof body.password !== "string" ||
      body.password.length < 1 ||
      body.password.length > 1024
    )
      throw new ApiError(
        422,
        "validation_error",
        "Provide an email and password",
      );
    if (action === "signup") {
      if ((body.password as string).length < 12)
        throw new ApiError(
          422,
          "validation_error",
          "Use a password with at least 12 characters",
        );
      acceptance(body, await documents(env));
      endpoint = `signup?redirect_to=${encodeURIComponent(env.APP_ORIGIN)}`;
      payload = {
        email: body.email,
        password: body.password,
        data: { consent_signup: { accepted: true, versions: body.versions } },
      };
    } else {
      endpoint = "token?grant_type=password";
      payload = body;
    }
  } else if (action === "verify") {
    if (
      typeof body.token_hash !== "string" ||
      !/^[a-zA-Z0-9_-]{20,256}$/.test(body.token_hash) ||
      !["email", "recovery"].includes(body.type as string)
    )
      throw new ApiError(422, "validation_error", "Invalid verification link");
    endpoint = "verify";
    payload = body;
  } else if (action === "recover") {
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !body.email.includes("@")
    )
      throw new ApiError(422, "validation_error", "Provide an email address");
    endpoint = `recover?redirect_to=${encodeURIComponent(env.APP_ORIGIN)}`;
    payload = { email: body.email };
  } else if (action === "logout" || action === "password") {
    if (action === "logout" && !request.headers.has("Authorization"))
      return Response.json(
        { signed_out: true },
        { headers: { "Set-Cookie": clearCookie() } },
      );
    const user = await authenticate(request, env);
    providerHeaders.Authorization = `Bearer ${user.token}`;
    if (action === "password") {
      if (
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        body.password.length > 1024
      )
        throw new ApiError(
          422,
          "validation_error",
          "Use a password with at least 12 characters",
        );
      endpoint = "user";
      method = "PUT";
      payload = { password: body.password };
    } else {
      endpoint = "logout?scope=local";
      payload = {};
    }
  } else {
    throw new ApiError(404, "not_found", "Endpoint not found");
  }
  const result = await fetch(`${env.SUPABASE_URL}/auth/v1/${endpoint}`, {
    method,
    headers: providerHeaders,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (result.status === 429)
    throw new ApiError(429, "rate_limited", "Try again later");
  if (!result.ok)
    throw new ApiError(
      result.status >= 500 ? 503 : 401,
      "authentication_failed",
      "Unable to sign in or restore your session",
    );
  if (action === "logout")
    return Response.json(
      { signed_out: true },
      { headers: { "Set-Cookie": clearCookie() } },
    );
  if (action === "recover")
    return Response.json({
      message: "If the account exists, a recovery email has been sent.",
    });
  if (action === "password") return Response.json({ updated: true });
  const session = (await result.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  if (action === "signup" && !session.access_token)
    return Response.json({
      verification_required: true,
      message: "Check your email to verify your account.",
    });
  if (!session.access_token || !session.refresh_token)
    throw new ApiError(
      503,
      "auth_unavailable",
      "Authentication is temporarily unavailable",
    );
  return Response.json(
    { access_token: session.access_token, expires_in: session.expires_in },
    {
      headers: {
        "Set-Cookie": `__Host-fitness-refresh=${session.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      },
    },
  );
}
export function clearCookie() {
  return "__Host-fitness-refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
