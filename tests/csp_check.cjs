const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:8799/score/?code=SMX-GRC-Y5HY7');
  await p.waitForSelector('.verify-big', { timeout: 6000 }).catch(()=>{});
  const rendered = await p.$('.verify-big') !== null;
  await p.goto('http://localhost:8799/');
  await p.waitForTimeout(800);
  const cspErrs = errs.filter(e => /content security policy|refused to|blocked/i.test(e));
  console.log('score verify page rendered under CSP:', rendered);
  console.log('CSP violation errors:', cspErrs.length, cspErrs.slice(0,3));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
