const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto('http://localhost:8799/u/priya-sharma');
  await p.waitForSelector('.profile-role', { timeout: 6000 });
  await p.screenshot({ path: '/tmp/profile.png', fullPage: true });
  console.log('name:', await p.$eval('.verify-name', e=>e.textContent));
  console.log('roles:', await p.$$eval('.profile-role-name', es=>es.map(e=>e.textContent).join(', ')));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
