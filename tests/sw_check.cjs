const { chromium } = require('playwright');
const fs=require('fs'); const token=fs.readFileSync('/tmp/mtok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/app/');
  await p.waitForTimeout(2500);
  const reg = await p.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no-sw-api';
    const r = await navigator.serviceWorker.getRegistration();
    return r ? ('registered:' + (r.active ? 'active' : r.installing ? 'installing' : 'waiting')) : 'none';
  });
  console.log('service worker:', reg);
  // manifest linked?
  console.log('manifest link:', await p.$eval('link[rel="manifest"]', e=>e.href).catch(()=>'none'));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
