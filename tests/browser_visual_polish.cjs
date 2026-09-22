// Presentation regressions use real source records, including a missing-current-patch fixture.
// Run after stage_preview.py. No collection and no production writes.
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:12980/';let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(base).port,'--bind','127.0.0.1','--directory','qa/audit-site'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===50)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'}));
 const report={checks:[],errors:[],fontRequests:[],limitations:['No physical-device or screen-reader acceptance']};
 try{
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(t=>{localStorage.setItem('predecessor-theme',t);if(!localStorage.getItem('predecessor-companion-v1'))localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));},theme);
  // Missing remote images must leave legible names and stable cards.
  await context.route('**/*',route=>new URL(route.request().url()).origin!==new URL(base).origin?route.abort():route.continue());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/fonts\.(googleapis|gstatic)\.com/.test(r.url()))report.fontRequests.push(r.url());});
  await page.goto(base);await page.waitForFunction(()=>typeof B!=='undefined'&&!!B&&!latestStatus.busy);
  const original=await page.evaluate(()=>({patch:B.official?.live?.version,context:B.recommendation_context}));
  // Current recommendations are unavailable; old rates must remain marked and inspectable.
  await page.evaluate(()=>{B.official={...B.official,status:'verified',live:{...B.official.live,version:'99.1'}};delete B.recommendation_context;E=MetaEngine.create(B);S.role='midlane';changeRoute('meta');});
  if(width<700){
   assert.match(await page.locator('.meta-context > summary').innerText(),/Previous statistics.*not a current ranking/);
   assert.equal(await page.locator('.meta-context').evaluate(n=>n.open),false);
   const position=await page.locator('#mobile-all-list .mobile-hero-card').first().boundingBox();
   assert(position.y+position.height<788,'first hero must be fully visible above navigation at normal text size');
   const alignment=await page.evaluate(()=>{const a=document.querySelector('#mobile-hero-search').getBoundingClientRect(),b=document.querySelector('#mobile-meta-order').getBoundingClientRect();return Math.abs(a.y-b.y)<1&&Math.abs(a.height-b.height)<1;});assert(alignment,'search and order controls aligned');
   const numbers=await page.evaluate(()=>[...document.querySelectorAll('#mobile-all-list .mobile-stat:has(strong)')].map(n=>Math.abs(n.querySelector('strong').getBoundingClientRect().right-n.querySelector('small').getBoundingClientRect().right)));assert(numbers.length&&numbers.every(gap=>gap<1),'win rates and samples share a right edge even without a tier badge');
   await page.locator('.meta-context > summary').click();assert.match(await page.locator('#meta-order-status').innerText(),/100-game line is eligibility, not confidence/);
   const source=await page.evaluate(()=>date(E.displayPerformancePolicy().fetched_at));assert((await page.locator('#meta-order-status').innerText()).includes(source));
   await page.locator('.meta-context > summary').click();
   await page.locator('#mobile-hero-search').fill('Gideon');assert.equal(await page.locator('#mobile-all-list .mobile-hero-card').count(),1);
   assert.equal(await page.locator('#mobile-hero-search').evaluate(n=>n===document.activeElement),true);
   await page.locator('#mobile-hero-search').fill('');
  }
  // Restore the source and choose an actual variant so the complete loadout is exercised too.
  await page.evaluate(o=>{B.official.live.version=o.patch;if(o.context)B.recommendation_context=o.context;E=MetaEngine.create(B);openHero('khaimera','jungle');choosePlaystyle({slug:'khaimera',role:'jungle'},0);render();},original);
  await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});
  const screens=width<700?['hero','alternatives','pairings','kit','draft','more','meta']:['hero','draft','meta'];
  for(const route of screens){
   if(['alternatives','pairings','kit'].includes(route))await page.locator(`[data-simple-section="${route}"]`).click();
   else if(route==='hero')await page.evaluate(()=>openHero('khaimera','jungle'));
   else await page.evaluate(r=>changeRoute(r),route);
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,heads:document.querySelectorAll('#main h1').length,font:getComputedStyle(document.body).fontFamily,small:[...document.querySelectorAll('#main button,#main select,#main input:not([type=checkbox]),#main summary,#mobile-navigation button')].filter(n=>n.getClientRects().length&&!n.closest('details:not([open]) > :not(summary)')&&(n.getBoundingClientRect().height<43.5||n.getBoundingClientRect().width<43.5)).map(n=>n.textContent.slice(0,55))}));
   assert.equal(layout.overflow,false,`${width} ${theme} ${route}: overflow`);assert.equal(layout.heads,1);assert.match(layout.font,/system-ui/);
   if(width<700)assert.deepEqual(layout.small,[],`${width} ${theme} ${route}: small targets`);
   const issues=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
   assert.deepEqual(issues,[],`${width} ${theme} ${route}`);report.checks.push({width,theme,route});
  }
  if(width<700){
   await page.evaluate(()=>{companionPrefs.large=true;companionChrome();document.documentElement.style.setProperty('font-size','32px','important');});
   for(const route of ['meta','hero','draft']){await page.evaluate(r=>r==='hero'?openHero('khaimera','jungle'):changeRoute(r),route);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} ${route} 200% text`);report.checks.push({width,theme,route,textScale:'200%'});}
   await page.screenshot({path:`qa/polish-large-${width}-${theme}.png`});
   await page.evaluate(()=>{companionPrefs.large=false;companionChrome();document.documentElement.style.removeProperty('font-size');});
   await page.evaluate(()=>openHero('khaimera','jungle'));await page.locator('#favorite-hero').click();
   const favorite=await page.evaluate(()=>companionPrefs.favorites.includes('khaimera|jungle'));await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);
   assert.equal(await page.evaluate(()=>companionPrefs.favorites.includes('khaimera|jungle')),favorite);assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'selected');
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.fontRequests,[]);
 console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,fontRequests:report.fontRequests}));
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync('qa/visual-polish-'+(process.env.BROWSER_ENGINE||'edge')+'.json',JSON.stringify(report,null,2));}
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exitCode=1;});
