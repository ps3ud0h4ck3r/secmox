const { chromium } = require('playwright');
const fs=require('fs'); const token=fs.readFileSync('/tmp/btok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/app/');
  await p.waitForTimeout(1500);
  console.log('verify banner visible:', await p.isVisible('#verifyBanner'));
  console.log('banner text:', (await p.textContent('#verifyBannerMsg')).trim());
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
