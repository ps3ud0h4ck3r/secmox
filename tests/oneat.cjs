const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Sign up (sets the session cookie in this context).
  const email = `pw${Date.now()}@x.com`;
  const r = await ctx.request.post('http://localhost:8799/api/auth/signup', {
    data: { email, password: 'passpass12', track: 'soc' },
  });
  console.log('signup', r.status());

  await page.goto('http://localhost:8799/app/');
  await page.click('[data-view="scoreView"]');
  await page.waitForTimeout(400);
  await page.click('.score-role >> text=SOC');
  await page.waitForSelector('.score-progress-n', { timeout: 5000 });

  const q1 = await page.textContent('.score-progress-n');
  const nextLabel1 = await page.textContent('#scoreNext');
  const optCount = await page.locator('.score-opt').count();
  console.log('Q1 progress:', q1, '| button:', nextLabel1, '| options:', optCount);
  await page.screenshot({ path: '/tmp/score-q1.png' });

  // Try Next without answering (should warn).
  await page.click('#scoreNext');
  await page.waitForTimeout(150);
  console.log('warn on empty:', (await page.textContent('#scoreRunMsg')).trim());

  // Answer and advance a few questions, capturing progress each time.
  const total = parseInt(q1.match(/of (\d+)/)[1], 10);
  for (let i = 1; i <= total; i++) {
    await page.locator('.score-opt input[type="radio"]').first().check();
    const label = await page.textContent('#scoreNext');
    if (i === 2) await page.screenshot({ path: '/tmp/score-q2.png' });
    await page.click('#scoreNext');
    await page.waitForTimeout(250);
    if (label.includes('Submit')) break;
    const p = await page.textContent('.score-progress-n');
    if (i <= 2) console.log(`after Q${i} ->`, p);
  }

  await page.waitForSelector('.score-result', { timeout: 6000 });
  const score = await page.textContent('.score-big');
  const band = await page.textContent('.score-band');
  console.log('RESULT score:', score, '| band:', band.trim());
  await page.screenshot({ path: '/tmp/score-result.png', fullPage: true });

  await browser.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
