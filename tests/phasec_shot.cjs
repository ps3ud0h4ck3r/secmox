const { chromium } = require('playwright');
const fs=require('fs'); const token=fs.readFileSync('/tmp/ctok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/app/');
  await p.waitForSelector('#dashJourney .journey-step', { timeout: 8000 });
  console.log('journey steps:', await p.$$eval('.journey-step', es=>es.map(e=>e.textContent.trim()).join(' | ')));
  console.log('journey next:', (await p.textContent('.journey-foot')).trim());
  await p.screenshot({ path:'/tmp/journey.png' });
  // Packs
  await p.click('[data-view="packsView"]');
  await p.waitForSelector('#packBrowseList', { timeout: 6000 });
  await p.waitForTimeout(800);
  console.log('pack browse has TCS q:', (await p.textContent('#packBrowseList')).includes('triaging'));
  console.log('admin mod panel present:', await p.$('.pack-mod') !== null);
  await p.screenshot({ path:'/tmp/packs.png', fullPage:true });
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
