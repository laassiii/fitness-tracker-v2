import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('shares concurrent refresh and blocks further requests after a provider 429', async () => {
  let finish!: (value: Response) => void;
  const provider = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', provider);
  const {restore} = await import('./api');
  const first = restore(); const second = restore();
  finish(Response.json({code:'rate_limited',message:'Try again later'},{status:429}));
  const results = await Promise.allSettled([first,second]);
  expect(results.every(r => r.status === 'rejected')).toBe(true);
  expect(provider).toHaveBeenCalledTimes(1);
  await expect(restore()).rejects.toMatchObject({status:429});
  expect(provider).toHaveBeenCalledTimes(1);
});

it('retries a stale concurrent 401 with the rotated token without refreshing twice', async () => {
  let late!: (value: Response) => void;
  let requests=0;
  const provider=vi.fn((path:string) => {
    if(path.endsWith('/auth/login')) return Promise.resolve(Response.json({access_token:'old',expires_in:3600}));
    if(path.endsWith('/auth/refresh')) return Promise.resolve(Response.json({access_token:'new',expires_in:3600}));
    requests++;
    if(requests===1) return Promise.resolve(Response.json({code:'unauthenticated'},{status:401}));
    if(requests===2) return new Promise<Response>(resolve => {late=resolve;});
    return Promise.resolve(Response.json({ok:true}));
  });
  vi.stubGlobal('fetch',provider);
  const {signIn,api}=await import('./api');
  await signIn('test@example.invalid','test-password');
  const a=api('/me');const b=api('/me');await a;
  late(Response.json({code:'unauthenticated'},{status:401}));await b;
  expect(provider.mock.calls.filter(([p])=>p.endsWith('/auth/refresh'))).toHaveLength(1);
});
