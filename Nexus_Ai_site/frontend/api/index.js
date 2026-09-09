/**
 * Vercel Serverless: все /api/* → Nexus Cloud /v1/*
 * Vite: catch-all api/[...path].js не матчит вложенные пути — нужен index + rewrite в vercel.json.
 */
const CLOUD_BASE = (process.env.NEXUS_CLOUD_SERVER_URL || 'https://nexus-cloud-bxcc.onrender.com').replace(
  /\/$/,
  ''
);

const IDE_ONLY_PREFIXES = ['files', 'workspace', 'search', 'git', 'tools', 'db', 'ws'];

function cloudPath(sub) {
  return `${CLOUD_BASE}/v1/${sub}`;
}

function resolveSubPath(req) {
  const q = req.query?.__subpath;
  if (q) return Array.isArray(q) ? q.join('/') : String(q);
  const raw = (req.url || '').split('?')[0];
  const m = raw.match(/^\/api\/?(.*)$/);
  return m ? m[1] : '';
}

function forwardHeaders(req) {
  const h = {};
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth) h.Authorization = auth;
  const adminPw = req.headers['x-admin-password'] || req.headers['X-Admin-Password'];
  if (adminPw) h['X-Admin-Password'] = adminPw;
  const ct = req.headers['content-type'] || req.headers['Content-Type'];
  if (ct) h['Content-Type'] = ct;
  else if (req.method !== 'GET' && req.method !== 'HEAD') h['Content-Type'] = 'application/json';
  return h;
}

function requestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (!req.body) return undefined;
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
}

function isSseRoute(sub) {
  return /\/stream$/i.test(sub) || sub.includes('/stream/');
}

async function pipeUpstreamStream(upstream, res) {
  res.status(upstream.status);
  const ct = upstream.headers.get('content-type') || 'text/event-stream';
  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) res.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  res.end();
}

export default async function handler(req, res) {
  const sub = resolveSubPath(req);

  if (IDE_ONLY_PREFIXES.some((p) => sub === p || sub.startsWith(`${p}/`))) {
    res.status(503).json({
      detail:
        'IDE (файлы, git, терминал) доступны только локально или в Nexus IDE Desktop. На Vercel — чат, тарифы и профиль.',
    });
    return;
  }

  const url = new URL(cloudPath(sub));
  if (req.url && req.url.includes('?')) {
    const qs = req.url.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    params.delete('__subpath');
    const rest = params.toString();
    if (rest) url.search = rest;
  }

  try {
    const init = {
      method: req.method,
      headers: forwardHeaders(req),
      redirect: 'manual',
    };
    const body = requestBody(req);
    if (body) init.body = body;

    const upstream = await fetch(url.toString(), init);

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location');
      if (location) {
        res.redirect(upstream.status, location);
        return;
      }
    }

    if (sub === 'auth/profile' && req.method === 'GET') {
      const auth = req.headers.authorization || req.headers.Authorization;
      if (!auth) {
        res.status(200).json({ authorized: false, profile: null });
        return;
      }
      if (upstream.status === 401) {
        res.status(200).json({ authorized: false, profile: null });
        return;
      }
      if (!upstream.ok) {
        res.status(upstream.status).send(await upstream.text());
        return;
      }
      const profile = await upstream.json();
      res.status(200).json({ authorized: true, profile });
      return;
    }

    if (
      (sub === 'auth/login' || sub === 'auth/register') &&
      req.method === 'POST' &&
      upstream.ok
    ) {
      const data = await upstream.json();
      res.status(200).json({
        status: 'success',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
      });
      return;
    }

    if (sub === 'auth/logout' && req.method === 'POST') {
      const text = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', 'application/json');
      res.send(text);
      return;
    }

    if (sub === 'auth/refresh' && req.method === 'POST') {
      const text = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', 'application/json');
      res.send(text);
      return;
    }

    const upstreamCt = upstream.headers.get('content-type') || '';
    if (isSseRoute(sub) || upstreamCt.includes('text/event-stream')) {
      await pipeUpstreamStream(upstream, res);
      return;
    }

    const text = await upstream.text();
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.send(text);
  } catch (e) {
    res.status(503).json({
      detail: `Cloud недоступен (${CLOUD_BASE}).`,
      error: String(e.message || e),
    });
  }
}

export const config = {
  api: { bodyParser: true },
};
