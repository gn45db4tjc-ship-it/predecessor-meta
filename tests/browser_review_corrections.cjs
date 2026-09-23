// PR #61 regressions: redraw focus, grammar and native controls inside hero cards.
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:13042/';let preview;
const report={passed:[],failed:[]};
async function check(name,fn){try{await fn();report.passed.push(name);}catch(e){report.failed.push({name,error:e.message});}}
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(base).port,'--bind','127.0.0.1','--directory','qa/audit-site'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===50)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'}));
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>typeof B!=='undefined'&&B&&!latestStatus.busy);
  await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];changeRoute('draft');});
  await page.locator('[data-quick-refresh]').click();await page.locator('[data-quick-preview]').first().focus();await page.keyboard.press('Enter');
  await check('keyboard setup focus survives a data redraw',async()=>{
   assert(await page.locator('.quick-setup>h2').evaluate(n=>n===document.activeElement));
   await page.evaluate(()=>requestRedraw(true));
   assert(await page.locator('.quick-setup>h2').evaluate(n=>n===document.activeElement),'setup focus fell away after redraw');
   assert(await page.locator('.quick-setup>h2').evaluate(n=>n.matches(':focus-visible')));
   await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('.quick-setup')));
  });
  await check('redraw preserves another focused control without stealing focus',async()=>{
   await page.locator('#candidate-role').focus();await page.evaluate(()=>requestRedraw(true));
   assert.equal(await page.evaluate(()=>document.activeElement.id),'candidate-role');
  });
  await check('changing setup identity does not restore the previous heading focus',async()=>{
   await page.locator('.quick-setup>h2').focus();
   await page.evaluate(()=>{quickDraft.preview=quickDraft.rows.find(r=>r.p.slug!==quickDraft.preview).p.slug;requestRedraw(true);});
   assert(!(await page.locator('.quick-setup>h2').evaluate(n=>n===document.activeElement)));
  });
  await check('pointer selection does not draw a keyboard focus box',async()=>{
   await page.locator('[data-quick-preview]').first().click();
   assert.equal(await page.locator('.quick-setup>h2').evaluate(n=>getComputedStyle(n).outlineStyle),'none');
  });
  await check('favorite count uses singular and plural accurately',async()=>{
   const text=await page.evaluate(()=>[0,1,2].map(n=>savedHeroShortcuts([{slug:'khaimera',role:'jungle'},{slug:'steel',role:'support'}].slice(0,n),[{slug:'gideon',role:'midlane'}])));
   assert.match(text[0],/0 favorites/);assert.match(text[1],/1 favorite ·/);assert.doesNotMatch(text[1],/1 favorites/);assert.match(text[2],/2 favorites/);
  });
  for(const html of ['<a href="#native-control">Native link</a>','<button>Native button</button>','<input aria-label="Native input">','<select aria-label="Native select"><option>One</option></select>','<textarea aria-label="Native text"></textarea>','<details><summary>Native disclosure</summary>Detail</details>','<span role="menuitem" tabindex="0">Native menu</span>','<span role="button" tabindex="0">Custom control</span>','<span contenteditable="true">Editable text</span>']){
   await check('card preserves '+html.split('>')[0],async()=>{
    await page.evaluate(markup=>{changeRoute('meta');const row=document.querySelector('#mobile-all-list .mobile-hero-card');row.insertAdjacentHTML('beforeend','<div id="native-fixture">'+markup+'</div>');window.nativeActivated=false;document.querySelector('#native-fixture').addEventListener('click',e=>{window.nativeActivated=true;if(e.target.closest('a'))e.preventDefault();});},html);
    const target=page.locator('#native-fixture summary, #native-fixture>a, #native-fixture>button, #native-fixture>input, #native-fixture>select, #native-fixture>textarea, #native-fixture>span');
    await target.click();if(html.startsWith('<select'))await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>S.route),'meta','native descendant was hijacked into hero navigation');
    assert(await page.evaluate(()=>window.nativeActivated));
    if(html.startsWith('<details'))assert(await page.locator('#native-fixture details').evaluate(n=>n.open));
   });
  }
  await check('card whitespace and native hero keyboard both retain navigation history',async()=>{
   await page.evaluate(()=>changeRoute('meta'));
   const row=page.locator('#mobile-all-list .mobile-hero-card').first(),slug=await row.locator('[data-hero]').getAttribute('data-hero');
   await row.locator('.mobile-stat').click();assert.equal(await page.evaluate(()=>S.hero),slug);await page.waitForURL(u=>new URLSearchParams(u.hash.slice(1)).get('hero')===slug);
   await page.goBack();await page.waitForFunction(()=>S.route==='meta');
   await page.locator('#mobile-all-list [data-hero]').first().focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>S.hero),slug);
  });
  await context.close();
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync('qa/review-corrections-'+(process.env.BROWSER_ENGINE||'edge')+'.json',JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));assert.equal(report.failed.length,0,'review corrections failed');
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exitCode=1;});
