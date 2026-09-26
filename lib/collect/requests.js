'use strict';

/**
 * Web requests: the connection imports can't see.
 *
 * A screen reaches the server with fetch('/api/chat'), not with an import, so
 * import analysis alone splits every app into a front half and a back half with
 * nothing between them. This finds the calls, finds the server routes that
 * answer them, and lets the map draw the link.
 *
 * Calls: fetch, axios, ky, $fetch/ofetch, useSWR, useFetch, and any wrapper
 *   called with a literal "/api/..." path (apiFetch('/api/chat')). Template
 *   literals work: `${BASE}/api/recipes/${id}` becomes /api/recipes/:param.
 * Routes: Next.js app router (app/.../route.ts) and pages router (pages/api),
 *   SvelteKit (+server.ts), Nuxt (server/api, server/routes), and Express-style
 *   app.get('/path') / router.post('/path'), including app.use('/api', router).
 */

const QUOTED = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\\n])*?)\1`;

// Known HTTP clients: any path starting with "/".
const KNOWN_CALL = new RegExp(String.raw`\b(?:fetch|axios(?:\.(?:get|post|put|patch|delete|head|request))?|ky(?:\.(?:get|post|put|patch|delete))?|\$fetch|ofetch|useSWR(?:Mutation|Infinite|Immutable)?|useFetch|useLazyFetch|superagent\.(?:get|post|put|patch|delete))\s*(?:<[^<>()]*>)?\s*\(\s*` + QUOTED, 'g');
// Anything else, only when the path clearly targets an API.
const API_CALL = new RegExp(String.raw`\b[A-Za-z_$][\w$.]*\s*(?:<[^<>()]*>)?\s*\(\s*` + QUOTED, 'g');

const HTTP_METHOD = '(?:get|post|put|patch|delete|all|head|options)';
const SERVER_ROUTE = new RegExp(String.raw`\b(?:app|router|server|api|routes?|hono|fastify|r)\.` + HTTP_METHOD + String.raw`\s*\(\s*(['"\x60])(\/[^'"\x60]*)\1`, 'g');
const MOUNT = /\.(?:use|route|register)\(\s*(['"`])(\/[^'"`]*)\1/g;

/** "/api/recipes/${id}?x=1" -> ["api", "recipes", ":param"], or null if not a path. */
function clientSegments(raw) {
  let s = raw.trim();
  // A full URL is someone else's service (Google, Stripe, ...) unless it
  // targets an /api/ path, as when a mobile app calls its own web backend.
  if (/^https?:\/\//i.test(s)) {
    s = s.replace(/^https?:\/\/[^/]+/i, '');
    if (!/^\/api\//.test(s)) return null;
  }
  s = s.replace(/^\$\{[^}]*\}/, '');           // `${BASE_URL}/api/...`
  if (!s.startsWith('/')) return null;
  s = s.split(/[?#]/)[0];
  const segs = s.split('/').filter(Boolean).map((x) => (/\$\{/.test(x) ? ':param' : x));
  if (!segs.length || segs.some((x) => /[\s<>{}]/.test(x) && x !== ':param')) return null;
  return segs;
}

function extractRequests(text) {
  const out = new Set();
  const take = (re, mustBeApi) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const raw = m[2];
      if (mustBeApi && !/^(?:\$\{[^}]*\})?\/api\//.test(raw)) continue;
      const segs = clientSegments(raw);
      if (segs) out.add('/' + segs.join('/'));
    }
  };
  take(KNOWN_CALL, false);
  take(API_CALL, true);
  return [...out];
}

/* ------------------------------------------------------------- routes */

const param = (seg) => {
  let m;
  if ((m = seg.match(/^\[\[\.\.\.(.+)\]\]$/))) return '*?';   // [[...slug]]  optional catch-all
  if ((m = seg.match(/^\[\.\.\.(.+)\]$/))) return '*';         // [...slug]    catch-all
  if (/^\[.+\]$/.test(seg) || /^:/.test(seg)) return ':';       // [id], :id
  if (seg === '*') return '*';
  return seg;
};
// Folders that organise files without appearing in the URL.
const routable = (seg) => !/^\(.*\)$/.test(seg) && !seg.startsWith('@') && !seg.startsWith('_');

/** Routes a file answers, from where it lives (file-based routers). */
function fileRoutes(p) {
  let m;
  if ((m = p.match(/(?:^|\/)app\/((?:[^/]+\/)*)route\.[cm]?[jt]sx?$/))) {
    return [{ root: p.slice(0, m.index + (m[0].startsWith('/') ? 1 : 0)), segs: m[1].split('/').filter(Boolean).filter(routable).map(param) }];
  }
  if ((m = p.match(/(?:^|\/)pages\/(api(?:\/[^.]+)?)\.[cm]?[jt]sx?$/))) {
    const segs = m[1].split('/').filter(Boolean);
    if (segs[segs.length - 1] === 'index') segs.pop();
    return [{ root: p.slice(0, m.index + (m[0].startsWith('/') ? 1 : 0)), segs: segs.map(param) }];
  }
  if ((m = p.match(/(?:^|\/)src\/routes\/((?:[^/]+\/)*)\+server\.[jt]s$/))) {
    return [{ root: p.slice(0, m.index + (m[0].startsWith('/') ? 1 : 0)), segs: m[1].split('/').filter(Boolean).filter(routable).map(param) }];
  }
  if ((m = p.match(/(?:^|\/)server\/(api|routes)\/(.+?)(?:\.(?:get|post|put|patch|delete))?\.[jt]s$/))) {
    const segs = m[2].split('/').filter(Boolean);
    if (segs[segs.length - 1] === 'index') segs.pop();
    return [{ root: p.slice(0, m.index + (m[0].startsWith('/') ? 1 : 0)), segs: (m[1] === 'api' ? ['api', ...segs] : segs).map(param) }];
  }
  return [];
}

/** Routes a file declares in code (Express, Hono, Fastify, ...), and prefixes it mounts. */
function codeRoutes(text) {
  const routes = [], mounts = [];
  let m;
  SERVER_ROUTE.lastIndex = 0;
  while ((m = SERVER_ROUTE.exec(text))) routes.push(m[2].split('/').filter(Boolean).map(param));
  MOUNT.lastIndex = 0;
  while ((m = MOUNT.exec(text))) mounts.push(m[2].split('/').filter(Boolean));
  return { routes, mounts };
}

/* ----------------------------------------------------------- matching */

/** How well a route pattern matches a call; -1 when it doesn't. Literal matches score higher. */
function score(route, call) {
  let s = 0;
  for (let i = 0; i < route.length; i++) {
    const r = route[i];
    if (r === '*' || r === '*?') return (r === '*' && i >= call.length) ? -1 : s;
    if (i >= call.length) return -1;
    const c = call[i];
    if (r === ':') { s += 1; continue; }
    if (c === ':param' || r !== c) return -1; // a dynamic call segment only matches a dynamic route segment
    s += 3;
  }
  return route.length === call.length ? s : -1;
}

/**
 * Edges from the module that makes a request to the module that answers it.
 * @returns {{ edges: [string, string, 'request'][], calls: number, matched: number }}
 */
function buildRequestEdges(files, owner) {
  const routes = [];
  const mounts = [];
  for (const f of files) {
    for (const r of f.fileRoutes || []) routes.push({ file: f.path, root: r.root, segs: r.segs });
    for (const segs of f.codeRoutes || []) routes.push({ file: f.path, root: '', segs, code: true });
    for (const m of f.mounts || []) mounts.push(m);
  }
  if (!routes.length) return { edges: [], calls: 0, matched: 0 };
  // Express-style routers are often mounted under a prefix: app.use('/api', router).
  for (const r of routes.filter((x) => x.code)) {
    for (const pre of mounts) routes.push({ ...r, segs: [...pre, ...r.segs], mounted: true });
  }

  const counts = new Map();
  let calls = 0, matched = 0;
  for (const f of files) {
    const from = owner.get(f.path);
    for (const url of f.requests || []) {
      calls++;
      const call = url.split('/').filter(Boolean);
      let best = null;
      for (const r of routes) {
        const s = score(r.segs, call);
        if (s < 0) continue;
        // Prefer a route in the same app (monorepos have several).
        const local = r.root && f.path.startsWith(r.root) ? 1 : 0;
        if (!best || s + local > best.s) best = { r, s: s + local };
      }
      if (!best) continue;
      matched++;
      const to = owner.get(best.r.file);
      if (!from || !to || from === to) continue;
      const k = from + '>' + to;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const edges = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k]) => [...k.split('>'), 'request']);
  return { edges, calls, matched };
}

module.exports = { extractRequests, fileRoutes, codeRoutes, buildRequestEdges, clientSegments, score };
