import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const USERNAME = 'teaser380';
const PASSWORD = 'Teaser380!!';
const TWEET = `AGENTS.md files might be hurting your coding agents. New arXiv paper: context files reduce task success rates vs. no context at all — and increase inference cost by 20%+. Less is more. Only add minimal, essential requirements.

arxiv.org/abs/2602.11988`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'Australia/Melbourne',
  });

  const page = await ctx.newPage();

  try {
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/x-s1.png' });

    // Username step
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
    await page.type('input[autocomplete="username"]', USERNAME, { delay: 80 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/x-s2.png' });

    // Unusual activity check
    const unusual = page.locator('input[data-testid="ocfEnterTextTextInput"]');
    if (await unusual.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unusual.type('michal.szalinski@gmail.com', { delay: 60 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    // Password step
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    await page.type('input[name="password"]', PASSWORD, { delay: 80 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/x-s3.png' });

    console.log('Logged in. URL:', page.url());

    // Compose
    await page.waitForSelector('[data-testid="SideNav_NewTweet_Button"]', { timeout: 15000 });
    await page.click('[data-testid="SideNav_NewTweet_Button"]');
    await page.waitForTimeout(2000);

    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await page.type('[data-testid="tweetTextarea_0"]', TWEET, { delay: 40 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/x-s4.png' });

    await page.click('[data-testid="tweetButtonInline"]');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '/tmp/x-s5.png' });
    console.log('Posted! Final URL:', page.url());
  } catch(e) {
    console.error('Failed:', e.message);
    await page.screenshot({ path: '/tmp/x-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
