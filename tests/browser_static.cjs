'use strict';
const {goToScreen,legacyScreenClick}=require('./navigation_helpers.cjs');
// Browser acceptance against a local static preview. Source observations are never modified.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),http=require('node:http');
const root=path.resolve(__dirname,'..'),reportDir=path.join(root,'qa'),url=process.env.PREVIEW_URL||'http://127.0.0.1:12926/';
const previous=process.env.BASELINE_TESTS||path.join(__dirname,'legacy');
let previewServer,outageServer;
const stopOutageServer=()=>{if(outageServer?.listening){outageServer.close();outageServer.closeAllConnections();}};
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  previewServer=spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(url).port||'12926','--bind','127.0.0.1','--directory',process.env.PREVIEW_DIR||path.join(root,'qa','site')],{windowsHide:true,stdio:'ignore'});
  const deadline=Date.now()+10000;
  for(;;){try{const response=await fetch(url);if(response.ok)break;}catch{}if(Date.now()>deadline)throw Error('Preview server did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const useWebkit=process.env.BROWSER_ENGINE==='webkit';
 const browser=await (useWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'}));
 const newContext=browser.newContext.bind(browser);browser.newContext=async (...args)=>{const c=await newContext(...args);await c.addInitScript(()=>{localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true,fullDetails:true}));});return c;};
 const report={engine:useWebkit?'Playwright WebKit on Windows (not native Apple Safari)':'Microsoft Edge on Windows',version:browser.version(),runs:[]};
 try{
  // Installed app offline: serve the preview through a private pass-through server, let the service worker take
  // control, then stop that server (a real outage). context.setOffline is not used: Playwright's WebKit blocks the
  // navigation before the service worker sees it, although WebKit serves it from the worker in a real outage.
  outageServer=http.createServer(async(req,res)=>{
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   try{const r=await fetch(new URL(req.url.replace(/^\/+/,''),url));const headers={'content-type':r.headers.get('content-type')||'application/octet-stream'};
    if(r.headers.get('last-modified'))headers['last-modified']=r.headers.get('last-modified');res.writeHead(r.status,headers);res.end(Buffer.from(await r.arrayBuffer()));}
   catch{res.writeHead(502);res.end();}
  });
  await new Promise(resolve=>outageServer.listen(0,'127.0.0.1',resolve));const installURL='http://127.0.0.1:'+outageServer.address().port+'/';
  const pwaContext=await browser.newContext({viewport:{width:1280,height:800}}),pwaPage=await pwaContext.newPage();
  await pwaPage.goto(installURL,{waitUntil:'domcontentloaded'});await pwaPage.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:45000});
  await pwaPage.evaluate(()=>navigator.serviceWorker.ready);await pwaPage.reload({waitUntil:'domcontentloaded'});await pwaPage.waitForFunction(()=>!!B&&!latestStatus.busy&&!!navigator.serviceWorker.controller,{timeout:45000});
  const cachedAt=await pwaPage.evaluate(()=>{window.beforeOutage=true;return B.generated_at;});
  stopOutageServer();
  assert(await fetch(installURL).then(()=>false,()=>true),'the preview is really unreachable');
  await pwaPage.reload({waitUntil:'domcontentloaded'});await pwaPage.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:45000});
  // A failed navigation would leave the old document in place; require a newly opened one.
  assert(await pwaPage.evaluate(()=>!window.beforeOutage),'offline reload opens a new document from the service worker');
  assert.equal(await pwaPage.evaluate(()=>B.generated_at),cachedAt,'installed app reopens its dated cached bundle offline');
  await pwaContext.close();report.installable={serviceWorker:true,offlineBundle:true,outage:'preview server stopped'};
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage();
   const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
   const started=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:45000});
   const run={viewport,readyMs:Date.now()-started,checks:[],errors};const check=(value,label)=>{assert(value,label);run.checks.push(label);};
   // At 700px and below the app renders its phone presentation: the sidebar actions (install, share, export) move under More.
   const phone=viewport.width<=700,openMore=async()=>{if(phone)await page.locator('#menu-toggle').click();};
   check(await page.evaluate(()=>APP_CONFIG.mode==='static'),'static mode');
   if(phone){await openMore();check(await page.locator('#companion-install').isVisible(),'install and offline help under More on the phone');}
   else check(await page.locator('#install-app').isVisible(),'install app control');
   check(await page.evaluate(()=>document.querySelector('link[rel="manifest"]')?.getAttribute('href')==='app.webmanifest'),'web app manifest linked');
   const appManifest=await (await page.request.get(new URL('app.webmanifest',url).href)).json();
   check(appManifest.display==='standalone'&&appManifest.icons.some(i=>i.sizes==='192x192')&&appManifest.icons.some(i=>i.sizes==='512x512'),'install manifest metadata');
   check(await page.locator('#refresh').textContent()==='Reload latest data','refresh wording');
   check(await page.locator('#quit').isHidden(),'no owner quit');
   const baseline=await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tier:B.tier_list}));
   for(const route of ['meta','builds','planner','draft','live','library','guidance','changes','data']){
    await goToScreen(page,route);
    check(await page.locator('#main h1').count()===1,'route '+route);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+route);
   }
   await page.locator('#compare-bracket').selectOption('gold');await page.waitForSelector('#comparison-output table');
   check((await page.locator('#comparison-output').textContent()).includes('gold'),'separate published comparison');
   // Browsers cap address updates and then throw (WebKit: SecurityError past 100 per 10 seconds). Simulate that cap in
   // every engine across the three callers (route, hero, hero tab): the view must still change, with no uncaught error
   // and no error toast. Handlers can be async, so count unhandled rejections too and keep the cap until they settle.
   const historyLimit=await page.evaluate(async()=>{
    let uncaught=0;const onError=()=>uncaught++,settle=()=>new Promise(r=>setTimeout(r,100)),P=History.prototype,saved=[P.pushState,P.replaceState];
    const deny=()=>{throw new DOMException('Attempt to use history.pushState() more than 100 times per 10 seconds','SecurityError');};
    const toastText=()=>document.querySelector('#toast')?.textContent||'',toastBefore=toastText(),seen=[];
    addEventListener('error',onError);addEventListener('unhandledrejection',onError);P.pushState=deny;P.replaceState=deny;
    try{
     document.querySelector('[data-route="meta"]').click();await settle();seen.push(S.route);
     document.querySelector('.meta-table [data-hero], .mobile-hero-card [data-hero]').click();await settle();seen.push(S.route);
     document.querySelector('[data-hero-tab="kit"]').click();await settle();seen.push(S.heroTab);
     document.querySelector('[data-route="data"]').click();await settle();seen.push(S.route);
    }finally{[P.pushState,P.replaceState]=saved;removeEventListener('error',onError);removeEventListener('unhandledrejection',onError);}
    const toast=toastText();return {uncaught,seen,historyToast:toast!==toastBefore&&/history/i.test(toast)};
   });
   const historyOk=historyLimit.uncaught===0&&!historyLimit.historyToast&&historyLimit.seen.join()==='meta,hero,kit,data';
   check(historyOk,'navigation survives the browser history rate limit'+(historyOk?'':': '+JSON.stringify(historyLimit)));
   if(previous&&phone){
    // The legacy suites drive desktop controls (role tabs, the sortable table, lineup slots). At 700px and below the app
    // renders its phone presentation instead, which tests/browser_companion.cjs covers. Record the skip; do not count it.
    run.skipped=['seven legacy desktop-control suites: the phone presentation is covered by tests/browser_companion.cjs'];
   }else if(previous){
    for(const suite of ['meta','strategy','live','augment','correction','sequences','synthesis']){
     // Adapt storage mode and the retired flat navigation, retaining all content assertions.
     const code=fs.readFileSync(path.join(previous,'browser_'+suite+'_acceptance.js'),'utf8').replace("if(APP_CONFIG.mode==='shared')", "if(APP_CONFIG.mode==='shared'||APP_CONFIG.mode==='static')")
      .replace('const click=s=>{',`const click=s=>{if((${legacyScreenClick.toString()})(s))return;`)
      .replace("[...document.querySelectorAll('#navigation [data-route]')].map(e=>e.dataset.route)",JSON.stringify(['meta','builds','planner','draft','live','library','guidance','changes','data']));
     const result=await page.evaluate(code);
     // A suite whose premise does not hold for this publication (for example a review dated for an earlier
     // patch) returns a named skip. Run this file on both the committed seed and a current publication.
     if(result.skipped?.length)(run.skipped||=[]).push(...result.skipped.map(s=>suite+': '+s));
     run.checks.push('existing '+suite+': '+(result.passed??result.checks)+' assertions');
    }
   }
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'},{slug:'gideon',role:'midlane'}];S.enemies=[];S.bans=[];save();S.route='planner';render();});
   await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>S.locks.length===2&&S.locks[0].slug==='steel'),'refresh preserves picks');
   check(await page.evaluate(()=>JSON.stringify({at:B.generated_at,pairs:B.pairs,tier:B.tier_list}))===baseline,'refresh preserves original observations and date');
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!B&&!latestStatus.busy);
   check(await page.evaluate(()=>S.locks.length===2&&S.locks[0].role==='jungle'),'draft restored after reload');
   await openMore();await page.locator('#share-plan:visible').click();const planLink=await page.locator('#plan-link').inputValue();
   check(new URL(planLink).pathname===new URL(url).pathname,'shared plan preserves repository URL prefix');
   const packet=await page.evaluate(()=>MetaEngine.decodePlan(new URL(document.querySelector('#plan-link').value).hash));
   check(!Object.hasOwn(packet,'liveContexts'),'shared plan excludes inventory');await page.locator('#close-detail').click();
   const visitor=await browser.newContext({viewport}),visitorPage=await visitor.newPage();
   await visitorPage.goto(planLink,{waitUntil:'domcontentloaded'});await visitorPage.waitForSelector('#use-shared-plan');
   check(await visitorPage.evaluate(()=>S.locks.length===0),'another visitor previews without replacing draft');
   await visitorPage.locator('#use-shared-plan').click();
   check(await visitorPage.evaluate(()=>S.locks.length===2&&S.locks[0].slug==='steel'),'another visitor can import shared picks');await visitor.close();
   await openMore();const downloadPromise=page.waitForEvent('download');await page.locator('#export:visible').click();const download=await downloadPromise;
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
    // 2.27.0: the page loads the compact core first, so the core gets the same wrong checksum.
    if(manifest.cohorts.gold.projection)manifest.cohorts.gold.projection.core={...manifest.cohorts.gold.projection.core,sha256:'a'.repeat(64),url:'bundles/gold-core-'+('a'.repeat(64))+'.json'};
    await route.fulfill({response,json:manifest});
   });
   // Take the real gold bundle from the preview under test: the staged folder is not always qa/site (six brackets stage to qa/six-site).
   const realManifest=await (await page.request.get(new URL('manifest.json',url).href)).json();
   const realGold=await (await page.request.get(new URL(realManifest.cohorts.gold.url,url).href)).body();
   await page.route('**/bundles/gold-'+('a'.repeat(64))+'.json',route=>route.fulfill({contentType:'application/json',body:realGold}));
   const realCore=realManifest.cohorts.gold.projection?await (await page.request.get(new URL(realManifest.cohorts.gold.projection.core.url,url).href)).body():realGold;
   await page.route('**/bundles/gold-core-'+('a'.repeat(64))+'.json',route=>route.fulfill({contentType:'application/json',body:realCore}));
   await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>!!B&&latestStatus.errors[0].detail.includes('checksum')),'checksum mismatch preserves previous data');
   if(realManifest.cohorts.gold.projection){
    // The same for the full bundle, which is loaded when the core cannot be (and by export and older saved copies).
    await page.unroute('**/bundles/gold-core-'+('a'.repeat(64))+'.json');await page.route('**/bundles/gold-core-'+('a'.repeat(64))+'.json',route=>route.fulfill({status:404,body:'Not found'}));
    await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
    check(await page.evaluate(()=>!!B&&latestStatus.errors[0].detail.includes('checksum')),'full-bundle checksum mismatch preserves previous data');
   }
   await page.unroute('**/manifest.json');await page.unroute('**/bundles/gold-'+('a'.repeat(64))+'.json');await page.unroute('**/bundles/gold-core-'+('a'.repeat(64))+'.json');
   await page.route('**/manifest.json',async route=>{
    const response=await route.fetch(),manifest=await response.json();manifest.patch_check.signature='changed-by-acceptance-test';manifest.patch_check.version='99.0-test';
    await route.fulfill({response,json:manifest});
   });
   await page.locator('#refresh').click();await page.waitForFunction(()=>!latestStatus.busy);
   check(await page.evaluate(()=>B.guidance.status.startsWith('needs review')),'new patch suppresses current-guidance claim');
   check((await page.locator('#patch-strip .patch-cell').first().textContent()).includes('99.0-test'),'latest official patch is separate from the retained statistical patch');
   check((await page.locator('#source-notices').textContent()).includes('Official patch content changed'),'new patch warning visible');
   // 2.28.0: it is a material notice, visible without opening Status details.
   check((await page.locator('#material-notices').innerText()).includes('Official patch content changed'),'new patch warning is shown without opening status details');
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
  console.log(JSON.stringify({engine:report.engine,runs:report.runs.map(r=>({viewport:r.viewport,readyMs:r.readyMs,checks:r.checks.length,...(r.skipped?{skipped:r.skipped}:{})}))}));
 }finally{stopOutageServer();await browser.close();previewServer?.kill();}
})().catch(error=>{stopOutageServer();previewServer?.kill();console.error(error);process.exitCode=1;});
