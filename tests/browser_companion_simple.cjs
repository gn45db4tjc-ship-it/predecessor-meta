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
  if(width<700)assert.deepEqual(await page.locator('#mobile-navigation button').allTextContents(),['Meta','Plan','More']);
  await page.evaluate(()=>openHero('khaimera','jungle'));
  if(width<700){assert.equal(await page.locator('.simple-hero-section').count(),1);await page.locator('[data-simple-section="alternatives"]').click();const chosen=page.locator('[data-choose-playstyle]').first();await chosen.click();assert.equal(await page.evaluate(()=>buildSelection({slug:S.hero,role:S.heroRole}).status),'selected');}
  await page.locator('[data-skill-guide] > summary').first().click();await page.locator('[data-skill-level-select]').first().selectOption('6');assert.match(await page.locator('.skill-answer').first().textContent(),/Level 6/);
  if(width<700){await page.locator('[data-start-live]').click();assert.equal(await page.evaluate(()=>S.route),'live');assert.equal(await page.evaluate(()=>chosenPlan(S.locks.find(p=>p.slug===S.me)).manual),true);await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'selected');}
  await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';save();changeRoute('draft');});await page.locator('[data-quick-refresh]').click();const names=await page.locator('[data-quick-preview]').allTextContents();assert(names.length>0&&names.length<=3);
  const slug=await page.locator('[data-quick-preview]').first().getAttribute('data-quick-preview');await page.evaluate(s=>{banHero(s);},slug);assert(await page.locator(`[data-quick-preview="${slug}"]`).isDisabled());assert.deepEqual(await page.locator('[data-quick-preview]').allTextContents(),names.map((t,i)=>i?'See pre-match setup':'Banned'));
  await page.locator('[data-quick-refresh]').click();await page.locator('[data-quick-preview]').first().click();assert.equal(await page.locator('.quick-setup').count(),1);
  await page.evaluate(()=>{window.beforeEvidenceChange=B.generated_at;B.generated_at='2030-01-01T00:00:00Z';render();});assert.equal(await page.locator('.quick-setup').count(),0);assert(await page.locator('[data-quick-preview]').first().isDisabled());
  await page.evaluate(()=>{B.generated_at=window.beforeEvidenceChange;render();});
  for(const route of ['meta','hero','draft','live','more','data']){
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
