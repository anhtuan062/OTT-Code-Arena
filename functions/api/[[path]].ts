export interface ApiProxyEnvironment {
  OTT_API_BACKEND_ORIGIN?: string;
  OTT_API_PROXY_TIMEOUT_MS?: string;
}

export interface PagesFunctionContext<Environment extends ApiProxyEnvironment = ApiProxyEnvironment> {
  request: Request;
  env: Environment;
  params: Record<string, string | undefined>;
  next: () => Promise<Response>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

function backendOrigin(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) throw new Error('OTT_API_BACKEND_ORIGIN is required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('OTT_API_BACKEND_ORIGIN is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('OTT_API_BACKEND_ORIGIN must be an HTTPS origin without credentials or a path');
  }
  return url;
}

function proxyTimeout(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 1_000) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(parsed), MAX_TIMEOUT_MS);
}

function requestHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (name !== 'host' && name !== 'content-length') headers.set(name, value);
  });
  return headers;
}

function responseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers.append(name, value);
  });
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  for (const cookie of getSetCookie?.call(response.headers) ?? []) headers.append('set-cookie', cookie);
  const combinedCookie = response.headers.get('set-cookie');
  if (!getSetCookie && combinedCookie) headers.set('set-cookie', combinedCookie);
  return headers;
}

export async function proxyRequest(
  request: Request,
  env: ApiProxyEnvironment,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  let origin: URL;
  try {
    origin = backendOrigin(env.OTT_API_BACKEND_ORIGIN);
  } catch (error) {
    return Response.json({ error: 'API proxy is not configured' }, { status: 503 });
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const controller = new AbortController();
  const timeout = proxyTimeout(env.OTT_API_PROXY_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeout);
  const abortClient = () => controller.abort();
  request.signal.addEventListener('abort', abortClient, { once: true });
  if (request.signal.aborted) controller.abort();

  try {
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers: requestHeaders(request),
      redirect: 'manual',
      signal: controller.signal,
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
      init.duplex = 'half';
    }
    const upstream = await fetchImpl(target, init);
    clearTimeout(timer);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch (error) {
    if (controller.signal.aborted) return Response.json({ error: 'API backend timeout' }, { status: 504 });
    return Response.json({ error: 'API backend unavailable' }, { status: 502 });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abortClient);
  }
}

export const onRequest = (context: PagesFunctionContext) => proxyRequest(context.request, context.env);
