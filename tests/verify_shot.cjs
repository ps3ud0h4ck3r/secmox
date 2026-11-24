const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto('http://localhost:8799/score/?code=SMX-GRC-QD1CRC');
  await p.waitForSelector('.verify-big', { timeout: 6000 });
  await p.screenshot({ path: '/tmp/verify-enriched.png', fullPage: true });
  console.log('pct:', await p.$eval('.verify-pct', e=>e.textContent).catch(()=>'none'));
  console.log('chips:', await p.$$eval('.verify-chip', es=>es.map(e=>e.textContent).join(' | ')));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
