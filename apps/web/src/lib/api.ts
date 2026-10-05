export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
type SessionToken = { access_token: string; expires_in: number };
let accessToken: string | null = null;
let expiresAt = 0;
let refreshing: Promise<void> | null = null;
export function clearSession() {
  accessToken = null;
  expiresAt = 0;
}
function saveSession(session: SessionToken) {
  accessToken = session.access_token;
  expiresAt = Date.now() + session.expires_in * 1000;
}
async function transport<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.code ?? "request_failed",
      data.message ?? "Request failed",
      response.status,
    );
  return data as T;
}
export async function restore() {
  if (!refreshing)
    refreshing = transport<SessionToken>("/auth/refresh", "POST", {})
      .then(saveSession)
      .catch((error) => {
        clearSession();
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (accessToken && Date.now() > expiresAt - 30000) await restore();
  try {
    return await transport<T>(path, method, body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && accessToken) {
      await restore();
      return transport<T>(path, method, body);
    }
    throw error;
  }
}
export async function signIn(email: string, password: string) {
  saveSession(
    await transport<SessionToken>("/auth/login", "POST", { email, password }),
  );
}
export async function signUp(
  email: string,
  password: string,
  versions: { terms: string; privacy: string },
) {
  const response = await transport<
    Partial<SessionToken> & { verification_required?: boolean }
  >("/auth/signup", "POST", { email, password, accepted: true, versions });
  if (response.access_token) saveSession(response as SessionToken);
  return response;
}
export async function verify(token_hash: string, type: string) {
  saveSession(
    await transport<SessionToken>("/auth/verify", "POST", { token_hash, type }),
  );
}
export async function signOut() {
  await transport("/auth/logout", "POST", {});
  clearSession();
}
export const recover = (email: string) =>
  transport<{ message: string }>("/auth/recover", "POST", { email });
export const changePassword = (password: string) =>
  transport("/auth/password", "POST", { password });
