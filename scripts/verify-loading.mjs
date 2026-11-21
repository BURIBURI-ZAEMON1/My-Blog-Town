// Run against the dev server or a production preview.
// TOWN_BLOG_TEST_URL=http://127.0.0.1:4325 npm run verify:loading
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { chromium } from 'playwright';

async function load(path) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { ENTRY_STEP_MS, ENTRY_OPEN_MS, ENTRY_CROSS_START_MS, ENTRY_END_MS, getEntryDoorPose, getEntryCamera } = await load('src/lib/entry-motion.ts');
assert(ENTRY_STEP_MS < ENTRY_OPEN_MS, 'successive doors must open concurrently');
assert(getEntryDoorPose(ENTRY_STEP_MS).angle > -104, 'previous door finished before the next began');
for (const cover of [4.5, 10.5, 15]) {
  let previousScale = getEntryDoorPose(0).scale;
  for (let age = 0; age <= ENTRY_END_MS; age++) {
    const scale = getEntryDoorPose(age).scale * getEntryCamera(age, cover);
    assert(scale >= previousScale, 'entry door moved backwards');
    assert(scale - previousScale < .05, 'entry door scale jumped');
    previousScale = scale;
  }
  assert(Math.abs(getEntryDoorPose(ENTRY_END_MS).scale * getEntryCamera(ENTRY_END_MS, cover) - cover) < 1e-8, 'final aperture did not fill the viewport');
  assert.equal(getEntryCamera(ENTRY_CROSS_START_MS, cover), 1, 'camera jumped when the final door took over');
}

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, colorScheme: viewport.width < 720 ? 'dark' : 'light' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // Hold the renderer to exercise arbitrary readiness times without GPU timing noise.
    await page.route(/(?:\/runtime\.[^/]+\.js|\/src\/scene\/brick-town\/runtime\.ts)(?:\?|$)/, () => {});
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.site-entry[data-phase="waiting"]');
    assert.equal(await page.title(), '黑蚊子的门');
    assert(await page.locator('.app-shell').evaluate(el => el.inert), 'background controls remained focusable');
    await page.waitForTimeout(1450);
    assert((await page.locator('.site-entry-door').count()) <= 7, 'loop accumulated door nodes');
    await page.evaluate(() => {
      window.entryDoors = new Map([...document.querySelectorAll('.site-entry-door')].map(el => [el.dataset.door, { element: el, scale: new DOMMatrix(getComputedStyle(el).transform).a }]));
      document.documentElement.dataset.siteReady = 'true';
    });
    await page.waitForSelector('.site-entry[data-phase="settling"]');
    assert(await page.evaluate(() => [...document.querySelectorAll('.site-entry-door')].every(el => {
      const old = window.entryDoors.get(el.dataset.door);
      return !old || old.element === el && new DOMMatrix(getComputedStyle(el).transform).a >= old.scale;
    })), 'readiness replaced or reset a moving door');
    await page.waitForSelector('.site-entry[data-phase="crossing"]');
    const final = await page.locator('.site-entry').getAttribute('data-final-door');
    await page.waitForSelector(`.site-entry-door[data-door="${final}"]`);
    const door = await page.locator(`.site-entry-door[data-door="${final}"]`).elementHandle();
    await page.waitForTimeout(250);
    assert(await door.evaluate(el => el.isConnected), 'final door was replaced during the crossing');
    assert.match(await page.locator('.site-entry-veil path').getAttribute('d'), /Z M/, 'page was not revealed through the door aperture');
    await page.locator('.site-entry').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.app-shell').evaluate(el => el.inert), false);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('town:entered')), 'true');
    // The same session skips splash, leaving the independent canvas loader.
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.site-entry').isVisible(), false);
    await page.waitForSelector('.brick-town-loader[data-phase="steady"]');
    await context.close();
  }
  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await reduced.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/posts/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.site-entry').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.app-shell').evaluate(el => el.inert), false);
  assert(await page.getByText('全部文章', { exact: true }).first().isVisible());
  await reduced.close();
  const quick = await browser.newContext();
  const quickPage = await quick.newPage();
  quickPage.on('pageerror', error => errors.push(error.message));
  await quickPage.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  await quickPage.route(/(?:\/runtime\.[^/]+\.js|\/src\/scene\/brick-town\/runtime\.ts)(?:\?|$)/, route => route.fulfill({
    contentType: 'text/javascript',
    body: 'export function mountBrickTown(canvas, layout, posts, initial, callbacks, ready) { const timer = setTimeout(ready, 40); return { update() {}, dispose() { clearTimeout(timer); } }; } export const t = { mountBrickTown };',
  }));
  await quickPage.addInitScript(() => {
    window.visibleLoader = false;
    new MutationObserver(() => {
      const loader = document.querySelector('.brick-town-loader');
      if (loader && loader.dataset.ready !== 'true' && loader.dataset.phase !== 'quiet') window.visibleLoader = true;
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await quickPage.goto(base, { waitUntil: 'domcontentloaded' });
  await quickPage.waitForFunction(() => document.querySelector('.brick-town-host')?.dataset.ready === 'true');
  await quickPage.locator('.brick-town-loader').waitFor({ state: 'detached' });
  assert.equal(await quickPage.evaluate(() => window.visibleLoader), false, 'brief canvas load flashed an indicator');
  await quick.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const article = await noScript.newPage();
  await article.goto(`${base}/posts/`);
  assert.equal(await article.locator('.site-entry').isVisible(), false, 'splash blocked server-rendered content without JS');
  assert.equal(await article.locator('.app-shell').evaluate(el => el.inert), false);
  await noScript.close();
  assert.deepEqual(errors, []);
  console.log('PASS: overlapping doors, continuous handoff, viewport coverage, bounded loops, desktop/mobile, session skip, reduced motion, and no-JS reading.');
} finally { await browser.close(); }
