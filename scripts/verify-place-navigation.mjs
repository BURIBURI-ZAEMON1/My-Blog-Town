// Browser plugin unavailable; exercise the built app with the installed Playwright.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { NullEngine, Scene, ArcRotateCamera, Camera, Vector3, Matrix } from '@babylonjs/core';

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4325';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
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
    const pose = ['cameraX', 'cameraY', 'cameraZ', 'zoom'];
    const departure = pose.map(key => canvas.dataset[key]);
    const flight = window.placeFlight = { canvas, samples: [] };
    new MutationObserver(() => {
      const data = canvas.dataset;
      if (data.focusPost) flight.samples.push({ ...data });
      if (flight.atOpen && !flight.firstReturn && data.frames !== flight.atOpen.frames && pose.every((key, i) => data[key] === departure[i])) {
        flight.firstReturn = { ...data };
      }
    }).observe(canvas, { attributes: true });
  });
}
async function flightResult(page, popup = false) {
  return page.evaluate(atOpen => ({ samples: window.placeFlight.samples, final: atOpen ? window.placeFlight.atOpen : { ...window.placeFlight.canvas.dataset } }), popup);
}
const camera = (page) => page.locator('.brick-town-host canvas').evaluate(({ dataset: d }) => [d.cameraX, d.cameraY, d.cameraZ, d.zoom]);
async function assertFriendReturn(page, expected) {
  await page.bringToFront();
  await page.waitForFunction(pose => {
    const canvas = document.querySelector('.brick-town-host canvas');
    if (canvas !== window.placeFlight.canvas) return false;
    const d = canvas.dataset;
    return [d.cameraX, d.cameraY, d.cameraZ, d.zoom].every((value, index) => value === pose[index]);
  }, expected, { timeout: 5000 });
  const flight = await page.evaluate(() => ({ opened: !!window.placeFlight.atOpen, animating: window.placeFlight.firstReturn?.edgeAnimating }));
  if (flight.opened) assert.equal(flight.animating, 'false', 'first frame back replayed the friend close-up edge animation');
}
function assertArrival(result, id) {
  assert.equal(result.final.focusPost, id);
  assert.equal(result.final.focusProgress, '1', 'navigation preceded camera arrival');
  assert.equal(result.final.focusDurationMs, '760');
  assert(result.samples.some(sample => +sample.focusProgress < 1), 'camera flight was not started');
  const start = result.samples[0], end = result.final;
  assert(Math.hypot(+start.cameraX - +end.cameraX, +start.cameraZ - +end.cameraZ) > .1 || Math.abs(+start.zoom - +end.zoom) > .01, 'camera did not move');
}
async function modelPoint(page, point, name) {
  const canvas = page.locator('canvas');
  const p = project(point, await canvas.boundingBox(), await canvas.evaluate(el => ({ ...el.dataset })));
  for (const y of [0, -12, 12, -24, 24]) for (const x of [0, -10, 10]) {
    await page.mouse.move(p.x + x, p.y + y);
    await page.waitForTimeout(90);
    if (await page.locator('.town-place-tooltip strong').filter({ hasText: name }).count()) {
      const result = { x: p.x + x, y: p.y + y };
      await page.mouse.move(0, 0);
      return result;
    }
  }
  throw new Error(`Could not pick visible model: ${name}`);
}
async function clickModel(page, point, name) {
  const p = await modelPoint(page, point, name);
  await page.mouse.click(p.x, p.y);
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
    const open = window.open;
    window.open = function (...args) {
      if (window.placeFlight) window.placeFlight.atOpen = { ...window.placeFlight.canvas.dataset };
      return open.apply(this, args);
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
  const defaultZoom = (await camera(page))[3];
  await page.locator('.brick-town-host canvas').dispatchEvent('wheel', { deltaY: 200 });
  await page.waitForFunction(zoom => document.querySelector('canvas').dataset.zoom !== zoom, defaultZoom);
  const aboutDeparture = await camera(page);
  await observe(page);
  await page.locator('.desktop-top-links a[href="/about/"]').click();
  await page.waitForURL('**/about/'); assertArrival(await flightResult(page), 'about');
  assert.match(await page.title(), /关于/);
  assert.equal(await page.locator('.about-card').count(), 4);
  assert.equal(await page.locator('.about-page aside, .about-page .article-comments').count(), 0);
  await page.screenshot({ path: '/tmp/about-fixed-desktop.png' });
  assert.equal(await page.locator('canvas').count(), 0, 'About kept the 3D scene mounted');
  await page.goBack(); await ready(page);
  assert.deepEqual(await camera(page), aboutDeparture, 'About returned to the wrong camera pose');
  await page.goForward(); await page.locator('.about-page').waitFor();
  console.log('PASS: About plays the windmill flight, disposes the scene, and restores the departure camera on back');

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
  await context.route(`${friendUrl}/**`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Friend destination reached</h1>' }));
  const friendDeparture = await camera(page);
  await observe(page);
  let popupPromise = page.waitForEvent('popup');
  await friend.click();
  let popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Friend destination reached' }).waitFor();
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  assert.equal(new URL(popup.url()).origin, new URL(friendUrl).origin);
  assertArrival(await flightResult(page, true), friendId);
  await popup.waitForTimeout(300);
  assert(!popup.isClosed(), 'friend destination immediately closed');
  await popup.close();
  await assertFriendReturn(page, friendDeparture);
  console.log('PASS: friend sidebar opens a new tab after arrival, then the existing town canvas resumes the departure pose');

  await page.goto(base); await ready(page);
  await page.locator('canvas').hover(); await page.mouse.wheel(0, 760);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/town-fixed-ring.png' });
  const hutDeparture = await camera(page);
  await observe(page);
  const hut = layout.hamlet.huts[3];
  popupPromise = page.waitForEvent('popup');
  await clickModel(page, { x: hut.x, y: .7, z: hut.z }, friendName);
  popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Friend destination reached' }).waitFor();
  assertArrival(await flightResult(page, true), friendId);
  await popup.close();
  await assertFriendReturn(page, hutDeparture);
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
  const blockedDeparture = await camera(page);
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
  await assertFriendReturn(page, blockedDeparture);
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
  await popup.close();
  await phone.getByRole('button', { name: '打开侧边栏', exact: true }).click();
  await mobileNav.locator('a[href="/"]').click(); await ready(phone);
  const mobileZoom = (await camera(phone))[3];
  await phone.locator('.brick-town-host canvas').dispatchEvent('wheel', { deltaY: -200 });
  await phone.waitForFunction(zoom => document.querySelector('canvas').dataset.zoom !== zoom, mobileZoom);
  const mobileDeparture = await camera(phone);
  await phone.getByRole('button', { name: '打开侧边栏', exact: true }).click();
  await mobileNav.locator('a[href="/about/"]').click();
  await phone.locator('.about-page').waitFor();
  await phone.goBack(); await ready(phone);
  assert.deepEqual(await camera(phone), mobileDeparture, 'mobile About returned to the wrong camera pose');
  const windmill = await modelPoint(phone, { x: 0, y: 1.2, z: 0 }, '关于');
  const tapWindmill = () => phone.touchscreen.tap(windmill.x, windmill.y);
  await tapWindmill();
  await phone.locator('.town-touch-preview strong').filter({ hasText: '关于' }).waitFor();
  assert.equal(new URL(phone.url()).pathname, '/', 'first windmill tap navigated instead of previewing');
  await phone.screenshot({ path: '/tmp/town-touch-windmill.png' });
  await phone.getByRole('button', { name: '关闭建筑预览' }).tap();
  await tapWindmill();
  await phone.locator('.town-touch-preview strong').filter({ hasText: '关于' }).waitFor();
  assert.equal(new URL(phone.url()).pathname, '/', 'closing the preview did not reset the first tap');
  await tapWindmill();
  await phone.waitForURL('**/about/');
  await phone.goBack(); await ready(phone);
  // Zoom out so the outer friend ring is visible on a narrow canvas.
  await phone.locator('canvas').dispatchEvent('wheel', { deltaY: 900 });
  await phone.waitForTimeout(300);
  const touchClient = await mobile.newCDPSession(phone);
  for (let i = 0; i < 8; i++) {
    const canvas = phone.locator('canvas');
    const box = await canvas.boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const point = project({ x: hut.x, y: .7, z: hut.z }, box, await canvas.evaluate(el => ({ ...el.dataset })));
    if (Math.hypot(point.x - center.x, point.y - center.y) < 50) break;
    const dx = Math.max(-130, Math.min(130, center.x - point.x));
    const dy = Math.max(-130, Math.min(130, center.y - point.y));
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center }] });
    for (let step = 1; step <= 6; step++) await touchClient.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + dx * step / 6, y: center.y + dy * step / 6 }] });
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const friendPoint = await modelPoint(phone, { x: hut.x, y: .7, z: hut.z }, friendName);
  const tapFriend = () => phone.touchscreen.tap(friendPoint.x, friendPoint.y);
  await tapFriend();
  await phone.locator('.town-touch-preview strong').filter({ hasText: friendName }).waitFor();
  assert.equal(mobile.pages().length, 1, 'first friend tap opened a tab instead of previewing');
  assert.equal(await phone.locator('.town-touch-preview a').count(), 0, 'friend preview added an unwanted visit link');
  await phone.screenshot({ path: '/tmp/town-touch-friend.png' });
  popupPromise = phone.waitForEvent('popup');
  await tapFriend();
  popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Mobile friend reached' }).waitFor();
  assert.equal(new URL(phone.url()).pathname, '/');
  assert.equal(await phone.locator('.town-touch-preview').count(), 0, 'friend preview stayed selected after opening');
  await popup.close();
  console.log('PASS: mobile windmill/friend meshes preview on first tap and navigate on second; close resets the preview and friends open in a new tab');
  await mobile.close();
  assert.deepEqual(errors, []);
} finally { projectionEngine.dispose(); await browser.close(); }
