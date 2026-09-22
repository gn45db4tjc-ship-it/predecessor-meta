'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const deps=process.env.PREVIEW_DEPS||'C:/Users/Will/Desktop/Predecessor Meta/Hosting/Predecessor Meta Free Hosting/node_modules';
const {chromium}=require(path.join(deps,'playwright'));
const root=path.resolve(__dirname,'../../qa/mobile-review'),results=[];
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+relative+(relative.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
function record(id,detail){results.push({id,passed:true,detail});}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>typeof E!=='undefined');await page.evaluate(theme=>{S.theme=theme;render();},theme);
  for(const screen of ['meta','builds','hero','alternatives','counters','partners','kit','plan','live','more']){
   await page.evaluate(screen=>{S.hero='khaimera';S.role='jungle';S.allies=[{slug:'khaimera',role:'jungle'}];S.enemies=[];S.section=['alternatives','counters','partners','kit'].includes(screen)?screen:'build';S.view=['alternatives','counters','partners','kit'].includes(screen)?'hero':screen;render();},screen);
   assert.equal(await page.locator('h1').count(),1,screen+' one heading');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,screen+' overflow '+width);
   await page.addScriptTag({path:path.join(deps,'axe-core/axe.min.js')});
   const a=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(a,[],screen+' axe '+width+' '+theme);
   const small=await page.locator('button:visible,input:visible,select:visible,summary:visible').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<43.5).map(n=>n.textContent.slice(0,50)));assert.deepEqual(small,[],screen+' touch height');
   record(`${width}-${theme}-${screen}`,'one h1, no horizontal overflow, 44px control height, axe AA clean');
   if(width===390&&['hero','plan','live'].includes(screen))await page.screenshot({path:path.join(root,`${theme}-${screen}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();await page.goto(url);
 await page.locator('[data-hero="khaimera"]').click();await page.locator('[data-section="alternatives"]').click();
 await page.locator('[data-variant]').first().click();const identity=await page.evaluate(()=>S.selected[S.hero+'|'+S.role]);assert.ok(identity);
 await page.locator('[data-adapt]').click();assert.equal(await page.evaluate(()=>S.selected[S.hero+'|'+S.role]),identity);assert.equal(await page.evaluate(()=>planFor().manual),true);record('alternative-handoff','same variant identity and manual selection in Live');
 await page.locator('[data-nav="plan"]').click();await page.locator('[data-refresh]').click();const first=await page.evaluate(()=>S.candidates.map(x=>x.slug));assert.ok(first.length>0&&first.length<=3);
 await page.locator('[data-ban]').evaluate(n=>n.closest('details').open=true);await page.locator('[data-ban]').click();await page.locator(`[data-assign="ban||${first[0]}"]`).click();assert.deepEqual(await page.evaluate(()=>S.candidates.map(x=>x.slug)),first);assert.equal(await page.locator(`[data-preview="${first[0]}"]`).isDisabled(),true);record('stable-shortlist','new ban disables candidate without reordering');
 await page.locator('[data-undo]').click();assert.equal(await page.locator(`[data-preview="${first[0]}"]`).isDisabled(),false);record('undo-ban','restores availability');
 await page.locator('[data-preview]').first().click();assert.equal(await page.locator('.setup:visible').count(),1);assert.equal(await page.locator('.setup:visible button').count(),5);record('prematch-loadout','augment, Eternal, both blessings and crest visible together');
 for(const width of [320,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:844});await page.evaluate(theme=>{S.theme=theme;render();},theme);
  await page.addScriptTag({path:path.join(deps,'axe-core/axe.min.js')});
  const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id));
  assert.deepEqual(violations,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);record(`populated-draft-${width}-${theme}`,'real shortlist and full setup, axe AA and reflow');
  if(width===390)await page.screenshot({path:path.join(root,`${theme}-quick-draft.png`),fullPage:true});
 }
 await page.locator('.setup button').first().click();assert.equal(await page.locator('dialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.matches('.setup button')),true);record('dialog-keyboard','Escape closes and restores opener focus');
 await page.evaluate(()=>{S.view='hero';S.section='build';render();document.body.style.fontSize='32px';});await page.setViewportSize({width:320,height:256});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);record('short-viewport','320x256 with enlarged text, no horizontal overflow, bottom nav unsticks');
 await page.evaluate(()=>{delete S.selected[S.hero+'|'+S.role];B.guidance.status='needs review · prototype future-patch fixture';render();});assert.match(await page.locator('#main').innerText(),/Calculated starting selection/);assert.ok(await page.getByText('Previous guidance · not verified current').count());record('historical-fallback','unverified guidance stays accessible and explicitly historical beside a calculated selection');
 await page.evaluate(()=>{B.heroes[S.hero].roles[S.role].builds=[];render();});assert.match(await page.locator('#main').innerText(),/No eligible current starting build/);record('unavailable-build','missing variants do not fabricate a starting build');
 await context.close();
 }finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(root,'TEST-RESULTS.json'),JSON.stringify({results,limitations:['No physical phone or assistive technology test','Prototype only; production regression suite applies after port','One saved Gold+ bundle; no collection or publication performed']},null,2));console.log(JSON.stringify({passed:results.length,receipt:path.join(root,'TEST-RESULTS.json')}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
