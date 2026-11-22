import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NullEngine, Scene } from '@babylonjs/core';
const require = createRequire(import.meta.url), cache = new Map();
function load(path) {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} }; cache.set(absolute, module);
  const output = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = id => id.startsWith('.') ? load(resolve(dirname(absolute), `${id.replace(/\.ts$/, '')}.ts`)) : require(id);
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}
const { createTownLayout } = load('src/data/town-layout.ts');
const { inTownOutline } = load('src/data/town-outline.ts');
const { samplePath } = load('src/data/town-spatial.ts');
const rectDistance = (rect, point) => Math.hypot(Math.max(0, Math.abs(rect.x-point.x)-rect.width/2), Math.max(0, Math.abs(rect.z-point.z)-rect.depth/2));
const assertHamletClear = layout => {
  const hamlet = layout.hamlet;
  for (const plot of layout.reservedPlots) {
    assert(rectDistance(plot, hamlet.center) >= hamlet.radius + 1.6, 'article footprint enters the hamlet reservation');
    for (const point of samplePath(hamlet.path, 24)) assert(rectDistance(plot, point) >= .95, 'article footprint enters the rendered hamlet access road');
  }
};
const { friendLinks, siteConfig } = load('src/config/site.ts');
const { buildFeature, buildFriendHut } = load('src/scene/brick-town/features.ts');
const { createSiteStats } = load('src/lib/site-stats.ts');
const posts = Array.from({ length: 120 }, (_, index) => ({ id: `p${index}`, date: '2026-01-01' }));
for (const seed of [siteConfig.townSeed, 'town-blog-framework-v1']) {
  const original = createTownLayout(seed, posts);
  const layout = createTownLayout(seed, posts, friendLinks);
  assert.equal(layout.plots.length, original.plots.length, 'hamlet lost articles');
  assert(Math.hypot(layout.hamlet.center.x, layout.hamlet.center.z) > 22 && Math.hypot(layout.hamlet.center.x, layout.hamlet.center.z) < 30, 'hamlet must sit beyond the article core');
  assertHamletClear(layout);
  assert.equal(layout.hamlet.huts.length, friendLinks.length);
  assert.equal(createTownLayout(seed, posts, []).hamlet, undefined);
  for (const hut of layout.hamlet.huts) {
    assert(Math.abs(Math.hypot(hut.x - layout.hamlet.center.x, hut.z - layout.hamlet.center.z) - layout.hamlet.radius) < .001, 'huts do not form a ring');
    for (const corner of [-1, 1].flatMap(x => [-1, 1].map(z => ({ x: hut.x + x * 1.3, z: hut.z + z * 1.3 })))) assert(inTownOutline(corner), 'hut leaves the terrain');
    for (const plot of layout.plots) assert(Math.abs(hut.x - plot.x) >= (plot.width + 2.6) / 2 || Math.abs(hut.z - plot.z) >= (plot.depth + 2.6) / 2, 'hut overlaps an article');
    for (const other of layout.hamlet.huts) if (hut !== other) assert(Math.hypot(hut.x - other.x, hut.z - other.z) >= 2.6, 'huts overlap');
  }
  const moreFriends = [...friendLinks, ...Array.from({ length: 18 }, (_, i) => ({ id: `extra-friend-${i}` }))];
  const expanded = createTownLayout(seed, posts, moreFriends);
  assertHamletClear(expanded);
  assert.equal(expanded.hamlet.huts.length, moreFriends.length, 'one hut must be generated for each real friend');
  assert.deepEqual(expanded.hamlet.huts.slice(0, friendLinks.length), layout.hamlet.huts, 'adding friends moved their existing homes');
  for (const hut of expanded.hamlet.huts) {
    for (const other of expanded.hamlet.huts) if (hut !== other) assert(Math.hypot(hut.x-other.x, hut.z-other.z) >= 2.6, 'expanded huts overlap');
    for (const plot of expanded.reservedPlots) assert(Math.abs(hut.x-plot.x) >= (plot.width+2.6)/2 || Math.abs(hut.z-plot.z) >= (plot.depth+2.6)/2, 'expanded hut overlaps an article lot');
  }
  let capacity;
  try { createTownLayout(seed, [], Array.from({ length: 200 }, (_, i) => ({ id: `capacity-${i}` }))); } catch (error) { capacity = Number(error.message.match(/(\d+) terrain-safe lots/)?.[1]); }
  assert(Number.isFinite(capacity) && capacity > moreFriends.length);
  for (const count of [1, 17, 18, capacity]) {
    const stress = createTownLayout(seed, posts, Array.from({ length: count }, (_, i) => ({ id: `stress-${i}` })));
    assertHamletClear(stress);
    assert.equal(stress.plots.length, posts.length);
  }
  console.log(`Hamlet capacity: ${capacity}; full footprints and rendered access road clear at 1, 9, 17, 18, 27 and ${capacity} friends`);
  const grown = createTownLayout(seed, [...posts, { id: 'newest', date: '2026-11-22' }], friendLinks);
  for (const plot of layout.plots) assert.deepEqual(grown.plots.find(next => next.postId === plot.postId), plot, 'growth moved an article');
}
const engine = new NullEngine(), scene = new Scene(engine);
const layout = createTownLayout(siteConfig.townSeed, [], friendLinks);
for (const model of [buildFeature(scene, layout.features[0]), buildFriendHut(scene, layout.hamlet.huts[0])]) {
  assert(model.meshes.length > 0);
  assert(model.meshes.every(mesh => mesh.isPickable && !mesh.metadata.postId), 'landmarks masquerade as articles');
  assert(model.meshes.every(mesh => mesh.getVerticesData('edgeAnchor').every(value => value === 0)), 'parented landmark edge anchor is not local');
  model.root.dispose();
}
scene.dispose(); engine.dispose();
assert.equal(createSiteStats([], new Date('2026-11-22')).days, undefined);
assert.equal(createSiteStats([{ date: '2026-11-20', category: 'a', tags: ['x'], wordCount: 120 }], new Date('2026-11-22')).days, 3);

const handler = load('api/views.ts').default;
const savedFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let commands = [];
globalThis.fetch = async (_url, options) => {
  const command = JSON.parse(options.body); commands.push(command);
  return { ok: true, json: async () => ({ result: command[0] === 'EVAL' ? [12, 3, 2] : command[0] === 'GET' ? 12 : 3 }) };
};
async function request(overrides = {}) {
  let status, body;
  commands = [];
  const response = { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; } };
  await handler({ method: 'POST', headers: { host: new URL(siteConfig.siteUrl).host, 'x-forwarded-for': '192.0.2.1', 'user-agent': 'test' }, query: {}, body: { path: '/posts/example/' }, ...overrides }, response);
  return { status, body };
}
try {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  delete process.env.VERCEL_ENV;
  assert.equal((await request()).body.views, 2);
  assert.equal(commands[0][0], 'EVAL');
  assert(!JSON.stringify(commands).includes('192.0.2.1'), 'raw IP persisted');
  for (const path of ['https://evil.test', '//evil', '/posts/example/?q=1', '/unexpected/', null]) assert.equal((await request({ body: { path } })).status, 400);
  for (const headers of [{ host: 'preview.vercel.app' }, { host: new URL(siteConfig.siteUrl).host, origin: 'https://preview.vercel.app' }]) {
    assert.equal((await request({ headers })).body.enabled, false);
    assert.equal(commands.length, 0, 'preview wrote to storage');
  }
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await request()).body.enabled, false);
  delete process.env.VERCEL_ENV;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'Redis command failed' }) });
  assert.equal((await request()).status, 503);
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
  assert.equal((await request()).body.enabled, false);
} finally {
  globalThis.fetch = savedFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
}
console.log('PASS: circular hamlet outside the article core with spare lots, reserved courtyard, stable article growth, real friend footprints/models, accurate stats, counter path/host boundaries and graceful outages');
