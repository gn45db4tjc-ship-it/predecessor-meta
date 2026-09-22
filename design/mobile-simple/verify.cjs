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
   assert.deepEqual(await page.locator('#nav button').allTextContents(),['Meta','Plan','More']);assert.equal(await page.locator('#nav [aria-current="page"]').count(),1);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,screen+' overflow '+width);
   await page.addScriptTag({path:path.join(deps,'axe-core/axe.min.js')});
   const a=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(a,[],screen+' axe '+width+' '+theme);
   const small=await page.locator('button:visible,input:visible,select:visible,summary:visible').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<43.5).map(n=>n.textContent.slice(0,50)));assert.deepEqual(small,[],screen+' touch height');
   record(`${width}-${theme}-${screen}`,'one h1, no horizontal overflow, 44px control height, axe AA clean');
   if(width===390&&['hero','plan','live','partners','counters'].includes(screen))await page.screenshot({path:path.join(root,`${theme}-${screen}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();await page.goto(url);
 await page.evaluate(()=>{S.view='builds';S.role='support';S.query='Muriel';S.hero='muriel';S.pool=['muriel'];render();});
 assert.equal(await page.evaluate(()=>S.view),'meta');assert.equal(await page.locator('#role').inputValue(),'support');assert.equal(await page.locator('#search').inputValue(),'Muriel');assert.deepEqual(await page.evaluate(()=>S.pool),['muriel']);
 await page.locator('[data-hero="muriel"]').click();assert.equal(await page.locator('[data-section="build"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#nav [aria-current="page"]').textContent(),'Meta');
 record('combined-meta-build-entry','legacy saved Builds view preserves selections and opens hero Build under Meta');
 await page.evaluate(()=>{S.view='meta';S.role='jungle';S.query='';S.pool=[];render();});
 const skillCoverage=await page.evaluate(()=>{const rows=[];for(const slug of Object.keys(E.heroes))for(const role of E.roles(slug)){const g=SkillGuide.make(B,E.plannedBuild(slug,role));rows.push({slug,role,kind:g.kind,levels:g.points.length});}return {total:rows.length,kinds:rows.reduce((a,r)=>(a[r.kind]=(a[r.kind]||0)+1,a),{}),missing:rows.filter(r=>r.levels!==18)};});assert.deepEqual(skillCoverage.missing,[]);record('skill-guide-all-roles',skillCoverage);
 await page.locator('[data-hero="khaimera"]').click();
 for(const width of [320,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:844});await page.evaluate(theme=>{S.theme=theme;S.section='build';render();const g=document.querySelector('.skill-guide');g.open=true;g.querySelector('details').open=true;},theme);
  await page.locator('.skill-level').selectOption('6');assert.match(await page.locator('.skill-answer').innerText(),/Level 6.*Cull/);
  await page.locator('[data-skill-level="2"]').click();assert.match(await page.locator('.skill-answer').innerText(),/Level 2.*Ambush/);assert.equal(await page.locator('.skill-level').inputValue(),'2');
  await page.addScriptTag({path:path.join(deps,'axe-core/axe.min.js')});const v=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id));assert.deepEqual(v,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);record(`skill-guide-${width}-${theme}`,'level selection and all-level cards, named abilities, AA and reflow');
  if(width===390){await page.locator('.skill-guide').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,`${theme}-skill-guide.png`)});}
 }
 await page.locator('[data-section="partners"]').click();await page.locator('[data-section="build"]').click();assert.equal(await page.locator('.skill-level').inputValue(),'2');record('skill-level-restoration','level remembered per hero and role across section changes');
 await page.locator('[data-nav="meta"]').click();
 const coverage=await page.evaluate(()=>{const heroes=Object.keys(E.heroes),out=heroes.map(slug=>RecommendationView.counterplay(E,E.heroes,slug,E.roles(slug)[0]||'jungle'));return {heroes:heroes.length,withAdvice:out.filter(r=>r.points.length).length,named:out.filter(r=>r.picks.length).length,valid:out.every(r=>r.picks.length<=3&&r.points.length<=3)}});
 assert.equal(coverage.withAdvice,coverage.heroes);assert.equal(coverage.valid,true);record('counterplay-coverage',coverage);
 await page.evaluate(()=>{S.hero='khaimera';S.role='jungle';S.view='hero';S.section='partners';render();});assert.equal(await page.locator('.partner-card').count(),5);assert.ok(await page.locator('.partner-card').evaluateAll(nodes=>new Set(nodes.map(n=>n.dataset.partnerRole)).size)>=3);record('partner-role-diversity','five real candidates, at least three roles for Khaimera');
 await page.locator('[data-section="counters"]').click();assert.match(await page.locator('#main').innerText(),/Dekker/);assert.equal(await page.locator('.counter-pick').count(),1);assert.ok(await page.locator('.counterplay-advice li').count()>=1);record('named-counter-and-advice','reviewed Dekker counter-pick plus actual counterplay; no padding with invented picks');
 await page.locator('[data-nav="meta"]').click();
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
