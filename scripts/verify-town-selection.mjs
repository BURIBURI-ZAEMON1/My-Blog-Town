// Browser plugin unavailable; use the installed Playwright against a running app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { chromium } from 'playwright';
import { NullEngine, Scene, ArcRotateCamera, Camera, Vector3, Matrix } from '@babylonjs/core';

const source = ts.transpileModule(readFileSync('src/scene/brick-town/interaction.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { targetVisualState, stepGlass } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const post = id => ({ kind: 'post', id });
const place = id => ({ kind: 'place', id });
assert.equal(targetVisualState(post('first')).glass, false);
assert.equal(targetVisualState(post('first'), post('first')).glass, false);
assert.equal(targetVisualState(post('second'), post('first')).glass, true, 'other articles in the same building must be glass');
assert.equal(targetVisualState(post('first'), undefined, new Set(['second'])).glass, true, 'a series sibling must not inherit a filter match');
assert.equal(targetVisualState(post('second'), undefined, new Set(['second'])).glass, false);
assert.equal(targetVisualState(post('first'), place('about')).glass, true);
assert.equal(targetVisualState(place('about'), place('about')).direct, true);
assert.equal(targetVisualState(place('friend:a'), place('friend:a')).glass, false);
assert.equal(targetVisualState(place('about'), undefined, new Set(['first'])).glass, true);
assert.equal(targetVisualState(post('first'), undefined, new Set()).glass, true, 'zero results must glass all targets');
assert.equal(targetVisualState(post('first'), place('about'), new Set(['first'])).glass, false, 'hover must preserve matching floors');
assert.equal(targetVisualState(place('first'), post('first')).glass, true, 'post and place IDs must not collide');
const partial = stepGlass(0, 1, .05, false);
assert(partial > 0 && partial < 1);
assert(stepGlass(partial, 0, .016, false) < partial, 'interrupted transitions must reverse from the current amount');
let settled = 0;
for (let i = 0; i < 8; i++) settled = stepGlass(settled, 1, 1 / 30, false);
assert(settled > .99, 'glass transition did not settle within 270 ms');
assert.equal(stepGlass(partial, 0, 0, true), 0);
console.log('PASS: per-floor selection, series sibling filters, empty filters, ID isolation and reversible motion');

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const projectionEngine = new NullEngine();
const errors = [];
const inspect = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};
function watchGlassRendering() {
  const shaders = new WeakMap(), programs = new WeakMap(), contexts = new WeakMap();
  window.townRenderProbe = { pbrLinks: 0, shadowBatches: [] };
  const state = gl => {
    if (!contexts.has(gl)) contexts.set(gl, { program: null, framebuffer: null, shadows: 0 });
    return contexts.get(gl);
  };
  for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
    for (const name of ['shaderSource', 'attachShader', 'linkProgram', 'useProgram', 'bindFramebuffer', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = Type.prototype[name];
      if (!original) continue;
      Type.prototype[name] = function (...args) {
        const current = state(this);
        if (name === 'shaderSource') shaders.set(args[0], { pbr: args[1].includes('townGlass'), shadow: args[1].includes('biasAndScaleSM') && args[1].includes('vDepthMetricSM') });
        if (name === 'attachShader') {
          const before = programs.get(args[0]) ?? {}, next = shaders.get(args[1]) ?? {};
          programs.set(args[0], { pbr: before.pbr || next.pbr, shadow: before.shadow || next.shadow });
        }
        if (name === 'linkProgram' && programs.get(args[0])?.pbr) window.townRenderProbe.pbrLinks++;
        if (name === 'useProgram') current.program = args[0];
        if (name === 'bindFramebuffer' && args[0] !== this.READ_FRAMEBUFFER && current.framebuffer !== args[1]) {
          if (current.shadows) window.townRenderProbe.shadowBatches.push(current.shadows);
          current.shadows = 0; current.framebuffer = args[1];
        }
        if (name.startsWith('draw') && programs.get(current.program)?.shadow) current.shadows++;
        return original.apply(this, args);
      };
    }
  }
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.effectsReady === 'true', null, { timeout: 60000 });
  await page.locator('.site-entry').waitFor({ state: 'hidden', timeout: 60000 });
}
async function state(page, expected) {
  await page.waitForFunction(values => Object.entries(values).every(([key, value]) => document.querySelector('canvas')?.dataset[key] === String(value)), expected, { timeout: 15000 });
}
async function tapBuilding(page, point, title) {
  const box = await page.locator('canvas').boundingBox();
  const data = await page.locator('canvas').evaluate(el => ({ ...el.dataset }));
  const scene = new Scene(projectionEngine);
  const camera = new ArcRotateCamera('projection', Math.PI * .68, .96, 36, new Vector3(+data.cameraX, +data.cameraY, +data.cameraZ), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const span = 34 / +data.zoom, aspect = box.width / box.height;
  camera.orthoTop = span / 2; camera.orthoBottom = -span / 2;
  camera.orthoLeft = -span * aspect / 2; camera.orthoRight = span * aspect / 2;
  scene.updateTransformMatrix();
  const p = Vector3.Project(new Vector3(point.x, point.y, point.z), Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(box.width, box.height));
  scene.dispose();
  for (const offset of [0, -10, 10, -20, 20]) {
    const close = page.getByRole('button', { name: '关闭建筑预览', exact: true });
    if (await close.count()) await close.tap();
    await page.touchscreen.tap(box.x + p.x + offset, box.y + p.y);
    if (await page.locator('.town-touch-preview').filter({ hasText: title }).count()) return;
  }
  assert.fail(`could not tap ${title}`);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', colorScheme: 'light', timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage(); inspect(page);
  await page.addInitScript(watchGlassRendering);
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00+08:00'));
  let bodyMatchId;
  await page.route('**/data/search-index.json', async route => {
    const response = await route.fetch();
    const entries = await response.json();
    bodyMatchId = entries[0].id;
    entries[0].searchText += ' selection-body-probe';
    await route.fulfill({ response, json: entries });
  });
  await page.goto(base); await ready(page);
  assert.match(await page.title(), /黑蚊子的门/);
  assert(await page.locator('.desktop-sidebar-nav').isVisible());
  const search = page.getByRole('textbox', { name: '搜索文章', exact: true });
  const total = +(await page.locator('canvas').getAttribute('data-solid-buildings'));
  const geometry = await page.locator('canvas').evaluate(el => [el.dataset.sceneMeshes, el.dataset.sceneMaterials]);
  const series = await page.locator('astro-island').first().evaluate(el => {
    const unpack = ([type, value]) => type === 1 ? value.map(unpack) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unpack(entry)])) : value;
    return unpack(JSON.parse(el.getAttribute('props')).layout).plots.find(plot => plot.seriesPostIds?.length > 1).seriesPostIds;
  });
  await page.waitForTimeout(600);
  const renderBefore = await page.evaluate(() => ({ links: window.townRenderProbe.pbrLinks, shadowDraws: window.townRenderProbe.shadowBatches.at(-1) }));
  assert(renderBefore.links > 0 && renderBefore.shadowDraws > 0, 'GPU regression probe did not observe PBR shaders and shadow draws');
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '列表' }).click();
  await page.locator(`.sidebar-post[href="/posts/${series[0]}/"]`).hover();
  await state(page, { solidTargets: `post:${series[0]}`, glassBuildings: total - 1 });
  assert((await page.locator('canvas').getAttribute('data-glass-targets')).split(',').includes(`post:${series[1]}`), 'same-building sibling floor stayed solid');
  assert.equal(await page.evaluate(() => window.townRenderProbe.shadowBatches.at(-1)), renderBefore.shadowDraws, 'glass floors stopped casting their shadows');
  await page.screenshot({ path: '/tmp/town-glass-series-floor.png' });
  await page.locator(`.sidebar-post[href="/posts/${series[1]}/"]`).hover();
  await state(page, { solidTargets: `post:${series[1]}` });
  assert((await page.locator('canvas').getAttribute('data-glass-targets')).split(',').includes(`post:${series[0]}`));
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '名片' }).click();
  await page.locator('.profile-avatar-link').hover();
  await state(page, { focusTarget: 'place:about', solidBuildings: 1, glassBuildings: total - 1 });
  await page.screenshot({ path: '/tmp/town-glass-desktop.png' });
  await page.locator('.top-wordmark').hover();
  await state(page, { focusTarget: '', solidBuildings: total, glassBuildings: 0 });
  const renderAfter = await page.evaluate(() => ({ links: window.townRenderProbe.pbrLinks, shadowDraws: window.townRenderProbe.shadowBatches.at(-1) }));
  assert.equal(renderAfter.links, renderBefore.links, 'selecting or clearing recompiled building shaders');
  assert.equal(renderAfter.shadowDraws, renderBefore.shadowDraws, 'glass buildings dropped out of the shadow pass');
  console.log('PASS: series floors select independently; selection/clear keep PBR programs and shadow draws stable', renderAfter);
  assert.deepEqual(await page.locator('canvas').evaluate(el => [el.dataset.sceneMeshes, el.dataset.sceneMaterials]), geometry, 'selection duplicated scene geometry or materials');
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '友邻' }).click();
  await page.locator('.friend-row').first().hover();
  await state(page, { solidBuildings: 1, glassBuildings: total - 1 });
  assert.match(await page.locator('canvas').getAttribute('data-focus-target'), /^place:friend:/);
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '分类' }).click();
  await page.locator('.sidebar-taxonomy button').first().hover();
  await page.waitForFunction(() => !!document.querySelector('canvas').dataset.matchingPosts && +document.querySelector('canvas').dataset.glassBuildings > 0);
  await page.locator('.sidebar-taxonomy button').first().click();
  await page.locator('.top-wordmark').hover();
  assert(await page.locator('.sidebar-post').count());
  await page.locator('.sidebar-post').first().focus();
  await page.waitForFunction(() => document.querySelector('canvas').dataset.focusTarget.startsWith('post:'));
  const categoryTitle = await page.locator('.sidebar-post strong').first().innerText();
  const categoryId = decodeURIComponent((await page.locator('.sidebar-post').first().getAttribute('href')).split('/')[2]);
  await search.fill(categoryTitle);
  await state(page, { matchingPosts: categoryId, solidBuildings: 1, glassBuildings: total - 1 });
  assert.equal(await page.locator('.search-result').count(), 1, 'search results ignored the active category');
  await search.press('ArrowDown');
  await state(page, { focusTarget: `post:${categoryId}` });
  await search.fill('');
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '标签' }).click();
  await page.locator('.sidebar-tags button').first().focus();
  await page.waitForFunction(() => !!document.querySelector('canvas').dataset.matchingPosts && +document.querySelector('canvas').dataset.glassBuildings > 0);
  await page.locator('.sidebar-tags button').first().click();
  assert(await page.locator('.sidebar-post').count());
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '名片' }).click();
  await search.fill('selection-body-probe');
  await page.locator('.search-result').first().waitFor();
  assert.equal(await page.locator('.search-result').count(), 1);
  await state(page, { matchingPosts: bodyMatchId, solidBuildings: 1, glassBuildings: total - 1 });
  await page.locator('.profile-avatar-link').hover();
  await state(page, { focusTarget: 'place:about', solidBuildings: 2, glassBuildings: total - 2 });
  await page.locator('.top-wordmark').hover();
  await state(page, { focusTarget: '', solidBuildings: 1, glassBuildings: total - 1 });
  await search.fill('selection-no-matches-98327');
  await state(page, { matchingPosts: '', solidBuildings: 0, glassBuildings: total });
  await search.fill(''); await search.blur();
  await state(page, { solidBuildings: total, glassBuildings: 0 });
  await page.getByRole('combobox', { name: '小镇季节', exact: true }).selectOption('winter');
  await page.locator('.profile-avatar-link').hover();
  await state(page, { season: 'winter', solidBuildings: 1, glassBuildings: total - 1 });
  await page.getByRole('button', { name: '切换昼夜模式', exact: true }).click();
  await page.locator('.profile-avatar-link').hover();
  await state(page, { colorMode: 'night', solidBuildings: 1, glassBuildings: total - 1 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/town-glass-night-winter.png' });
  await page.getByRole('combobox', { name: '小镇季节', exact: true }).selectOption('autumn');
  await page.locator('.top-wordmark').hover();
  await state(page, { solidBuildings: total, glassBuildings: 0 });
  console.log('PASS: desktop About/friends, category/tag preview and filters, combined search, keyboard selection, full-text-only match, empty results, filter + hover, night and winter');
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'light' });
  const phone = await mobile.newPage(); inspect(phone);
  await phone.goto(base); await ready(phone);
  const phoneTotal = +(await phone.locator('canvas').getAttribute('data-solid-buildings'));
  await tapBuilding(phone, { x: 0, y: 2.5, z: 0 }, '关于');
  await state(phone, { focusTarget: 'place:about', solidBuildings: 1, glassBuildings: phoneTotal - 1 });
  assert.equal(new URL(phone.url()).pathname, '/', 'first touch navigated instead of previewing');
  assert.equal(await phone.locator('canvas').getAttribute('data-focus-post'), null);
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: '/tmp/town-glass-mobile.png' });
  await phone.getByRole('button', { name: '关闭建筑预览', exact: true }).tap();
  await state(phone, { focusTarget: '', solidBuildings: phoneTotal, glassBuildings: 0 });
  assert.equal(await phone.locator('canvas').getAttribute('data-edge-reveal'), '0.000');
  console.log('PASS: mobile first touch selects without navigating, closing preview restores all buildings, reduced motion and mobile edge policy preserved');
  await mobile.close();
  assert.deepEqual(errors, [], 'browser or shader compilation errors');
} finally {
  projectionEngine.dispose();
  await browser.close();
}
