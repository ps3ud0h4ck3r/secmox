const { chromium } = require('playwright');
const fs=require('fs'); const token=fs.readFileSync('/tmp/mtok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:380,height:820}, deviceScaleFactor:2 });
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/');
  await p.waitForTimeout(800);
  await p.screenshot({ path:'/tmp/m-landing.png' });
  await p.goto('http://localhost:8799/app/');
  await p.waitForTimeout(1800);
  await p.screenshot({ path:'/tmp/m-app.png' });
  // practice view
  const pr = await p.$('[data-view="practiceView"]'); if (pr) { await pr.click(); await p.waitForTimeout(800); await p.screenshot({ path:'/tmp/m-practice.png' }); }
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
