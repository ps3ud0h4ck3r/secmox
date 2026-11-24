const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `an${Date.now()}@x.com`;
  await ctx.request.post('http://localhost:8799/api/auth/signup', {
    data: { email, password: 'passpass12', track: 'soc' },
  });
  await page.goto('http://localhost:8799/app/');
  await page.click('[data-view="scoreView"]');
  await page.waitForTimeout(300);
  await page.click('.score-role >> text=SOC');
  await page.waitForSelector('.score-progress-n');

  // Enter animation present on first card?
  const enterClass = await page.locator('.score-chain').getAttribute('class');
  console.log('Q1 card class:', enterClass);

  // Answer, click Next, and sample a frame mid-transition.
  await page.locator('.score-opt input[type="radio"]').first().check();
  await page.click('#scoreNext');
  await page.waitForTimeout(90); // during leave/enter window
  await page.screenshot({ path: '/tmp/anim-mid.png' });
  const midClass = await page.locator('.score-chain').getAttribute('class').catch(() => 'none');
  console.log('mid-transition card class:', midClass);

  await page.waitForTimeout(300);
  const q2 = await page.textContent('.score-progress-n');
  console.log('after transition:', q2);

  // Confirm reduced-motion path still advances (no hang).
  await browser.close();

  const browser2 = await chromium.launch();
  const ctx2 = await browser2.newContext({ reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await ctx2.request.post('http://localhost:8799/api/auth/signup', {
    data: { email: `rm${Date.now()}@x.com`, password: 'passpass12', track: 'soc' },
  });
  await p2.goto('http://localhost:8799/app/');
  await p2.click('[data-view="scoreView"]');
  await p2.waitForTimeout(300);
  await p2.click('.score-role >> text=SOC');
  await p2.waitForSelector('.score-progress-n');
  await p2.locator('.score-opt input[type="radio"]').first().check();
  await p2.click('#scoreNext');
  await p2.waitForTimeout(150);
  console.log('reduced-motion advanced to:', await p2.textContent('.score-progress-n'));
  await browser2.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
