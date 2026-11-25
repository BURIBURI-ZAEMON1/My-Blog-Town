// Build first, then run against the preview. Browser plugin unavailable: use installed Playwright.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4325';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await context.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const requests = new Map();
  let slowPost;
  let lateFailure, shownFailure, releaseLateFailure;
  const lateFailureGate = new Promise(resolve => { releaseLateFailure = resolve; });
  let releaseSlow;
  const slowGate = new Promise(resolve => { releaseSlow = resolve; });
  await page.route('**/data/posts/*.json', async route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop().replace('.json', ''));
    requests.set(id, (requests.get(id) ?? 0) + 1);
    if (id === lateFailure) {
      await lateFailureGate;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return;
    }
    if (id === shownFailure) { await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return; }
    if (id === slowPost) await slowGate;
    await route.continue();
  });
  const ready = async () => {
    await page.waitForFunction(() => document.querySelector('.brick-town-host')?.dataset.ready === 'true' && document.querySelector('canvas')?.dataset.effectsReady === 'true', null, { timeout: 60000 });
    await page.locator('.site-entry').waitFor({ state: 'hidden' });
  };
  const list = async () => {
    await page.locator('.desktop-sidebar-nav button').filter({ hasText: '列表' }).click();
    return page.locator('.sidebar-post');
  };
  const observe = () => page.evaluate(() => {
    const canvas = document.querySelector('.brick-town-host canvas');
    window.flight = { start: 0, samples: [], fetches: [], arrived: 0, focused: false, canvas };
    if (!window.originalFetch) {
      window.originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        if (String(args[0]).startsWith('/data/posts/')) window.flight?.fetches.push({ at: performance.now(), town: !!document.querySelector('.town-home') });
        return window.originalFetch(...args);
      };
    }
    const sample = () => {
      if (canvas.dataset.focusPost && !window.flight.focused) {
        window.flight.start = performance.now();
        window.flight.focused = true;
      }
      window.flight.samples.push({ x: +canvas.dataset.cameraX, z: +canvas.dataset.cameraZ, zoom: +canvas.dataset.zoom });
      if (!canvas.isConnected) { window.flight.arrived = performance.now(); observer.disconnect(); }
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.querySelector('.main-scroll'), { attributes: true, childList: true, subtree: true });
  });
  const result = () => page.evaluate(() => ({
    elapsed: window.flight.arrived - window.flight.start,
    samples: window.flight.samples,
    concurrentFetch: window.flight.fetches.some(request => request.town && request.at <= window.flight.start),
    final: { ...window.flight.canvas.dataset },
  }));
  const camera = (tab) => tab.locator('.brick-town-host canvas').evaluate(el =>
    [el.dataset.cameraX, el.dataset.cameraY, el.dataset.cameraZ, el.dataset.zoom]);
  const settledCamera = async (tab) => {
    const frame = await tab.locator('.brick-town-host canvas').getAttribute('data-frames');
    await tab.waitForFunction(previous => +document.querySelector('.brick-town-host canvas').dataset.frames > +previous, frame);
    return camera(tab);
  };
  const backToTown = async (tab, expected) => {
    assert.equal(await tab.locator('.brick-town-host canvas').count(), 0, 'reading kept the town mounted');
    await tab.evaluate(() => {
      window.firstTownPose = undefined;
      const observer = new MutationObserver(() => {
        const data = document.querySelector('.brick-town-host canvas')?.dataset;
        if (data?.cameraX === undefined) return;
        window.firstTownPose = [data.cameraX, data.cameraY, data.cameraZ, data.zoom];
        observer.disconnect();
      });
      observer.observe(document.querySelector('.main-scroll'), { attributes: true, childList: true, subtree: true });
    });
    await tab.goBack();
    await tab.waitForFunction(() => document.querySelector('.brick-town-host')?.dataset.ready === 'true');
    assert.deepEqual(await tab.evaluate(() => window.firstTownPose), expected, 'first town frame did not restore the pre-click camera');
    assert.equal(await tab.locator('.site-entry').count(), 0, 'return replayed the site splash');
  };

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.title(), '黑蚊子的门');
  await ready();
  let links = await list();
  const firstPath = await links.nth(0).getAttribute('href');
  const secondPath = await links.nth(1).getAttribute('href');
  const firstId = decodeURIComponent(firstPath.split('/')[2]);
  const secondId = decodeURIComponent(secondPath.split('/')[2]);
  const defaultCamera = await camera(page);
  await page.locator('.brick-town-host canvas').dispatchEvent('wheel', { deltaY: 120 });
  await page.waitForFunction(zoom => document.querySelector('.brick-town-host canvas').dataset.zoom !== zoom, defaultCamera[3]);
  const firstDeparture = await camera(page);
  await observe();
  const requested = page.waitForRequest(`**/data/posts/${encodeURIComponent(firstId)}.json`);
  const received = page.waitForResponse(`**/data/posts/${encodeURIComponent(firstId)}.json`);
  await links.nth(0).click();
  await page.waitForFunction(() => window.flight.focused);
  await requested;
  await (await received).finished();
  await page.screenshot({ path: '/tmp/town-article-focus-desktop.png' });
  await page.waitForFunction(() => window.flight.arrived > 0);
  await page.locator('.article-body').waitFor();
  assert.equal(new URL(page.url()).pathname, firstPath);
  assert.equal(requests.get(firstId), 1, 'prefetch and article navigation fetched the same payload twice');
  const first = await result();
  assert.equal(first.final.focusProgress, '1');
  assert(first.concurrentFetch, 'article fetch waited for the camera to finish');
  assert.equal(+first.final.focusDurationMs, 760);
  assert.equal(+first.final.zoom, 2.35);
  assert(first.elapsed >= 740, `focus ended before its deadline: ${first.elapsed}`);
  const start = first.samples[0], end = first.samples.at(-1);
  assert(first.samples.every(point => Math.abs((point.x - start.x) * (end.z - start.z) - (point.z - start.z) * (end.x - start.x)) < 1), 'camera took a sideways detour');
  console.log('PASS: sidebar focus and concurrent article load');

  await backToTown(page, firstDeparture);
  await ready();
  links = await list();
  const canvas = page.locator('.brick-town-host canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .6);
  await page.mouse.wheel(0, -1000);
  await page.waitForFunction(() => +document.querySelector('canvas[data-zoom]').dataset.zoom === 2.6);
  await page.mouse.move(box.x + box.width * .15, box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .9, box.y + box.height * .85, { steps: 8 });
  await page.mouse.up();
  const secondDeparture = await settledCamera(page);
  assert.notEqual(secondDeparture[0], firstDeparture[0], 'drag did not pan the town');
  slowPost = secondId;
  await observe();
  await links.nth(1).click();
  await page.waitForFunction(() => window.flight.arrived > 0);
  const second = await result();
  assert.equal(second.final.focusProgress, '1');
  assert.equal(second.final.focusDurationMs, first.final.focusDurationMs, 'distance changed the focus duration');
  assert.equal(+second.final.zoom, 2.6, 'close camera zoomed out');
  // GPU stalls can skip intermediate frames in headless Chromium; view.ts checks the complete rise/dive curve.
  assert(Math.hypot(second.samples[0].x - +second.final.cameraX, second.samples[0].z - +second.final.cameraZ) > 8, 'the close-view case did not exercise a distant building');
  assert.equal(new URL(page.url()).pathname, secondPath);
  assert.equal(await page.locator('.article-body').count(), 0, 'held article unexpectedly rendered');
  assert.equal(requests.get(secondId), 1, 'slow prefetch was duplicated at navigation');
  releaseSlow();
  await page.locator('.article-body').waitFor();
  console.log('PASS: distant close-view rise/dive and slow article payload');

  await backToTown(page, secondDeparture);
  await ready();
  links = await list();
  await page.evaluate(() => {
    document.querySelectorAll('.sidebar-post')[0].click();
    setTimeout(() => document.querySelectorAll('.sidebar-post')[1].click(), 100);
  });
  await page.waitForURL(`**${secondPath}`);
  await page.locator('.article-body').waitFor();
  assert.equal(requests.get(firstId), 1);
  assert.equal(requests.get(secondId), 1, 'cached article was fetched again');
  await backToTown(page, secondDeparture);
  await canvas.dispatchEvent('wheel', { deltaY: 200 });
  await page.waitForFunction(zoom => document.querySelector('.brick-town-host canvas').dataset.zoom !== zoom, secondDeparture[3]);
  const forwardDeparture = await camera(page);
  await page.goForward();
  await page.locator('.article-body').waitFor();
  await backToTown(page, forwardDeparture);
  await page.goForward();
  await page.locator('.article-body').waitFor();

  await page.locator('.desktop-top-links a[href="/"]').click();
  await ready();
  assert.deepEqual(await camera(page), defaultCamera, 'the main town link should open a fresh view');
  links = await list();
  await page.evaluate(() => {
    document.querySelectorAll('.sidebar-post')[0].click();
    document.querySelector('.desktop-top-links a[href="/posts/"]').click();
  });
  await page.waitForTimeout(900);
  assert.equal(new URL(page.url()).pathname, '/posts/', 'cancelled focus forced article navigation');

  await page.goBack();
  await ready();
  const buildingCanvas = page.locator('.brick-town-host canvas');
  const buildingBox = await buildingCanvas.boundingBox();
  const roof = await page.locator('.town-new-post-anchor').first().evaluate(el => ({ x: +el.getAttribute('cx'), y: +el.getAttribute('cy') }));
  let buildingPoint;
  for (const offset of [0, 6, 12, 18, 24]) {
    const point = { x: buildingBox.x + roof.x, y: buildingBox.y + roof.y + offset };
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(50);
    if (await buildingCanvas.evaluate(el => el.style.cursor === 'pointer')) { buildingPoint = point; break; }
  }
  assert(buildingPoint, 'could not pick the visible article building');
  const buildingDeparture = await camera(page);
  await observe();
  await page.mouse.click(buildingPoint.x, buildingPoint.y);
  await page.waitForFunction(() => window.flight.arrived > 0);
  assert((await result()).final.focusPost, 'building click bypassed camera focus');
  await page.locator('.article-body').waitFor();
  console.log('PASS: real canvas building click');

  await backToTown(page, buildingDeparture);
  await ready();
  links = await list();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await links.nth(0).click();
  await page.waitForURL(`**${firstPath}`);
  assert.equal(await page.locator('canvas[data-focus-post]').count(), 0);
  lateFailure = decodeURIComponent((await links.nth(2).getAttribute('href')).split('/')[2]);
  shownFailure = decodeURIComponent((await links.nth(3).getAttribute('href')).split('/')[2]);
  await links.nth(2).click();
  await links.nth(3).click();
  await page.getByRole('button', { name: /重新载入/ }).waitFor();
  const lateResponse = page.waitForResponse(`**/data/posts/${encodeURIComponent(lateFailure)}.json`);
  releaseLateFailure();
  await (await lateResponse).finished();
  await page.waitForTimeout(100);
  assert(await page.getByRole('button', { name: /重新载入/ }).isVisible(), 'earlier failure replaced the current article error');
  assert.equal(requests.get(shownFailure), 1, 'earlier failure silently retried the current article');
  shownFailure = undefined;
  await page.getByRole('button', { name: /重新载入/ }).click();
  await page.locator('.article-body').waitFor();
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  const phone = await mobile.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  let mobileRequests = 0;
  await phone.route('**/data/posts/*.json', async route => {
    if (++mobileRequests === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.continue();
  });
  await phone.goto(base, { waitUntil: 'domcontentloaded' });
  await phone.waitForFunction(() => document.querySelector('.brick-town-host')?.dataset.ready === 'true', null, { timeout: 60000 });
  await phone.locator('.site-entry').waitFor({ state: 'hidden' });
  const phoneCanvas = phone.locator('.brick-town-host canvas');
  const phoneCamera = await camera(phone);
  const cdp = await mobile.newCDPSession(phone);
  const phoneBox = await phoneCanvas.boundingBox();
  const touches = distance => [{ x: 195 - distance, y: phoneBox.y + 250, id: 1 }, { x: 195 + distance, y: phoneBox.y + 250, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(26) });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(26 + i * 6) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const phoneDeparture = await settledCamera(phone);
  assert.notEqual(phoneDeparture[3], phoneCamera[3], 'pinch did not zoom the town');
  const recent = phone.locator('.recent-card').first();
  const mobilePath = await recent.getAttribute('href');
  await recent.click();
  await phone.waitForURL(`**${mobilePath}`);
  await phone.getByRole('button', { name: /重新载入/ }).click();
  await phone.locator('.article-body').waitFor();
  assert.equal(mobileRequests, 2, 'article retry did not start a fresh request');
  await phone.screenshot({ path: '/tmp/town-article-focus-mobile.png' });
  assert.equal(await phone.locator('canvas[data-focus-post]').count(), 0);
  await phone.setViewportSize({ width: 430, height: 820 });
  await backToTown(phone, phoneDeparture);
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('PASS: desktop and mobile restore the pre-click camera on the first frame; forward navigation updates it and the main town link starts fresh.');
} finally { if(errors.length) console.error(errors); await browser.close(); }
