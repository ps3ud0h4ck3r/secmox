const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `cr${Date.now()}@x.com`;
  await ctx.request.post('http://localhost:8799/api/auth/signup', {
    data: { email, password: 'passpass12', track: 'soc' },
  });

  // Variable count: hit chains a few times, record totals.
  const counts = [];
  for (let i = 0; i < 6; i++) {
    const r = await ctx.request.get('http://localhost:8799/api/score/chains?role=pentest');
    const d = await r.json();
    const steps = d.chains.reduce((a, c) => a + c.steps.length, 0);
    counts.push(`${d.chains.length}ch/${steps}q`);
  }
  console.log('pentest run sizes:', counts.join(' '));

  // Full flow via UI: name -> test -> code.
  await page.goto('http://localhost:8799/app/');
  await page.click('[data-view="scoreView"]');
  await page.waitForSelector('#scoreName');

  // Starting without a name should be blocked.
  await page.click('.score-role >> text=SOC');
  await page.waitForTimeout(150);
  console.log('name-guard msg:', (await page.textContent('#scoreNameMsg')).trim());

  await page.fill('#scoreName', 'Priya Sharma');
  await page.click('.score-role >> text=SOC');
  await page.waitForSelector('.score-progress-n');
  const total = parseInt((await page.textContent('.score-progress-n')).match(/of (\d+)/)[1], 10);
  console.log('SOC run questions:', total);

  // Answer every question picking the first option, then submit.
  for (let i = 0; i < total; i++) {
    await page.locator('.score-opt input[type="radio"]').first().check();
    const label = await page.textContent('#scoreNext');
    await page.click('#scoreNext');
    await page.waitForTimeout(260);
    if (label.includes('Submit')) break;
  }
  await page.waitForSelector('.score-code', { timeout: 6000 });
  const code = (await page.textContent('.score-code')).trim();
  console.log('generated code:', code, '| format ok:', /^SMX-[A-Z]{3}-[0-9A-Z]{5}$/.test(code));
  await page.screenshot({ path: '/tmp/cred-result.png', fullPage: true });

  // Verify the code on the public portal (lowercase to test normalization).
  const vp = await ctx.request.get(
    `http://localhost:8799/api/score/v/${encodeURIComponent(code.toLowerCase())}`,
  );
  const vd = await vp.json();
  console.log('verify-by-code:', vp.status(), '| name:', vd.name, '| position:', vd.position,
    '| score:', vd.score, '| scenarios:', vd.scenarios?.length);

  // Render the public verify page.
  const vpage = await ctx.newPage();
  await vpage.goto(`http://localhost:8799/score/?code=${encodeURIComponent(code)}`);
  await vpage.waitForSelector('.verify-big', { timeout: 6000 });
  await vpage.screenshot({ path: '/tmp/cred-verify.png', fullPage: true });
  console.log('verify page name:', (await vpage.textContent('.verify-name')).trim());

  // Landing portal form -> score page.
  const lp = await ctx.newPage();
  await lp.goto('http://localhost:8799/');
  await lp.fill('.verify-portal-form input[name="code"]', code);
  await Promise.all([lp.waitForNavigation(), lp.click('.verify-portal-form button[type="submit"]')]);
  console.log('landing portal -> url has code:', lp.url().includes('code='));

  await browser.close();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
