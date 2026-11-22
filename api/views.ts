import { createHmac } from 'node:crypto';
import { siteConfig } from '../src/config/site';

type RequestLike = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};
type ResponseLike = {
  status: (code: number) => ResponseLike;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

const config = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : undefined;
};

const normalizePath = (value: unknown) => typeof value === 'string' && value.length <= 200
  && /^(?:\/|\/about\/|\/posts\/|\/posts\/[A-Za-z0-9._~%!-]+\/)$/.test(value) ? value : undefined;

// One transaction prevents concurrent requests from counting the same article twice.
const RECORD = `
local fresh = redis.call('SET', KEYS[1], '1', 'NX', 'EX', 1800)
local site = redis.call('INCR', KEYS[2])
redis.call('SADD', KEYS[3], ARGV[1])
local article = tonumber(redis.call('GET', KEYS[4]) or '0')
if fresh then article = redis.call('INCR', KEYS[4]) end
return {site, redis.call('SCARD', KEYS[3]), article}
`;

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Cache-Control', 'no-store');
  const storage = config();
  const host = request.headers.host;
  const origin = request.headers.origin;
  const production = new URL(siteConfig.siteUrl);
  if (!storage || host !== production.host || process.env.VERCEL_ENV === 'preview'
    || (origin !== undefined && origin !== production.origin)) {
    response.status(200).json({ enabled: false });
    return;
  }
  const redis = async (command: (string | number)[]) => {
    const result = await fetch(storage.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${storage.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(4000),
    });
    if (!result.ok) throw new Error('Counter storage unavailable');
    const payload = await result.json() as { result?: unknown; error?: string };
    if (payload.error) throw new Error('Counter storage command failed');
    return payload.result;
  };
  try {
    if (request.method === 'GET') {
      const [pageviews, visitors] = await Promise.all([
        redis(['GET', 'views:site:pageviews']), redis(['SCARD', 'views:site:visitors']),
      ]);
      response.status(200).json({ enabled: true, totals: { pageviews: Number(pageviews) || 0, visitors: Number(visitors) || 0 } });
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      response.status(405).json({ enabled: false });
      return;
    }
    let body: unknown = request.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }
    const path = normalizePath(body && typeof body === 'object' ? (body as { path?: unknown }).path : undefined);
    if (!path) { response.status(400).json({ enabled: false, error: 'invalid path' }); return; }
    const forwarded = request.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? 'unknown';
    const agent = request.headers['user-agent'] ?? '';
    // Salted identifiers avoid storing raw IP addresses or user agents.
    const visitor = createHmac('sha256', storage.token).update(`${ip}|${agent}`).digest('hex');
    const values = await redis(['EVAL', RECORD, 4, `views:seen:${path}:${visitor}`, 'views:site:pageviews', 'views:site:visitors', `views:total:${path}`, visitor]) as number[];
    if (!Array.isArray(values) || values.length !== 3 || !values.every(value => Number.isFinite(Number(value)))) throw new Error('Invalid counter result');
    response.status(200).json({ enabled: true, views: Number(values[2]), totals: { pageviews: Number(values[0]), visitors: Number(values[1]) } });
  } catch {
    response.status(503).json({ enabled: false });
  }
}
