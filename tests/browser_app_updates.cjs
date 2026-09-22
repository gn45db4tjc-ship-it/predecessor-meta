/* Real service-worker release lifecycle, no user browser profile or network sources. */
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),port=Number(process.env.UPDATE_PORT||12994),origin=`http://127.0.0.1:${port}/`;
const current=path.join(root,'qa/update-current'),next=path.join(root,'qa/update-next');
const net={folder:current,down:false,portal:false,noVersion:false},report={checks:[],errors:[]};
const server=http.createServer((req,res)=>{
 if(net.down){req.socket.destroy();return;}
 const name=new URL(req.url,origin).pathname.slice(1)||'index.html',file=path.resolve(net.folder,name);
 if(!file.startsWith(net.folder+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 let body=fs.readFileSync(file);if(name==='index.html'&&net.portal)body=Buffer.from('<html><body>Login to this network</body></html>');
 if(name==='manifest.json'&&net.noVersion){const m=JSON.parse(body);delete m.app;body=Buffer.from(JSON.stringify(m));}
 res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript':name.endsWith('.png')?'image/png':'application/json','Cache-Control':'no-store'});res.end(body);
});
const ready=p=>p.waitForFunction(()=>typeof B!=='undefined'&&!!B&&!latestStatus.busy,null,{timeout:90000});
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('condition timed out');};
const check=(name)=>{report.checks.push(name);console.log('PASS '+name);};
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  // Separate renderer invocations, not a string-relabelled copy of a previously loaded document.
  const script="from pathlib import Path; from unittest.mock import patch; import sys; sys.path.insert(0,'tests'); import stage_preview as p; r=Path.cwd(); p.stage(r/'qa/update-current',r/'qa/update-current-state'); old=p.publication.base.VERSION; parts=old.split('.'); parts[-1]=str(int(parts[-1])+1); new='.'.join(parts);\nwith patch.object(p.publication.base,'VERSION',new): p.stage(r/'qa/update-next',r/'qa/update-next-state')\ns=r/'qa/update-next/sw.js'; s.write_bytes(s.read_bytes().replace(('shell-v'+old.replace('.','-')).encode(),('shell-v'+new.replace('.','-')).encode()))";
  const staged=spawnSync(process.env.PYTHON_EXE||'python',['-B','-c',script],{cwd:root,encoding:'utf8'});assert.equal(staged.status,0,staged.stderr);
 }
 const currentVersion=JSON.parse(fs.readFileSync(path.join(current,'manifest.json'))).app.version,nextVersion=JSON.parse(fs.readFileSync(path.join(next,'manifest.json'))).app.version;
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'}));
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow',reducedMotion:'reduce'}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push({message:e.message,stack:e.stack,after:report.checks.at(-1)}));
 await page.goto(origin);await ready(page);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.evaluate(()=>{S.locks=[{slug:'khaimera',role:'jungle'}];S.enemies=[{slug:'gideon',role:'midlane'}];S.bans=['steel'];S.me='khaimera';S.liveContexts={'khaimera|jungle':{owned:['mutilator'],state:'ahead'}};companionPrefs.favorites=['khaimera|jungle'];save();saveCompanionPrefs();localStorage.setItem('predecessor-theme','light');changeRoute('more');});
 assert((await page.locator('[data-app-state]').last().innerText()).includes('latest app · v'+currentVersion));check('current app version visible in More');
 const before=await page.evaluate(()=>({draft:localStorage.getItem('predecessor-planner-v2'),prefs:localStorage.getItem(prefsKey),match:sessionStorage.getItem(matchKey),dates:B.generated_at}));
 net.folder=next;
 // A resumed home-screen app checks without forcing navigation or disturbing an open screen.
 await page.evaluate(()=>{Date.now=(()=>{const original=Date.now;return ()=>original()+301000;})();window.dispatchEvent(new Event('focus'));});
 await page.waitForFunction(version=>document.querySelector('#app-update-notice')?.textContent.includes(version)&&!document.querySelector('#app-update-notice')?.classList.contains('hide'),nextVersion);
 assert.equal(await page.evaluate(()=>APP_CONFIG.tool_version),currentVersion);assert.equal(await page.evaluate(()=>S.route),'more');check('foreground check finds new interface without reloading active draft');
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 for(const width of [320,390])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:844});await page.evaluate(async t=>{document.documentElement.dataset.theme=t;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));},theme);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert((await page.locator('#app-update-notice [data-app-apply]').boundingBox()).height>=44);
  const issues=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(issues,[]);
 }
 await page.evaluate(()=>document.documentElement.style.setProperty('font-size','32px'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));check('update controls fit both phone widths and themes, including enlarged text and accessibility checks');
 await page.evaluate(()=>openHero('khaimera','jungle'));
 await page.locator('[data-simple-section="alternatives"]').click();await page.locator('[data-choose-playstyle]').first().click();
 check('hero evidence remains usable while update awaits the user');
 const savedCaches=await page.evaluate(async()=>{const c=await caches.open('predecessor-meta-data-v1');return (await c.keys()).map(r=>r.url).sort();});
 net.down=true;await page.locator('#app-update-notice [data-app-apply]').click();await page.waitForFunction(()=>document.querySelector('#app-update-notice').textContent.includes('could not be opened safely'));
 assert.equal(await page.evaluate(()=>APP_CONFIG.tool_version),currentVersion);assert.equal(await page.evaluate(()=>S.me),'khaimera');check('real network outage refuses update and preserves current screen');
 net.down=false;net.portal=true;await page.locator('#app-update-notice [data-app-apply]').click();await page.waitForFunction(()=>!document.querySelector('#app-update-notice [data-app-apply]').disabled);assert.equal(await page.evaluate(()=>APP_CONFIG.tool_version),currentVersion);check('captive-portal document cannot masquerade as the update');net.portal=false;
 await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError');};});
 // Force an unsaved choice: existing matching storage alone must not make a lossy reload appear safe.
 await page.evaluate(()=>S.bans.push('muriel'));await page.locator('#app-update-notice [data-app-apply]').click();await page.waitForFunction(()=>!document.querySelector('#app-update-notice [data-app-apply]').disabled);assert.equal(await page.evaluate(()=>APP_CONFIG.tool_version),currentVersion);await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet;S.bans=S.bans.filter(x=>x!=='muriel');});check('unsaved selections prevent a reload when storage is blocked');
 await Promise.all([page.waitForURL('**app_update=*'),page.locator('#app-update-notice [data-app-apply]').click()]);await ready(page);
 assert.equal(await page.evaluate(()=>APP_CONFIG.tool_version),nextVersion);
 assert.equal(await page.evaluate(()=>S.hero),'khaimera');assert.equal(await page.evaluate(()=>S.route),'hero');
 assert.equal(await page.evaluate(()=>localStorage.getItem('predecessor-planner-v2')),before.draft);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem(matchKey)),before.match);assert.equal(await page.evaluate(()=>B.generated_at),before.dates);
 assert.equal(await page.evaluate(()=>localStorage.getItem('predecessor-theme')),'light');assert(await page.evaluate(()=>companionPrefs.favorites.includes('khaimera|jungle')));
 assert.equal(await page.evaluate(()=>buildSelection({slug:'khaimera',role:'jungle'}).status),'selected');
 assert((await page.evaluate(async()=>{const c=await caches.open('predecessor-meta-data-v1');return (await c.keys()).map(r=>r.url);})).length>=savedCaches.length);check('explicit update loads new shell and preserves route, picks, inventory, theme, favorites and data dates');
 await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});await wait(()=>page.evaluate(async version=>(await caches.keys()).includes('predecessor-meta-shell-v'+version.replaceAll('.','-')),nextVersion));
 net.down=true;await page.reload();await ready(page);assert.equal(await page.evaluate(()=>APP_CONFIG.tool_version),nextVersion);assert.equal(await page.evaluate(()=>S.me),'khaimera');check('new worker survives a real offline restart with saved data');
 await page.evaluate(()=>changeRoute('more'));await page.locator('[data-app-check]').click();await page.waitForFunction(()=>document.querySelector('[data-app-state]').textContent.includes('unavailable'));check('offline check never claims the app is verified current');
 net.down=false;net.noVersion=true;await page.locator('[data-app-check]').click();await page.waitForFunction(()=>!document.querySelector('[data-app-check]').disabled);assert.match(await page.locator('[data-app-state]').last().innerText(),/unavailable/);check('legacy manifest without app version is not treated as proof of freshness');net.noVersion=false;
 assert.deepEqual(report.errors,[]);await context.close();
 if(process.env.LEGACY_APP_SITE){
  const legacyVersion=process.env.LEGACY_APP_VERSION||'2.30.2';
  net.folder=path.resolve(process.env.LEGACY_APP_SITE);
  const legacy=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),p=await legacy.newPage();
  await p.goto(origin);await ready(p);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await p.evaluate(()=>APP_CONFIG.tool_version),legacyVersion);
  await p.evaluate(()=>{S.locks=[{slug:'khaimera',role:'jungle'}];S.me='khaimera';save();});
  net.folder=current;await p.locator('#refresh').click();await p.waitForFunction(()=>!latestStatus.busy);
  assert.equal(await p.evaluate(()=>APP_CONFIG.tool_version),legacyVersion);check('actual '+legacyVersion+' data refresh does not silently replace the active interface');
  await p.reload();await ready(p);assert.equal(await p.evaluate(()=>APP_CONFIG.tool_version),currentVersion);assert.equal(await p.evaluate(()=>S.me),'khaimera');
  await p.evaluate(()=>changeRoute('more'));assert((await p.locator('#main').innerText()).includes('Running v'+currentVersion));check('actual '+legacyVersion+' worker loads the new interface on navigation without clearing picks');
  await legacy.close();
 }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(root,'qa/app-updates-'+(process.env.BROWSER_ENGINE||'edge')+'.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
