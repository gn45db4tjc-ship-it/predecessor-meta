const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:12968/';
let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(base).port,'--bind','127.0.0.1','--directory','qa/audit-site'],{windowsHide:true,stdio:'ignore'});
  for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break;}catch{}if(attempt===50)throw Error('Preview did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true}));
 const report={checks:[],errors:[],limitations:['No physical device or screen-reader acceptance']};
 try{
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addInitScript(t=>{localStorage.setItem('predecessor-theme',t);if(!localStorage.getItem('predecessor-companion-v1'))localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));},theme);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
  if(width<700)assert.deepEqual(await page.locator('#mobile-navigation button').allTextContents(),['Meta','Match','More']);
  await page.evaluate(()=>openHero('khaimera','jungle'));
  if(width<700){assert.equal(await page.locator('.simple-hero-section').count(),1);await page.locator('[data-simple-section="alternatives"]').click();const chosen=page.locator('[data-choose-playstyle]').first();await chosen.click();assert.equal(await page.evaluate(()=>buildSelection({slug:S.hero,role:S.heroRole}).status),'selected');}
  const chart=await page.locator('[data-skill-guide] .skill-chart').first().evaluate(t=>({levels:[...t.tHead.rows[0].cells].slice(1).map(c=>c.textContent.trim()),rows:[...t.tBodies[0].rows].map(r=>r.dataset.skillRow),perLevel:[...t.tHead.rows[0].cells].slice(1).map((c,i)=>[...t.tBodies[0].rows].filter(r=>r.cells[i+1].classList.contains('is-ticked')).length),perRow:[...t.tBodies[0].rows].map(r=>r.querySelectorAll('td.is-ticked').length)}));assert.deepEqual(chart.levels,Array.from({length:18},(_,i)=>String(i+1)));assert.deepEqual(chart.rows,['Primary','Secondary','Alternate','Ultimate']);assert(chart.perLevel.every(n=>n===1),'one ticked box per level');assert.deepEqual(chart.perRow,[5,5,5,3]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'the chart scrolls inside its own box, not the page');if(width<700){const fit=await page.locator('[data-skill-guide] .skill-chart-scroll').first().evaluate(s=>{const box=s.getBoundingClientRect(),pinned=s.querySelector('th.skill-chart-corner').getBoundingClientRect();return {levels:[...s.querySelectorAll('th.skill-chart-level')].filter(c=>{const r=c.getBoundingClientRect();return r.left>=pinned.right-1&&r.right<=box.right+1;}).length,names:[...s.querySelectorAll('tbody th[scope=row]')].map(h=>h.querySelector('.skill-chart-name').textContent.trim()),legend:s.closest('[data-skill-guide]').querySelector('.skill-chart-legend')?.innerText||''};});assert(fit.levels>=(width<=320?8:10),`${fit.levels} level columns fit at ${width}px without swiping`);assert(fit.names.every(n=>n&&fit.legend.includes(n)),'every ability name stays readable on the phone chart');}assert.equal(await page.locator('[data-skill-guide] select, [data-skill-guide] .skill-answer').count(),0,'the chart alone carries the skill order; no hero-level picker');
  if(width<700){await page.locator('[data-start-live]').click();assert.equal(await page.evaluate(()=>S.route),'match');assert.equal(await page.evaluate(()=>S.me),'khaimera');assert.equal(await page.evaluate(()=>chosenPlan(S.locks.find(p=>p.slug===S.me)).manual),true);await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'selected');}
  // Match (2.36.0): your hero, then the enemies you can see; the team type and adapted build follow.
  await page.evaluate(()=>{S.locks=[{slug:'khaimera',role:'jungle'}];S.me='khaimera';S.enemies=[];S.bans=[];S.matchPicking='enemy';save();changeRoute('match');});
  assert.equal(await page.locator('[data-team-alternates]').count(),1,'with no enemies Match shows the team-type alternates');
  for(const s of ['steel','gideon','narbash'])await page.locator(`.match-hero[data-match-pick="${s}"]`).click();
  assert.equal(await page.locator('.match-chip').count(),3);assert.equal(await page.locator('.match-types').count(),1);
  assert((await page.locator('.match-build li').count())===6||(await page.locator('.match-result .note').count())===1,'an adapted six or a stated reason');
  await page.locator('.match-chip[data-match-pick="gideon"]').click();assert.equal(await page.locator('.match-chip').count(),2,'tapping an enemy again removes it');
  await page.locator('[data-match-new]').click();assert.equal(await page.locator('.match-chip').count(),0,'New match clears the enemy team');
  if(width>700){await page.evaluate(()=>{const p={slug:'khaimera',role:'jungle'};S.locks=[p];S.me=p.slug;S.enemies=[];S.bans=[];choosePlaystyle(p,0);companionPrefs.selectedBuilds['khaimera|jungle'].patch='older';changeRoute('match');});assert.match(await page.locator('#main').innerText(),/patch changed/i);await page.locator('#main [data-reset-playstyle]').click();assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'default');}
  await page.evaluate(()=>{delete companionPrefs.selectedBuilds['khaimera|jungle'];S.locks=[{slug:'khaimera',role:'jungle'}];S.me='khaimera';S.liveVariant=0;S.enemies=[];S.bans=[];save();changeRoute('match');});assert.match(await page.locator('#main').innerText(),/previous app needs to be chosen again/);
  await page.evaluate(()=>choosePlaystyle({slug:'muriel',role:'support'},0));assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'invalid');
  await page.locator('#main [data-reset-playstyle]').click();
  assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'default');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('predecessor-planner-v2')).liveVariant),null);
  for(const route of ['meta','hero','match','more','data']){
   await page.evaluate(r=>{if(r==='hero')openHero('khaimera','jungle');else changeRoute(r);},route);
   const layout=await page.evaluate(()=>({heads:document.querySelectorAll('#main h1').length,current:document.querySelectorAll('[aria-current="page"]').length,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.equal(layout.heads,1,route);assert.equal(layout.current,1,route);assert.equal(layout.overflow,false,JSON.stringify({width,theme,route}));report.checks.push({width,theme,route});
   await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});const axe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],JSON.stringify({width,theme,route}));
  }
  await page.evaluate(()=>openHero('khaimera','jungle'));await page.screenshot({path:`qa/simple-${width}-${theme}.png`,fullPage:true});
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync('qa/companion-simple-browser.json',JSON.stringify(report,null,2));}
 console.log(JSON.stringify({checks:report.checks.length,errors:report.errors}));
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exitCode=1;});
