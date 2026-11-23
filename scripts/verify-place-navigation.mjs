// Browser plugin unavailable; exercise the built app with the installed Playwright.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { NullEngine, Scene, ArcRotateCamera, Camera, Vector3, Matrix } from '@babylonjs/core';

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4325';
const browser = await chromium.launch({ headless: true });
const errors = [];
const projectionEngine = new NullEngine();
function project(point, box, data) {
  const scene = new Scene(projectionEngine);
  const camera = new ArcRotateCamera('projection', Math.PI * .68, .96, 36, new Vector3(+data.cameraX, +data.cameraY, +data.cameraZ), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const aspect = box.width / box.height;
  const span = (box.width < 720 ? 34 : Math.max(37, 54 / aspect)) / +data.zoom;
  camera.orthoTop = span / 2; camera.orthoBottom = -span / 2;
  camera.orthoLeft = -span * aspect / 2; camera.orthoRight = span * aspect / 2;
  scene.updateTransformMatrix();
  const p = Vector3.Project(new Vector3(point.x, point.y, point.z), Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(box.width, box.height));
  scene.dispose();
  return { x: box.x + p.x, y: box.y + p.y };
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.effectsReady === 'true', null, { timeout: 60000 });
  await page.locator('.site-entry').waitFor({ state: 'hidden', timeout: 60000 });
}
async function observe(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    window.placeFlight = { canvas, samples: [] };
    new MutationObserver(() => { if (canvas.dataset.focusPost) window.placeFlight.samples.push({ ...canvas.dataset }); }).observe(canvas, { attributes: true });
  });
}
async function flightResult(page) {
  return page.evaluate(() => ({ samples: window.placeFlight.samples, final: { ...window.placeFlight.canvas.dataset } }));
}
function assertArrival(result, id) {
  assert.equal(result.final.focusPost, id);
  assert.equal(result.final.focusProgress, '1', 'navigation preceded camera arrival');
  assert.equal(result.final.focusDurationMs, '760');
  assert(result.samples.some(sample => +sample.focusProgress < 1), 'camera flight was not started');
  const start = result.samples[0], end = result.final;
  assert(Math.hypot(+start.cameraX - +end.cameraX, +start.cameraZ - +end.cameraZ) > .1 || Math.abs(+start.zoom - +end.zoom) > .01, 'camera did not move');
}
async function clickModel(page, point, name) {
  const canvas = page.locator('canvas');
  const p = project(point, await canvas.boundingBox(), await canvas.evaluate(el => ({ ...el.dataset })));
  for (const y of [0, -12, 12, -24, 24]) for (const x of [0, -10, 10]) {
    await page.mouse.move(p.x + x, p.y + y);
    await page.waitForTimeout(90);
    if (await page.locator('.town-place-tooltip strong').filter({ hasText: name }).count()) {
      await page.mouse.click(p.x + x, p.y + y); return;
    }
  }
  throw new Error(`Could not pick visible model: ${name}`);
}
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await context.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.addInitScript(() => {
    window.placeRoutes = [];
    const pushState = history.pushState;
    history.pushState = function (...args) {
      window.placeRoutes.push(new URL(args[2], location.href).pathname);
      return pushState.apply(this, args);
    };
  });
  await page.goto(`${base}/posts/`);
  const articlePath = await page.locator('.archive-row').first().getAttribute('href');
  for (const path of ['/posts/', articlePath, '/about/']) {
    for (const entry of ['friend', 'navigation', 'avatar']) {
      await page.goto(`${base}${path}`);
      await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
      if (entry === 'friend') {
        await page.locator('.desktop-sidebar-nav button').filter({ hasText: '友邻' }).click();
        const link = page.locator('.friend-row').first();
        const destination = await link.getAttribute('href');
        await context.route(`${destination}/**`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct friend destination</h1>' }));
        const popupPromise = page.waitForEvent('popup');
        void popupPromise.catch(() => {});
        await link.click();
        assert.deepEqual(await page.evaluate(() => window.placeRoutes), [], `${path}: friend detoured through town`);
        const popup = await popupPromise;
        await popup.getByRole('heading', { name: 'Direct friend destination' }).waitFor();
        assert.equal(new URL(page.url()).pathname, path, 'friend replaced the current page');
        await popup.close();
      } else {
        await page.locator(entry === 'navigation' ? '.desktop-top-links a[href="/about/"]' : '.profile-avatar-link').click();
        assert(!(await page.evaluate(() => window.placeRoutes)).includes('/'), `${path}: ${entry} detoured through town`);
        await page.waitForURL('**/about/');
      }
      assert.equal(await page.locator('canvas').count(), 0, `${path}: non-town entry mounted a scene`);
    }
  }
  console.log('PASS: archive, article and About entries navigate directly without visiting town; friends preserve the source tab');
  await page.goto(base); await ready(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/town-fixed-ring.png' });
  const layout = await page.locator('astro-island').first().evaluate(el => {
    const unpack = ([type, value]) => type === 1 ? value.map(unpack) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unpack(entry)])) : value;
    return unpack(JSON.parse(el.getAttribute('props')).layout);
  });
  const profile = page.locator('.profile-panel');
  const nickname = await profile.locator('h2').innerText();
  for (const target of [profile.locator('h2'), profile.locator('.profile-headline'), profile.locator('.panel-eyebrow')]) {
    await target.hover();
    assert.equal(await page.locator('.town-place-tooltip').count(), 0, 'profile text highlighted the windmill');
  }
  const avatar = profile.locator('.profile-avatar-link');
  const avatarBox = await avatar.boundingBox(), imageBox = await avatar.locator('img').boundingBox();
  assert.equal(avatarBox.width, imageBox.width); assert.equal(avatarBox.height, imageBox.height);
  await avatar.hover();
  await page.locator('.town-place-tooltip strong').filter({ hasText: '关于' }).waitFor();
  await profile.locator('h2').hover();
  assert.equal(await page.locator('.town-place-tooltip').count(), 0, 'avatar hover did not clear outside its frame');
  await observe(page); await avatar.click();
  await page.waitForURL('**/about/'); assertArrival(await flightResult(page), 'about');
  assert.equal(await page.locator('.about-portrait > span').innerText(), nickname);
  console.log('PASS: avatar-only hover, matching image hit area, camera flight on click, and nickname badge');
  await page.locator('.desktop-top-links a[href="/posts/"]').click();
  await avatar.focus(); await page.keyboard.press('Enter');
  await page.waitForURL('**/about/');
  console.log('PASS: keyboard avatar navigation from archive');
  await page.locator('.desktop-top-links a[href="/"]').click(); await ready(page);
  await observe(page);
  await page.locator('.desktop-top-links a[href="/about/"]').click();
  assert((await flightResult(page)).samples.some(sample => +sample.focusProgress < 1), 'About link skipped the camera');
  await page.waitForURL('**/about/'); assertArrival(await flightResult(page), 'about');
  assert.match(await page.title(), /关于/);
  assert.equal(await page.locator('.about-card').count(), 4);
  assert.equal(await page.locator('.about-page aside, .about-page .article-comments').count(), 0);
  await page.screenshot({ path: '/tmp/about-fixed-desktop.png' });
  console.log('PASS: desktop About entry flies to windmill before navigation; reference layout has no contents/comments');

  // About from archive must skip the town entirely.
  await page.locator('.desktop-top-links a[href="/posts/"]').click();
  await page.locator('.desktop-top-links a[href="/about/"]').click();
  await page.waitForURL('**/about/');
  assert.equal(await page.locator('canvas').count(), 0);
  console.log('PASS: About entry outside town skips scene initialization');

  await page.locator('.desktop-top-links a[href="/"]').click(); await ready(page); await observe(page);
  await clickModel(page, { x: 0, y: 2.5, z: 0 }, '关于');
  await page.waitForURL('**/about/'); assertArrival(await flightResult(page), 'about');
  console.log('PASS: real windmill mesh uses the same flight');

  await page.locator('.desktop-top-links a[href="/"]').click(); await ready(page);
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '友邻' }).click();
  const friend = page.locator('.friend-row').nth(3);
  const friendUrl = await friend.getAttribute('href');
  const friendName = await friend.locator('strong').innerText();
  const friendId = `friend:${layout.hamlet.huts[3].id}`;
  let externalFlight;
  await context.route(`${friendUrl}/**`, async route => {
    externalFlight = await flightResult(page);
    await route.fulfill({ contentType: 'text/html', body: '<h1>Friend destination reached</h1>' });
  });
  await observe(page);
  let popupPromise = page.waitForEvent('popup');
  await friend.click();
  let popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Friend destination reached' }).waitFor();
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  assert.equal(new URL(popup.url()).origin, new URL(friendUrl).origin);
  assertArrival(externalFlight, friendId);
  await popup.waitForTimeout(300);
  assert(!popup.isClosed(), 'friend destination immediately closed');
  await popup.close();
  console.log('PASS: friend sidebar waits for camera arrival, opens the configured URL in a new tab, and keeps it open');

  await page.goto(base); await ready(page);
  await page.locator('canvas').hover(); await page.mouse.wheel(0, 760);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/town-fixed-ring.png' });
  await observe(page);
  const hut = layout.hamlet.huts[3];
  popupPromise = page.waitForEvent('popup');
  await clickModel(page, { x: hut.x, y: .7, z: hut.z }, friendName);
  popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Friend destination reached' }).waitFor();
  assertArrival(externalFlight, friendId);
  await popup.close();
  console.log('PASS: real friend hut mesh flies before opening the same URL in a new tab');

  await page.goto(base); await ready(page);
  await page.locator('.desktop-sidebar-nav button').filter({ hasText: '友邻' }).click();
  // Dispatch in the same turn so even a slow software-rendered frame cannot arrive first.
  await page.evaluate(() => {
    document.querySelectorAll('.friend-row')[3].click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  await page.waitForTimeout(900);
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  assert.equal(context.pages().length, 1);
  console.log('PASS: Escape cancels friend navigation without opening a tab');
  await observe(page);
  await page.evaluate(() => {
    window.savedOpen = window.open;
    window.open = () => null;
    document.querySelectorAll('.friend-row')[3].click();
  });
  const fallback = page.locator('.friend-visit-fallback a');
  await fallback.waitFor();
  assert.equal(await fallback.getAttribute('href'), friendUrl);
  assert.equal(await fallback.getAttribute('target'), '_blank');
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  await page.evaluate(() => { window.open = window.savedOpen; });
  popupPromise = page.waitForEvent('popup');
  await fallback.click(); popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Friend destination reached' }).waitFor();
  await popup.close();
  console.log('PASS: blocked popups provide a working original link and never replace the current town');
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  const phone = await mobile.newPage(); phone.on('pageerror', error => errors.push(error.message));
  phone.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await phone.goto(`${base}/posts/`);
  await phone.getByRole('button', { name: '打开侧边栏', exact: true }).click();
  assert.equal(await phone.locator('.mobile-sidebar-nav .primary-nav a').count(), 3);
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: '/tmp/town-fixed-mobile-menu.png' });
  const mobileNav = phone.locator('.mobile-sidebar-nav .primary-nav');
  assert.deepEqual(await mobileNav.locator('a span').allTextContents(), ['小镇', '档案', '关于']);
  assert.equal(await mobileNav.locator('.nav-count').count(), 0);
  await phone.locator('.profile-avatar-link').click();
  await phone.waitForURL('**/about/');
  assert.equal(await phone.locator('canvas').count(), 0, 'mobile About needlessly loaded a camera flight');
  assert(!(await phone.locator('.desktop-top-links').isVisible()));
  assert((await phone.locator('.topnav').boundingBox()).height < 80, 'extra mobile navigation row remains');
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: '/tmp/about-fixed-mobile.png' });
  console.log('PASS: mobile avatar opens About directly; sidebar has 小镇/档案/关于 without counts and no extra header row or overflow');

  await mobile.route(`${friendUrl}/**`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Mobile friend reached</h1>' }));
  await phone.getByRole('button', { name: '打开侧边栏', exact: true }).click();
  await phone.locator('.mobile-sidebar-nav button').filter({ hasText: '友邻' }).click();
  popupPromise = phone.waitForEvent('popup');
  await phone.locator('.friend-row').nth(3).click();
  popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Mobile friend reached' }).waitFor();
  assert.equal(new URL(phone.url()).pathname, '/about/', 'mobile friend replaced the current tab');
  assert.equal(await phone.locator('canvas').count(), 0, 'mobile friend needlessly loaded a camera flight');
  console.log('PASS: mobile friend opens a new tab directly and preserves the current About page');
  await mobile.close();
  assert.deepEqual(errors, []);
} finally { projectionEngine.dispose(); await browser.close(); }
