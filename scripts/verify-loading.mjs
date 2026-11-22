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
    // A completed session must still cover a slow home-page refresh.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.site-entry[data-phase="waiting"]');
    assert(await page.locator('.app-shell').evaluate(el => el.inert), 'home reload skipped splash after a previous entry');
    await page.evaluate(() => { document.documentElement.dataset.siteReady = 'true'; });
    await page.locator('.site-entry').waitFor({ state: 'detached' });
    // Bypassing the resource cache (as after a deployment) uses the same policy.
    const client = await context.newCDPSession(page);
    await Promise.all([page.waitForEvent('domcontentloaded'), client.send('Page.reload', { ignoreCache: true })]);
    await page.waitForSelector('.site-entry[data-phase="waiting"]');
    await page.screenshot({ path: `/tmp/town-splash-reload-${viewport.width}.png` });
    await page.waitForSelector('.brick-town-loader[data-phase="steady"]');
    const dots = page.locator('.brick-loader-mark i');
    assert.equal(await dots.count(), 3, 'local loader should contain three dots');
    const styles = await dots.evaluateAll(elements => elements.map(el => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, delay: style.animationDelay, color: style.backgroundColor, radius: style.borderRadius };
    }));
    assert(styles.every(style => style.animation === 'town-loader-float' && style.color === 'rgb(179, 179, 179)' && style.radius === '50%'));
    assert.equal(new Set(styles.map(style => style.delay)).size, 3, 'dots should float in sequence');
    await page.goto(`${base}/posts/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.site-entry').isVisible(), false, 'archive re-entry replayed splash');
    const articlePath = await page.locator('.archive-row').first().getAttribute('href');
    assert(articlePath, 'article reload check needs a published article');
    await page.goto(new URL(articlePath, base).href, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.site-entry').isVisible(), false, 'article re-entry replayed splash');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.site-entry').isVisible(), false, 'article refresh replayed splash');
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    await page.evaluate(() => { window.spaEntryProbe = true; });
    if (viewport.width < 720) {
      await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
      await page.locator('.mobile-sidebar-nav a[href="/"]').click();
    } else {
      await page.locator('.desktop-top-links a[href="/"]').click();
    }
    await page.waitForURL(new URL('/', base).href);
    assert(await page.evaluate(() => window.spaEntryProbe), 'town navigation unexpectedly reloaded the document');
    assert.equal(await page.locator('.site-entry').isVisible(), false, 'in-app return to town replayed splash');
    await context.close();
  }
  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await reduced.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/posts/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.site-entry').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.app-shell').evaluate(el => el.inert), false);
  await page.locator('.archive-shell-heading h1').waitFor({ state: 'visible' });
  await reduced.close();
  const quick = await browser.newContext();
  const quickPage = await quick.newPage();
  quickPage.on('pageerror', error => errors.push(error.message));
  await quickPage.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  await quickPage.route(/(?:\/runtime\.[^/]+\.js|\/src\/scene\/brick-town\/runtime\.ts)(?:\?|$)/, route => route.fulfill({
    contentType: 'text/javascript',
    body: 'export function mountBrickTown(canvas, layout, posts, initial, callbacks, ready) { const timer = setTimeout(ready, 40); return { update() {}, focusPost() { return false; }, cancelFocus() {}, dispose() { clearTimeout(timer); } }; } export const t = { mountBrickTown };',
  }));
  await quickPage.addInitScript(() => {
    window.visibleLoader = false;
    new MutationObserver(() => {
      const loader = document.querySelector('.brick-town-loader');
      if (loader && loader.dataset.phase !== 'quiet') window.visibleLoader = true;
      const host = document.querySelector('.brick-town-host');
      if (host?.dataset.ready === 'true' && window.firstFrameReveal === undefined) {
        const style = getComputedStyle(host.querySelector('canvas'));
        window.firstFrameReveal = { opacity: style.opacity, transition: style.transitionDuration, loader: !!loader };
      }
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await quickPage.goto(base, { waitUntil: 'domcontentloaded' });
  await quickPage.waitForFunction(() => document.querySelector('.brick-town-host')?.dataset.ready === 'true');
  assert.deepEqual(await quickPage.evaluate(() => window.firstFrameReveal), { opacity: '1', transition: '0s', loader: false }, 'first frame waited for a canvas or loader transition');
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
  console.log('PASS: overlapping doors, continuous handoff, desktop/mobile home reload and cache bypass, direct article refresh and in-app navigation, reduced motion, and no-JS reading.');
} finally { await browser.close(); }
