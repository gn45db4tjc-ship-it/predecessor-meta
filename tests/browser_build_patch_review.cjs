// Run against a staged six-bracket September 23 (2.32.0) build review publication. This is a
// real-bundle acceptance check, not a source collector or a replacement for CI's
// deliberately older, committed seed. See RELEASE-2.31.1.md for invocation.
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:13027/';
(async()=>{
 const engine=process.env.BROWSER_ENGINE||'edge';
 const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'}));
 const report={checks:[],errors:[],physicalDevice:'Not run'};
 try{
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(t=>{localStorage.setItem('predecessor-theme',t);localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));},theme);
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof B!=='undefined'&&B&&!latestStatus.busy);
  assert.equal(await page.evaluate(()=>B.guidance.build_patch_review?.patch),'1.17','This check requires the staged 1.17 review publication');
  await page.evaluate(()=>openHero('steel','jungle'));
  await page.waitForFunction(()=>E.buildReview('steel','jungle')?.active);
  let text=await page.locator('#main').innerText();
  assert.match(text,/September 23|9\/23\/2026/);assert.match(text,/1\.17/);
  assert.doesNotMatch(text,/No verified build evidence is eligible/);
  assert.equal(await page.evaluate(()=>E.plannedBuild('steel','jungle').items.length),6);
  if(width<700){assert.equal(await page.locator('.simple-purchases>li').count(),6);assert.equal(await page.locator('.simple-setup>div').count(),5);}
  assert.equal(await page.evaluate(()=>B.guidance.patch),'1.16.4');
  assert.match(await page.evaluate(()=>B.guidance.reviewed_at),/^2026-09-14/);
  // Missing local mechanics metadata must remain usable as a dated definition,
  // without borrowing another rank's rates or changing the category.
  const missing=await page.evaluate(()=>{const key=n=>String(n).toLowerCase().replace(/[^a-z0-9]/g,'');return Object.keys(B.guidance.build_patch_review.loadout_definitions).find(n=>!Object.values(B.perks).some(p=>key(p.display_name||p.name)===key(n)));});
  assert(missing);await page.evaluate(n=>showCatalog('perks',n),missing);
  assert.match(await page.locator('#detail').innerText(),/Observed source definition/);
  assert.match(await page.locator('#detail').innerText(),/statistic|win rate|sampling/i);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#detail').evaluate(d=>d.open),false);
  await page.evaluate(()=>openHero('wukong','offlane'));
  text=await page.locator('#main').innerText();assert.match(text,/unresolved/i);assert.match(text,/September 14|9\/14\/2026/);assert.match(text,/Previous reviewed plan/);
  if(width<700){assert.match(text,/Previous guidance September 14/);assert.doesNotMatch(text,/Previous guidance September 23/);}
  assert.equal(await page.evaluate(()=>E.plannedBuild('wukong','offlane').items.length),0);
  await page.evaluate(()=>openHero('serath','jungle'));
  // 2.32.0 reverted the September 22 Thraex choice: Weald now leads in every rank.
  assert.deepEqual(await page.evaluate(()=>{const r=E.buildReview('serath','jungle');return [r?.active,r?.patch];}),[true,'1.17']);
  assert.equal(await page.evaluate(()=>E.plannedBuild('serath','jungle').eternal),'Weald');
  await page.evaluate(()=>{S.locks=[{slug:'serath',role:'jungle'}];S.me='serath';S.enemies=[{slug:'steel',role:'support'}];save();changeRoute('live');});
  // 2.32.0 added a dated adaptation_review, so the live route adapts the reviewed build.
  assert.equal(await page.evaluate(()=>E.evidenceState().builds?.adaptation),'reviewed');
  text=await page.locator('#main').innerText();assert.match(text,/Next: [^\n]+\nReviewed/);assert.doesNotMatch(text,/Automatic match adaptations still need/);
  await page.reload();await page.waitForFunction(()=>typeof B!=='undefined'&&B&&!latestStatus.busy);
  assert.equal(await page.evaluate(()=>S.me),'serath');assert.equal(await page.evaluate(()=>S.enemies[0].role),'support');
  await page.evaluate(()=>changeRoute('data'));
  assert.match(await page.locator('#main').innerText(),/Latest build patch review/);
  assert.match(await page.locator('#main').innerText(),/Previous full strategy review/);
  await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});
  for(const route of ['data','hero','live']){
   await page.evaluate(r=>r==='hero'?openHero('steel','jungle'):changeRoute(r),route);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} ${route}`);
   const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
   assert.deepEqual(violations,[],`${width} ${theme} ${route}`);report.checks.push({width,theme,route});
  }
  if(width===390&&theme==='dark'){
   for(const bracket of ['bronze','silver','gold','platinum','diamond','paragon']){
    await page.locator('#bracket').selectOption(bracket);
    await page.waitForFunction(b=>B?.bracket?.segment===b&&!latestStatus.busy,bracket);
    await page.evaluate(()=>openHero('steel','jungle'));
    await page.waitForFunction(()=>E.buildReview('steel','jungle')?.active);
    assert.match(await page.locator('#main').innerText(),/September 23/);
    assert.equal(await page.evaluate(()=>B.guidance.patch),'1.16.4');report.checks.push({bracket,currentBuild:true});
   }
   await page.locator('#bracket').selectOption('gold');await page.waitForFunction(()=>B?.bracket?.segment==='gold'&&!latestStatus.busy);
  }
  await page.evaluate(()=>openHero('steel','jungle'));await page.screenshot({path:`qa/patch-build-${engine}-${width}-${theme}.png`,fullPage:true});
  // Same-version hotfixes invalidate this review without clearing picks.
  await page.evaluate(()=>{B.official.articles[0].fingerprint+='-changed';E=MetaEngine.create(B);render();});
  assert.equal(await page.evaluate(()=>E.buildReview('steel','jungle').active),false);
  assert.match(await page.locator('#main').innerText(),/Previous reviewed plan/);
  assert.match(await page.locator('#main').innerText(),/Previous reviewed plan .*v1\.17/);
  if(width<700)assert.match(await page.locator('#main').innerText(),/Previous guidance September 23/);
  assert.equal(await page.evaluate(()=>S.me),'serath');
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify({checks:report.checks.length,errors:report.errors}));
 }finally{await browser.close();fs.writeFileSync(`qa/build-patch-review-${engine}.json`,JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
