// Actual six-bracket release bundles; no collector and no altered source dates.
'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:12988/';
(async()=>{
 const engine=process.env.BROWSER_ENGINE||'edge',browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'})),report={engine,checks:[],errors:[],physicalDevice:'Not run'};
 try{
  for(const width of [320,390,1440])for(const theme of ['dark','light']){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(url+'#view=hero&hero=valmont&heroRole=midlane');await page.waitForFunction(()=>typeof E!=='undefined'&&E&&typeof B!=='undefined'&&B&&!latestStatus.busy);
   await page.evaluate(t=>{S.theme=t;document.documentElement.dataset.theme=t;openHero('valmont','midlane');},theme);
   assert.equal(await page.evaluate(()=>E.plannedBuild('valmont','midlane').kind),'reviewed');
   assert.equal(await page.evaluate(()=>E.performance({slug:'valmont',role:'midlane'})),null);
   assert.equal(await page.evaluate(()=>SkillGuide.make(B,E.plannedBuild('valmont','midlane')).points.length),18);
   if(width<700){assert.equal(await page.locator('.simple-purchases>li').count(),6);await page.locator('[data-simple-section="counters"]').click();assert.match(await page.locator('#main').innerText(),/Steel/);await page.locator('[data-simple-section="pairings"]').click();}
   assert.match(await page.locator('#main').innerText(),/reviewed partner ideas/);
   await page.locator('[data-keep="patch-context-partners"] summary').click();assert.match(await page.locator('#main').innerText(),/Rupture/);
   await page.evaluate(()=>openHero('muriel','support'));assert.equal(await page.evaluate(()=>SkillGuide.make(B,E.plannedBuild('muriel','support')).points.length),0);
   await page.evaluate(()=>openHero('valmont','midlane'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});
   for(const route of ['hero','data']){
    await page.evaluate(r=>r==='hero'?openHero('valmont','midlane'):changeRoute(r),route);
    const issues=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
    assert.deepEqual(issues,[],`${width} ${theme} ${route}`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    report.checks.push({width,theme,route});
   }
   if(width===390&&theme==='dark'){
    for(const band of ['gold','bronze','silver','platinum','diamond','paragon']){
     await page.locator('#bracket').selectOption(band);await page.waitForFunction(s=>B?.bracket?.segment===s&&!latestStatus.busy,band);await page.evaluate(()=>openHero('valmont','midlane'));
     assert.equal(await page.evaluate(()=>E.plannedBuild('valmont','midlane').kind),'reviewed');assert.equal(await page.evaluate(()=>B.patch),'1.16');
     report.checks.push({bracket:band,reviewedNewHero:true,statisticsUnchanged:true});
    }
    await page.evaluate(()=>{S.locks=[{slug:'valmont',role:'midlane'}];S.me='valmont';S.enemies=[{slug:'steel',role:'jungle'}];save();changeRoute('live');});
    await page.reload();await page.waitForFunction(()=>typeof B!=='undefined'&&B&&!latestStatus.busy);assert.equal(await page.evaluate(()=>S.me),'valmont');
    await page.evaluate(()=>openHero('valmont','midlane'));await page.screenshot({path:`qa/valmont-${engine}.png`,fullPage:true});
   }
   await page.evaluate(()=>{B.official.articles[0].fingerprint='changed';E=MetaEngine.create(B);render();});assert.equal(await page.evaluate(()=>E.buildReview('valmont','midlane').active),false);
   await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
 }finally{fs.writeFileSync(`qa/browser-patch-support-${engine}.json`,JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
