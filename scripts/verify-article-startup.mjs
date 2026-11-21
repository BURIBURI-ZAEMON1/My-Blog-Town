import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TOWN_BLOG_TEST_URL ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let releaseApp;
    const appGate = new Promise((resolve) => { releaseApp = resolve; });
    await page.route(/\/TownBlogApp\.[^/]+\.js/, async (route) => {
      await appGate;
      await route.continue();
    });
    // A slow font connection must leave the article readable in fallback fonts.
    await page.route(/\.woff2?(?:\?|$)/, (route) => route.abort());
    try {
      await page.goto(`${base}/posts/`, { waitUntil: 'domcontentloaded' });
      const articlePath = await page.locator('.archive-row').first().getAttribute('href');
      await page.goto(new URL(articlePath, base).href, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('style[data-town-fonts]').count(), 0, 'Fonts must not compete with the entry transition');
      await page.waitForFunction(() => !document.documentElement.classList.contains('has-site-entry'), null, { timeout: 5000 });
      assert(await page.locator('.article-body').innerText(), 'Static article must be readable before React arrives');
      assert.equal(await page.locator('.app-shell').getAttribute('inert'), null);
      releaseApp();
      await page.waitForSelector('style[data-town-fonts]', { state: 'attached' });
      const faces = await page.evaluate(() => Array.from(document.fonts)
        .filter((face) => face.family.includes('IBM Plex Sans SC') || face.family.includes('ZCOOL'))
        .map((face) => ({ family: face.family, display: face.display, range: face.unicodeRange })));
      assert(faces.some((face) => face.family.includes('IBM Plex Sans SC')));
      assert(faces.some((face) => face.family.includes('ZCOOL') && face.range !== 'U+0-10FFFF'));
      assert(faces.every((face) => face.display === 'swap'), 'Chinese text must not wait for font downloads');
      const toggle = page.locator('.heading-toggle').first();
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('.heading-toggle')?.getAttribute('aria-expanded') === 'false');
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('.heading-toggle')?.getAttribute('aria-expanded') === 'true');
      assert.deepEqual(errors, []);
      console.log(`${mobile ? 'Mobile' : 'Desktop'} article startup: static content and nonblocking split fonts OK`);
    } finally {
      releaseApp();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
