'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH);
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
fs.mkdirSync(qa,{recursive:true});
const routes=['meta','builds','planner','draft','live','library','guidance','changes','data'];
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'msedge',headless:true}));
 const results=[];
 try{
  for(const mode of ['local','static','current']){
   const url=mode==='local'?(process.env.LOCAL_URL||'http://127.0.0.1:12933/'):(mode==='current'?(process.env.FAILURE_URL||'http://127.0.0.1:12932/current/'):(process.env.PREVIEW_URL||'http://127.0.0.1:12932/project/'));
   for(const viewport of [{width:1920,height:1080},{width:390,height:844}]){
    const context=await browser.newContext({viewport,acceptDownloads:true});
    const page=await context.newPage(),errors=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));
    const check=(ok,label)=>{assert(ok,mode+' '+viewport.width+': '+label);checks.push(label)};
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>B&&!latestStatus.busy);
    check(await page.locator('#theme-toggle').isVisible(),'theme toggle visible');
    const original=await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tiers:B.tier_list}));
    await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'},{slug:'gideon',role:'midlane'}];S.enemies=[{slug:'khaimera',role:'jungle'}];S.me='steel';S.size=5;save();});
    if(mode==='local')await page.waitForFunction(()=>!plannerSaveRunning);
    for(const theme of ['dark','light']){
     if(theme==='light') {await page.locator('#theme-toggle').focus();await page.keyboard.press('Enter');}
     check(await page.evaluate(t=>(document.documentElement.dataset.theme||'dark')===t,theme),theme+' keyboard switch');
     for(const route of routes){
      await page.locator('#navigation [data-route="'+route+'"]').click();
      check(await page.locator('#main h1').count()===1&&!(await page.locator('#main').innerText()).includes('could not render'),theme+' '+route+' renders');
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+' '+route+' no overflow');
     }
     await page.locator('#navigation [data-route="meta"]').click();
     await page.screenshot({path:path.join(qa,`${process.env.BROWSER_ENGINE||'edge'}-${mode}-${viewport.width}-${theme}.png`)});
     await page.locator('#hero-jump').fill('Steel');await page.locator('#hero-jump').press('Tab');
     check(await page.locator('#main h1').innerText()==='Steel','finder opens Steel');
     await page.locator('[data-hero-tab="builds"]').focus();await page.keyboard.press('Enter');
     check(await page.locator('.build-path').count()>0,theme+' build visible');
     if(!await page.locator('#main [data-catalog]:visible').count()){
      await page.locator('#main summary').filter({hasText:'Previous reviewed plan'}).click();
      check(mode==='current',theme+' withheld plan remains inspectable as history');
     }
     await page.locator('#main [data-catalog]:visible').first().click();
     check(await page.locator('#detail').isVisible(),theme+' item description accessible');
     await page.keyboard.press('Escape');
    }
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>B&&!latestStatus.busy);
    check(await page.evaluate(()=>document.documentElement.dataset.theme==='light'),'light restored');
    check(await page.evaluate(()=>S.locks.length===2&&S.enemies[0]?.role==='jungle'),'picks and enemy role restored');
    check(await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tiers:B.tier_list}))===original,'observations unchanged');
    if(mode==='current'){
     check((await page.locator('#source-notices').textContent()).includes('Source failure'),'current failure remains named');
     check((await page.locator('#patch-strip').textContent()).includes('Last verified patch'),'failed check labels the older verification');
     check(await page.evaluate(()=>E.plannedBuild('dekker','support').kind!=='reviewed'),'unverified current patch does not activate advice');
    }
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
    const snapshot=path.join(qa,`snapshot-${process.env.BROWSER_ENGINE||'edge'}-${mode}-${viewport.width}.html`);
    await download.saveAs(snapshot);
    const exported=await context.newPage();await exported.goto('file:///'+snapshot.replace(/\\/g,'/'),{waitUntil:'domcontentloaded'});await exported.waitForFunction(()=>B);
    check(await exported.evaluate(()=>APP_CONFIG.mode==='export'),'standalone export opens');
    const exportTheme=await exported.evaluate(()=>document.documentElement.dataset.theme||'dark');
    await exported.locator('#theme-toggle').click();
    check(await exported.evaluate(t=>(document.documentElement.dataset.theme||'dark')!==t,exportTheme),'standalone export theme works');
    check(await exported.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tiers:B.tier_list}))===original,'export observations unchanged');
    check(errors.length===0,'no JavaScript errors');
    results.push({mode,viewport,checks,errors});await context.close();
   }
  }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(qa,(process.env.BROWSER_ENGINE||'edge')+'-additional-acceptance.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(x=>({mode:x.mode,viewport:x.viewport,checks:x.checks.length}))));
})().catch(e=>{console.error(e);process.exitCode=1});

