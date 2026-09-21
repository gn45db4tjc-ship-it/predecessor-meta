'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'edge',url=process.env.PREVIEW_URL||'http://127.0.0.1:13965/';
const report={engine,states:[],errors:[]};
(async()=>{
 const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
 try{
  for(const theme of ['dark','light'])for(const viewport of [{width:390,height:844},{width:320,height:844},{width:320,height:256},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
   await context.addInitScript(theme=>{localStorage.setItem('predecessor-theme',theme);localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));},theme);
   page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
   await page.evaluate(()=>{Object.assign(S,{locks:[{slug:'steel',role:'jungle'}],me:'steel',enemies:[{slug:'gideon',role:'midlane'}],bans:['muriel']});save();});
   for(const route of ['planner','draft','live']){
    await page.evaluate(r=>changeRoute(r),route);
    await page.locator('[data-edit-roster]').click();
    assert(await page.locator('#detail [data-plan-side="allies"][data-plan-role="jungle"]').isDisabled());
    assert.equal(await page.locator('#detail [data-plan-side] option[value="muriel"]').count(),0);
    assert.equal(await page.locator('#detail [data-plan-ban] option[value="steel"]').count(),0);
    if(process.env.AXE_PATH){await page.addScriptTag({path:process.env.AXE_PATH});const a=await page.evaluate(()=>axe.run(document.querySelector('#detail'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(a.violations,[],JSON.stringify(a.violations));}
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#detail').open&&document.activeElement?.hasAttribute('data-edit-roster'));
    await page.locator('[data-roster-picks] summary').click();
    await page.waitForFunction(()=>document.querySelector('[data-roster-picks]').open);
    assert(await page.locator('.plan-roster').evaluate(e=>getComputedStyle(e).position==='static'));
    await page.locator('[data-roster-picks] summary').click();
    await page.waitForFunction(()=>!document.querySelector('[data-roster-picks]').open);
    const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('.plan-roster button,.plan-roster summary')].filter(e=>e.getBoundingClientRect().height<44).length,position:getComputedStyle(document.querySelector('.plan-roster')).position}));
    assert(!state.overflow);assert.equal(state.small,0);if(viewport.height<480)assert.equal(state.position,'static');
    if(route==='planner'){
     await page.locator('#generate').evaluate(e=>{e.focus();e.scrollIntoView({block:'start'});});await page.waitForTimeout(150);
     const clear=await page.evaluate(()=>{const r=document.querySelector('.plan-roster').getBoundingClientRect(),g=document.querySelector('#generate').getBoundingClientRect();return g.top>=r.bottom-1||g.left>=r.right||g.right<=r.left;});
     assert(clear,'Generate remains outside the sticky roster');
    }
    await page.evaluate(()=>scrollTo(0,0));
    if(viewport.width!==320)await page.screenshot({path:`qa/plan-${engine}-${theme}-${viewport.width}-${route}.png`});
    report.states.push({theme,viewport,route,...state});
   }
   await context.close();
  }
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(`qa/plan-layout-${engine}.json`,JSON.stringify(report,null,2));}
 console.log(JSON.stringify({engine,states:report.states.length,errors:report.errors}));
})().catch(e=>{console.error(e);process.exitCode=1;});
