// Forward the original request, including Origin and cookies, to the existing API.
// The API remains responsible for authentication, authorization and validation.
export const onRequest = async (context: {
  request: Request;
  env: { API: { fetch(request: Request): Promise<Response> } };
}): Promise<Response> => context.env.API.fetch(context.request);
