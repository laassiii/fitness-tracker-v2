import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
const env: Env = { SUPABASE_URL: 'https://auth.invalid', SUPABASE_PUBLISHABLE_KEY: 'test-public-key', APP_ORIGIN: 'https://app.invalid' };
afterEach(() => vi.unstubAllGlobals());
describe('authentication boundary', () => {
  it('rejects unauthenticated requests without contacting the provider', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider);
    expect((await worker.fetch(new Request('https://api.invalid/api/v1/me'), env)).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });
  it('rejects tokens refused by the actual verification adapter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    expect((await worker.fetch(new Request('https://api.invalid/api/v1/me', { headers: { Authorization: 'Bearer invalid' } }), env)).status).toBe(401);
  });
  it('uses the verified provider identity rather than a query identity', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id })));
    const response = await worker.fetch(new Request('https://api.invalid/api/v1/me?user_id=someone-else', { headers: { Authorization: 'Bearer valid' } }), env);
    expect(await response.json()).toEqual({ user: { id } });
  });
  it('rejects cross-origin cookie operations', async () => {
    const response = await worker.fetch(new Request('https://api.invalid/api/v1/auth/refresh', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' }), env);
    expect(response.status).toBe(403);
  });
  it('returns a sanitized failure for provider outages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret provider detail')));
    const response = await worker.fetch(new Request('https://api.invalid/api/v1/me', { headers: { Authorization: 'Bearer valid' } }), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret provider detail');
  });
});
