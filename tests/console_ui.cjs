const { chromium } = require('playwright');
const fs = require('fs');
const token = fs.readFileSync('/tmp/otok.txt','utf8').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addCookies([{name:'sm_session',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8799/console/');
  // go to Users tab
  await p.waitForTimeout(500);
  const usersTab = await p.$('text=Users');
  if (usersTab) await usersTab.click();
  await p.waitForSelector('.con-person', { timeout: 6000 });
  // open Edit on first row
  await p.$$eval('.con-person .con-person-actions button', (bs)=>{ const e=bs.find(x=>x.textContent.trim()==='Edit'); if(e) e.click(); });
  await p.waitForTimeout(300);
  const hasPanel = await p.isVisible('.con-person-edit');
  const inputs = await p.$$eval('.con-person-edit .con-edit-input', els=>els.length);
  const del = await p.$eval('.con-danger', el=>el.textContent).catch(()=>'none');
  console.log('edit panel visible:', hasPanel, '| inputs:', inputs, '| delete btn:', del);
  await p.screenshot({ path:'/tmp/console-edit.png', fullPage:true });
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
