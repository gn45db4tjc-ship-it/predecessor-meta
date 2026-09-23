// Focus, saved shortcuts and roster density: public dated seed, no source collection.
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:13022/';let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(base).port,'--bind','127.0.0.1','--directory','qa/audit-site'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===50)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 }
 const engine=process.env.BROWSER_ENGINE||'edge',browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'}));
 const report={states:[],errors:[],physicalDevice:'Not run',screenReader:'Not run'};
 try{
  for(const width of [320,390,1440])for(const theme of ['dark','light']){
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.addInitScript(t=>{localStorage.setItem('predecessor-theme',t);localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));},theme);
   await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>typeof B!=='undefined'&&B&&!latestStatus.busy);
   if(width<700){
    const row=page.locator('#mobile-all-list .mobile-hero-card').first();
    assert.equal(await page.locator('#mobile-all-list .mobile-hero-card').count(),await page.evaluate(()=>roleListOrder(S.role).length),'complete roster survives');
    const box=await row.boundingBox();assert(box.height<=150,'compact normal-text roster row');
    const slug=await row.locator('[data-hero]').getAttribute('data-hero');
    // The stat side of the row is also a hero target, not just its small name.
    await row.click({position:{x:box.width-12,y:box.height/2}});
    await page.waitForFunction(s=>S.route==='hero'&&S.hero===s,slug);
    await page.evaluate(()=>openHero('khaimera','jungle'));await page.locator('#favorite-hero').click();await page.evaluate(()=>changeRoute('meta'));
    assert(await page.locator('.saved-heroes').count());
    const order=await page.evaluate(()=>document.querySelector('.saved-heroes').compareDocumentPosition(document.querySelector('#mobile-all-list'))&Node.DOCUMENT_POSITION_FOLLOWING);assert(order,'saved heroes precede roster');
    await page.locator('.saved-heroes>summary').click();
    assert.equal(await page.locator('.saved-heroes [data-hero="khaimera"]').count(),1,'favorite deduplicated from recent');
    await page.locator('.saved-heroes [data-favorite="khaimera|jungle"]').click();
    assert.equal(await page.evaluate(()=>S.route),'meta','remove does not accidentally navigate');
    assert.equal(await page.evaluate(()=>companionPrefs.favorites.includes('khaimera|jungle')),false);
    await page.locator('.saved-heroes [data-hero="khaimera"]').click();assert.equal(await page.evaluate(()=>S.hero),'khaimera');
    await page.locator('[data-simple-section="alternatives"]').click();await page.locator('[data-choose-playstyle]').first().click();
    const expected=await page.evaluate(()=>chosenPlan({slug:S.hero,role:S.heroRole}));
    assert.equal(await page.locator('.simple-setup>div').count(),5);assert.equal(await page.locator('.simple-purchases>li').count(),6);
    assert.deepEqual(await page.locator('.simple-purchases>li>.item-button').evaluateAll(ns=>ns.map(n=>n.dataset.key)),await page.evaluate(items=>items.map(n=>catalogKey('items',n)||n),expected.items));
    await page.screenshot({path:`qa/product-build-${width}-${theme}.png`,fullPage:true});
    await page.evaluate(()=>{companionPrefs.homeQuery='';changeRoute('meta');});await page.screenshot({path:`qa/product-meta-${width}-${theme}.png`,fullPage:true});
   }
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';save();changeRoute('draft');});
   await page.locator('[data-quick-refresh]').click();assert((await page.locator('[data-quick-preview]').count())<=3);
   const candidate=page.locator('[data-quick-preview]').first();await candidate.focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.quick-setup>h2')),true,'setup receives keyboard focus');
   assert.equal(await page.locator('[data-quick-preview][aria-pressed="true"]').count(),1);
   const visible=await page.locator('.quick-setup>h2').boundingBox();assert(visible.y>=0&&visible.y<844,'focused heading on screen');
   assert(await page.locator('.quick-setup>h2').evaluate(n=>{const b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return hit===n||n.contains(hit);}), 'focused setup heading is not covered by sticky lineup');
   await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('.quick-setup')),'next Tab stays in setup');
   await page.screenshot({path:`qa/product-draft-${width}-${theme}.png`,fullPage:true});
   await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});
   assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))),[]);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   report.states.push({width,theme});await context.close();
  }
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync(`qa/product-review-${engine}.json`,JSON.stringify(report,null,2));}
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exitCode=1;});
