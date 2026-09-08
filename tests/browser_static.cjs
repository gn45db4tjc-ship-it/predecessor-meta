'use strict';
// Browser acceptance against a local static preview. Source observations are never modified.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),reportDir=path.join(root,'qa'),url=process.env.PREVIEW_URL||'http://127.0.0.1:12926/';
const previewPath=path.join(root,'qa','site',decodeURIComponent(new URL(url).pathname.replace(/^\/+|\/+$/g,'')));
const previous=process.env.BASELINE_TESTS||path.join(__dirname,'legacy');
let previewServer;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  previewServer=spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(url).port||'12926','--bind','127.0.0.1','--directory',path.join(root,'qa','site')],{windowsHide:true,stdio:'ignore'});
  const deadline=Date.now()+10000;
  for(;;){try{const response=await fetch(url);if(response.ok)break;}catch{}if(Date.now()>deadline)throw Error('Preview server did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const useWebkit=process.env.BROWSER_ENGINE==='webkit';
 const browser=await (useWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'msedge'}));
 const report={engine:useWebkit?'Playwright WebKit on Windows (not native Apple Safari)':'Microsoft Edge on Windows',version:browser.version(),runs:[]};
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage();
   const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
   const started=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:45000});
   const run={viewport,readyMs:Date.now()-started,checks:[],errors};const check=(value,label)=>{assert(value,label);run.checks.push(label);};
   check(await page.evaluate(()=>APP_CONFIG.mode==='static'),'static mode');
   check(await page.locator('#refresh').textContent()==='Check updates','refresh wording');
   check(await page.locator('#quit').isHidden(),'no owner quit');
   const baseline=await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tier:B.tier_list}));
   for(const route of ['meta','builds','planner','draft','live','library','guidance','changes','data']){
    await page.evaluate(r=>document.querySelector('[data-route="'+r+'"]').click(),route);
    check(await page.locator('#main h1').count()===1,'route '+route);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+route);
   }
   await page.locator('#compare-bracket').selectOption('gold');await page.waitForSelector('#comparison-output table');
   check((await page.locator('#comparison-output').textContent()).includes('gold'),'separate published comparison');
   if(previous){
    for(const suite of ['meta','strategy','live','augment','correction','sequences','synthesis']){
     // Static and shared modes both keep planner state in localStorage. Adapt only that test boundary.
     const code=fs.readFileSync(path.join(previous,'browser_'+suite+'_acceptance.js'),'utf8').replace("if(APP_CONFIG.mode==='shared')", "if(APP_CONFIG.mode==='shared'||APP_CONFIG.mode==='static')");
     const result=await page.evaluate(code);
     run.checks.push('existing '+suite+': '+(result.passed??result.checks)+' assertions');
    }
   }
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'},{slug:'gideon',role:'midlane'}];S.enemies=[];S.bans=[];save();S.route='planner';render();});
   await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>S.locks.length===2&&S.locks[0].slug==='steel'),'refresh preserves picks');
   check(await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tier:B.tier_list}))===baseline,'refresh preserves original observations and date');
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!B&&!latestStatus.busy);
   check(await page.evaluate(()=>S.locks.length===2&&S.locks[0].role==='jungle'),'draft restored after reload');
   await page.locator('#share-plan').click();const planLink=await page.locator('#plan-link').inputValue();
   check(new URL(planLink).pathname===new URL(url).pathname,'shared plan preserves repository URL prefix');
   const packet=await page.evaluate(()=>MetaEngine.decodePlan(new URL(document.querySelector('#plan-link').value).hash));
   check(!Object.hasOwn(packet,'liveContexts'),'shared plan excludes inventory');await page.locator('#close-detail').click();
   const visitor=await browser.newContext({viewport}),visitorPage=await visitor.newPage();
   await visitorPage.goto(planLink,{waitUntil:'domcontentloaded'});await visitorPage.waitForSelector('#use-shared-plan');
   check(await visitorPage.evaluate(()=>S.locks.length===0),'another visitor previews without replacing draft');
   await visitorPage.locator('#use-shared-plan').click();
   check(await visitorPage.evaluate(()=>S.locks.length===2&&S.locks[0].slug==='steel'),'another visitor can import shared picks');await visitor.close();
   const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
   const exported=path.join(reportDir,(useWebkit?'webkit':'edge')+'-'+viewport.width+'-snapshot.html');await download.saveAs(exported);
   check(/<main id="main" tabindex="-1"><\/main>/.test(fs.readFileSync(exported,'utf8')),'export does not serialize visitor draft into page markup');
   const snapshot=await context.newPage();await snapshot.goto('file:///'+exported.replace(/\\/g,'/'));
   check(await snapshot.evaluate(()=>APP_CONFIG.mode==='export'&&!!B),'standalone export opens');
   check(await snapshot.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tier:B.tier_list}))===baseline,'export retains exact observations');await snapshot.close();
   await page.route('**/manifest.json',route=>route.abort());await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>!!B&&latestStatus.errors[0].source==='Shared website'),'offline check keeps loaded data and names failure');
   await page.unroute('**/manifest.json');
   // Exercise an unavailable cohort even after all real rank bundles are published.
   await page.route('**/manifest.json',async route=>{
    const response=await route.fetch(),manifest=await response.json();manifest.cohorts.diamond={label:'Diamond+',status:'unavailable'};
    await route.fulfill({response,json:manifest});
   });
   await page.locator('#bracket').selectOption('diamond');await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>B===null),'unpublished cohort has no substituted data');
   check((await page.locator('#main').textContent()).includes('No successful diamond publication'),'unavailable cohort is visible');
   await page.unroute('**/manifest.json');
   await page.locator('#bracket').selectOption('gold');await page.waitForFunction(()=>!!B&&!latestStatus.busy);
   check(await page.evaluate(()=>B.bracket.segment==='gold'&&S.locks.length===2),'return to gold keeps draft');
   await page.route('**/manifest.json',async route=>{
    const response=await route.fetch(),manifest=await response.json();manifest.cohorts.gold.sha256='a'.repeat(64);manifest.cohorts.gold.url='bundles/gold-'+('a'.repeat(64))+'.json';
    await route.fulfill({response,json:manifest});
   });
   const realManifest=JSON.parse(fs.readFileSync(path.join(previewPath,'manifest.json'),'utf8'));
   await page.route('**/bundles/gold-'+('a'.repeat(64))+'.json',route=>route.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(previewPath,realManifest.cohorts.gold.url))}));
   await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>!!B&&latestStatus.errors[0].detail.includes('checksum')),'checksum mismatch preserves previous data');
   await page.unroute('**/manifest.json');await page.unroute('**/bundles/gold-'+('a'.repeat(64))+'.json');
   await page.route('**/manifest.json',async route=>{
    const response=await route.fetch(),manifest=await response.json();manifest.patch_check.signature='changed-by-acceptance-test';manifest.patch_check.version='99.0-test';
    await route.fulfill({response,json:manifest});
   });
   await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>B.guidance.status.startsWith('needs review')),'new patch suppresses current-guidance claim');
   check((await page.locator('#patch-strip .patch-cell').first().textContent()).includes('99.0-test'),'latest official patch is separate from the retained statistical patch');
   check((await page.locator('#source-notices').textContent()).includes('Official patch content changed'),'new patch warning visible');
   check(await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tier:B.tier_list}))===baseline,'patch overlay does not rewrite statistics');
   await page.unroute('**/manifest.json');await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   await page.evaluate(()=>{S.route='meta';render();window.scrollTo(0,0);});
   await page.screenshot({path:path.join(reportDir,(useWebkit?'webkit':'edge')+'-'+viewport.width+'-static.png'),fullPage:false});
   check(requests.filter(r=>r.method!=='GET').length===0,'browser sends no mutations or scraping requests');
   check(requests.filter(r=>r.url.startsWith(url)&&r.url.includes('/api/')).length===0,'no Python server routes needed');
   check(errors.length===0,'no page JavaScript errors');
   report.runs.push(run);await context.close();
  }
  fs.writeFileSync(path.join(reportDir,(useWebkit?'webkit':'edge')+'-static-acceptance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({engine:report.engine,runs:report.runs.map(r=>({viewport:r.viewport,readyMs:r.readyMs,checks:r.checks.length}))}));
 }finally{await browser.close();previewServer?.kill();}
})().catch(error=>{previewServer?.kill();console.error(error);process.exitCode=1;});
