import { ApiError, authenticate, authSession } from './auth';
import { fitness } from './fitness';
export interface Env { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; APP_ORIGIN: string }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Request-ID': requestId };
    try {
    if (request.method === 'GET' && url.pathname === '/api/v1/health') {
      return Response.json({ status: 'ok' }, { headers });
    }
    if (request.method === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/refresh'].includes(url.pathname)) {
      const response = await authSession(request, env, url.pathname.split('/').at(-1)!);
      Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/me') {
      const user = await authenticate(request, env);
      return Response.json({ user: { id: user.id } }, { headers });
    }
    if (url.pathname.startsWith('/api/v1/')) {
      const user = await authenticate(request, env);
      if (!['GET','HEAD'].includes(request.method) && request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new ApiError(415,'unsupported_media_type','Use application/json');
      return Response.json(await fitness(request, env, user), { status: request.method==='POST'?201:200, headers });
    }
    return Response.json({ code: 'not_found', message: 'Endpoint not found', request_id: requestId }, { status: 404, headers });
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(503, 'service_unavailable', 'Service is temporarily unavailable');
      return Response.json({ code: failure.code, message: failure.message, request_id: requestId }, { status: failure.status, headers });
    }
  }
};
