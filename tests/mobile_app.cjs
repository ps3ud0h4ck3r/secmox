const { chromium } = require('playwright');
const fs=require('fs'); const token=fs.readFileSync('/tmp/mtok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:380,height:820}, deviceScaleFactor:2 });
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/app/');
  await p.waitForSelector('.splash-lock', { state:'detached', timeout:12000 }).catch(()=>{});
  await p.waitForTimeout(600);
  await p.screenshot({ path:'/tmp/m-dash.png' });
  await p.click('[data-view="practiceView"]');
  await p.waitForSelector('.splash-lock', { state:'detached', timeout:12000 }).catch(()=>{});
  await p.waitForTimeout(600);
  await p.screenshot({ path:'/tmp/m-prac.png' });
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
