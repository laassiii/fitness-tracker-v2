import type { Env } from './index';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function authenticate(request: Request, env: Env): Promise<{ id: string; token: string }> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 16384) {
    throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
  }
  const token = authorization.slice(7);
  const result = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000)
  });
  if (result.status === 401 || result.status === 403) throw new ApiError(401, 'unauthenticated', 'Your session is invalid or expired');
  if (!result.ok) throw new ApiError(503, 'auth_unavailable', 'Authentication is temporarily unavailable');
  const user = await result.json() as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new ApiError(503, 'auth_unavailable', 'Authentication is temporarily unavailable');
  return { id: user.id, token };
}

export function requireSameOrigin(request: Request, env: Env): void {
  const expected = env.APP_ORIGIN;
  if (!expected || request.headers.get('Origin') !== expected) throw new ApiError(403, 'origin_rejected', 'Request origin is not allowed');
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new ApiError(415, 'unsupported_media_type', 'Use application/json');
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new ApiError(413, 'payload_too_large', 'Request is too large'); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new ApiError(422, 'validation_error', 'Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(422, 'validation_error', 'Expected an object');
  return body as Record<string, unknown>;
}

export async function authSession(request: Request, env: Env, action: string): Promise<Response> {
  requireSameOrigin(request, env);
  const body = await jsonBody(request);
  if (Object.keys(body).some(key => !['email', 'password'].includes(key))) throw new ApiError(422, 'validation_error', 'Unexpected field');
  const refresh = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('__Host-fitness-refresh='))?.slice('__Host-fitness-refresh='.length);
  let endpoint: string;
  let payload: Record<string, unknown>;
  if (action === 'refresh') {
    if (!refresh || Object.keys(body).length) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    endpoint = 'token?grant_type=refresh_token'; payload = { refresh_token: refresh };
  } else if (action === 'login') {
    if (typeof body.email !== 'string' || body.email.length > 254 || !body.email.includes('@') || typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 1024) throw new ApiError(422, 'validation_error', 'Provide an email and password');
    endpoint = 'token?grant_type=password'; payload = body;
  } else { throw new ApiError(404, 'not_found', 'Endpoint not found'); }
  const result = await fetch(`${env.SUPABASE_URL}/auth/v1/${endpoint}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
  });
  if (result.status === 429) throw new ApiError(429, 'rate_limited', 'Try again later');
  if (!result.ok) throw new ApiError(result.status >= 500 ? 503 : 401, 'authentication_failed', 'Unable to sign in or restore your session');
  const session = await result.json() as { access_token: string; refresh_token: string; expires_in: number };
  return Response.json({ access_token: session.access_token, expires_in: session.expires_in }, {
    headers: { 'Set-Cookie': `__Host-fitness-refresh=${session.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` }
  });
}
