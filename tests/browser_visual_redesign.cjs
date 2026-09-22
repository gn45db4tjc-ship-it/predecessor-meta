// User-facing journeys added by the 2.31 visual redesign. Uses the dated seed,
// not new collection. Missing images must not remove a hero's name or action.
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:13008/';let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(base).port,'--bind','127.0.0.1','--directory','qa/audit-site'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===50)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 }
 const engine=process.env.BROWSER_ENGINE||'edge',browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'}));
 const report={states:[],errors:[],physicalDevice:'Not run'};
 try{
  for(const theme of ['dark','light'])for(const viewport of [{width:320,height:844},{width:390,height:844},{width:640,height:360},{width:820,height:900},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});
   await context.addInitScript(t=>{localStorage.setItem('predecessor-theme',t);localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));},theme);
   await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>typeof B!=='undefined'&&B&&!latestStatus.busy);
   if(viewport.width<=700){
    // The visible call to action must itself be clickable, not decorative dead space.
    const cue=page.locator('#mobile-all-list .meta-card-cue').first();await cue.click();assert.equal(await page.evaluate(()=>S.route),'hero');
    await page.locator('[data-simple-section="alternatives"]').click();await page.locator('[data-choose-playstyle]').first().click();
    assert.equal(await page.locator('.simple-setup>div').count(),5);
    assert.equal(await page.locator('.simple-purchases>li').count(),6);
    const planned=await page.evaluate(()=>chosenPlan({slug:S.hero,role:S.heroRole}));
    const names=await page.locator('.simple-purchases>li>.item-button').allTextContents();assert.equal(names.length,planned.items.length);
    // Identity remains exactly the selected plan even though the layout changed.
    const keys=await page.locator('.simple-purchases>li>.item-button').evaluateAll(ns=>ns.map(n=>n.dataset.key));
    assert.deepEqual(keys,await page.evaluate(items=>items.map(n=>catalogKey('items',n)||n),planned.items));
    // WebKit does not focus a button on pointer tap. Exercise actual keyboard
    // opening before asserting keyboard focus returns on Escape.
    await page.locator('.simple-purchases>li>.item-button').first().focus();await page.keyboard.press('Enter');assert(await page.locator('#detail').evaluate(n=>n.open));await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#detail').open&&document.activeElement===document.querySelector('.simple-purchases>li>.item-button'));
    await page.locator('[data-start-live]').click();assert.equal(await page.evaluate(()=>S.route),'live');
    await page.locator('#main [data-edit-situation]').click();assert(await page.locator('#detail').evaluate(n=>n.open));await page.keyboard.press('Escape');
   }
   await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});
   for(const route of ['meta','hero','draft','more','data']){
    await page.evaluate(r=>r==='hero'?openHero('khaimera','jungle'):changeRoute(r),route);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${theme} ${viewport.width} ${route}: horizontal overflow`);
    const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
    assert.deepEqual(violations,[],`${theme} ${viewport.width} ${route}`);
    report.states.push({theme,viewport,route});
   }
   await context.close();
  }
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify({states:report.states.length,errors:report.errors}));
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync(`qa/visual-redesign-${engine}.json`,JSON.stringify(report,null,2));}
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exitCode=1;});
