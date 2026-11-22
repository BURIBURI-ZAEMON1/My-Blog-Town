// Browser plugin unavailable; use the project's installed Playwright.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4325';
const browser = await chromium.launch({ headless: true });
const errors = [];
const observeErrors = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};
const cardStyle = card => card.evaluate(element => ({
  color: getComputedStyle(element).backgroundColor,
  glass: getComputedStyle(element, '::before').opacity,
  transform: getComputedStyle(element).transform,
  pointer: element.style.getPropertyValue('--pointer-x'),
  shadow: getComputedStyle(element).boxShadow,
}));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1390 } });
  await context.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  let localCounterRequests = 0;
  await context.route('https://busuanzi.ibruce.info/**', route => { localCounterRequests++; return route.abort(); });
  const page = await context.newPage(); observeErrors(page);
  await page.goto(`${base}/about/`);
  await page.locator('.about-card').last().waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.match(await page.title(), /关于/);
  assert.equal(await page.locator('.about-portrait > span').innerText(), await page.locator('.profile-panel h2').innerText());
  assert.deepEqual(await page.locator('.about-card h2').allTextContents(), ['关于我', '这座小镇', '关于框架', '写作与记录']);
  for (const card of await page.locator('.about-card').all()) {
    const style = await cardStyle(card);
    assert.equal(style.color, 'rgb(255, 255, 255)'); assert.equal(style.glass, '0');
  }
  const links = page.locator('.about-hero .about-profile-links a');
  assert.equal(await links.count(), 5);
  for (const link of await links.all()) {
    assert(await link.getAttribute('aria-label'));
    assert.match(await link.locator('img').getAttribute('src'), /^\/assets\/links\/.+\.svg$/);
    assert.equal((await link.innerText()).trim(), '');
  }
  await page.screenshot({ path: '/tmp/about-glass-default.png' });
  const card = page.locator('.about-card').nth(1), box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .25);
  await page.waitForTimeout(400);
  const left = await cardStyle(card); assert.equal(left.glass, '1');
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .7);
  await page.waitForTimeout(400);
  const right = await cardStyle(card);
  assert.notEqual(right.pointer, left.pointer); assert.notEqual(right.transform, left.transform); assert.notEqual(right.shadow, left.shadow);
  assert.equal((await cardStyle(page.locator('.about-card').first())).glass, '0', 'hover tinted an unrelated card');
  await page.screenshot({ path: '/tmp/about-glass-hover.png' });
  await page.mouse.move(1350, 100); await page.waitForTimeout(400);
  assert.equal((await cardStyle(card)).glass, '0');
  assert.equal((await cardStyle(card)).pointer, '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.hover(); assert.equal((await cardStyle(card)).transform, 'none');
  await page.getByRole('button', { name: '切换昼夜模式' }).click();
  assert.notEqual((await cardStyle(card)).color, 'rgb(255, 255, 255)', 'night mode has a blinding white card');
  assert.equal(localCounterRequests, 0, 'local preview wrote external statistics');
  console.log('PASS: white resting cards, independent blue glass hover, cursor parallax/light/shadow, reset, reduced motion, night mode and accessible existing icons');
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  const phone = await mobile.newPage(); observeErrors(phone);
  await phone.goto(`${base}/about/`); await phone.locator('.about-card').last().waitFor();
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.locator('.about-card').first().tap();
  assert.equal((await cardStyle(phone.locator('.about-card').first())).pointer, '');
  await phone.locator('.about-heading').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: '/tmp/about-glass-mobile.png' });
  console.log('PASS: touch does not tilt cards; mobile has no horizontal overflow');
  await mobile.close();

  // Serve this build under its canonical origin, mocking only the external totals.
  const production = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await production.addInitScript(() => sessionStorage.setItem('town:entered', 'true'));
  const host = 'https://www.heavensdoor1.top';
  await production.route(`${host}/**`, async route => {
    const url = new URL(route.request().url());
    try {
      const response = await production.request.get(`${base}${url.pathname}${url.search}`);
      await route.fulfill({ response });
    } catch (error) {
      // SPA navigation can cancel a pending font request before this proxy responds.
      if (!/Route is already handled|Target .*closed|Request context disposed/i.test(error.message)) throw error;
    }
  });
  const referrers = [];
  await production.route('https://busuanzi.ibruce.info/busuanzi?**', async route => {
    referrers.push(await route.request().headerValue('referer'));
    const callback = new URL(route.request().url()).searchParams.get('jsonpCallback');
    assert.match(callback, /^TownViews_\d+_\d+$/);
    await route.fulfill({ contentType: 'application/javascript', body: `${callback}({site_pv:3210,site_uv:456,page_pv:78});` });
  });
  const live = await production.newPage(); observeErrors(live);
  await live.goto(`${host}/about/`);
  await live.locator('.about-stats dd').filter({ hasText: '3,210' }).waitFor();
  assert((await live.locator('.about-stats dd').allTextContents()).includes('456'));
  assert.equal(referrers[0], `${host}/about/`);
  assert.equal(await live.locator('.sidebar').getByText('3,210').count(), 0);
  await live.locator('.desktop-top-links a[href="/posts/"]').click();
  await live.waitForURL('**/posts/');
  await live.locator('.archive-row').first().click();
  await live.locator('.article-meta').getByText('78 次阅读', { exact: true }).waitFor();
  assert(referrers.includes(`${host}/posts/`), 'SPA archive visit was not counted');
  assert(referrers.some(url => url === live.url()), 'article referrer did not identify the current article');
  console.log('PASS: canonical-origin external counter integration, About-only site PV/UV, per-article reading count, and SPA route referrers');
  await live.evaluate(() => document.fonts.ready);
  await production.unrouteAll({ behavior: 'wait' });
  await production.close();
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
