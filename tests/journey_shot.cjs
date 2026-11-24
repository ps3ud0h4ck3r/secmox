const { chromium } = require('playwright');
const fs=require('fs'); const token=fs.readFileSync('/tmp/ctok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/app/');
  await p.waitForSelector('#dashJourney .journey-foot', { timeout: 8000 });
  await p.waitForTimeout(500);
  const box = await p.$('#dashJourney');
  await box.screenshot({ path:'/tmp/journey2.png' });
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
