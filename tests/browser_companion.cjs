'use strict';
// Phone journey: Meta search, hero opens on its build, favorite, Use in Match, enemies, New match and Undo, then the
// offline notice. Since 2.36.0 Match replaces Live (its inventory and situation editor are gone). START_PREVIEW=1 serves PREVIEW_DIR.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:12932/',report={checks:[],errors:[]};
const check=(v,label)=>{assert.ok(v,label);report.checks.push(label);};
const ready=p=>p.waitForFunction(()=>{if(!B||latestStatus.busy)return false;const r=S.route;S.route='hero';const gate=guideGate();S.route=r;return gate==='';},null,{timeout:60000});
let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(url).port,'--bind','127.0.0.1','--directory',process.env.PREVIEW_DIR||path.resolve(__dirname,'..','qa','audit-site')],{windowsHide:true,stdio:'ignore'});
  for(let attempt=0;;attempt++){try{if((await fetch(url)).ok)break;}catch{}if(attempt===50)throw Error('Preview did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true}));try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(()=>localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true})));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));const start=Date.now();await page.goto(url);await ready(page);report.readyMs=Date.now()-start;
 check(await page.locator('#main .mobile-card-list [data-hero]').count()>0,'phone Meta lists hero cards');
 await page.locator('#mobile-navigation [data-destination="more"]').click();check(await page.locator('#large-text').isVisible(),'More is reachable from the bottom bar');await page.locator('#mobile-navigation [data-route="meta"]').click();
 await page.locator('#mobile-hero-search').fill('Steel');await page.locator('#main [data-hero="steel"]').first().click();
 check(await page.evaluate(()=>S.route==='hero'&&S.hero==='steel'&&S.heroTab==='builds'),'a Meta card opens the hero on Build');check(await page.locator('#main .build-path').count()>0,'the phone hero leads with its build');
 await page.locator('#favorite-hero').click();check(await page.locator('#favorite-hero').getAttribute('aria-pressed')==='true','favorite is stored');
 await page.locator('[data-start-live]').click();check(await page.evaluate(()=>S.route==='match'&&S.me==='steel'),'Use in Match carries the hero into Match');
 await page.evaluate(()=>{S.matchPicking='enemy';render();});for(const s of ['gideon','narbash'])await page.locator(`.match-hero[data-match-pick="${s}"]`).click();check(await page.locator('.match-chip').count()===2,'enemies are picked in place');
 await page.locator('[data-match-new]').click();check(await page.locator('.match-chip').count()===0&&await page.evaluate(()=>S.me==='steel'),'New match clears the enemies and keeps your hero');
 await page.locator('#toast .toast-undo').click();check(await page.evaluate(()=>S.enemies.map(e=>e.slug).sort().join())==='gideon,narbash','Undo restores the enemy team');
 // 2.58.0: log the result once per match; the hero page shows your record; New match starts the next one.
 await page.locator('#match-log-win').click();check(/Logged as a win/.test(await page.locator('.match-log').innerText())&&await page.evaluate(()=>document.activeElement?.id==='match-log-undo'),'a logged win says so and focuses Undo');
 check(await page.evaluate(()=>companionPrefs.games.length===1&&companionPrefs.games[0].slug==='steel'&&companionPrefs.games[0].enemies.sort().join()==='gideon,narbash'),'the game keeps your hero and the enemies');
 await page.evaluate(()=>openHero('steel',S.locks[0].role));check(/Your games as \w+: 1 won, 0 lost/.test(await page.locator('#main .hero-record summary').innerText()),'the hero page shows your record');
 await page.locator('[data-start-live]').click();
 await page.reload();await ready(page);check(await page.evaluate(()=>S.me==='steel'&&S.enemies.length===2),'reload keeps the match picks');
 await context.setOffline(true);await page.waitForFunction(()=>!document.querySelector('#offline-status')?.hidden);check(/offline/i.test(await page.locator('#offline-status').innerText()),'offline notice is shown');await context.setOffline(false);
 check(report.errors.length===0,'no browser exceptions');await context.close();
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync('qa/companion-verification.json',JSON.stringify(report,null,2));}console.log(JSON.stringify(report));})().catch(e=>{if(preview)preview.kill();console.error(e);process.exit(1)});
