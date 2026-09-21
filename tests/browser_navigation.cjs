'use strict';
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {goToScreen}=require('./navigation_helpers.cjs');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:13965/';
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'edge';
const report={engine,states:[],links:[],errors:[]};
(async()=>{
 const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'msedge',headless:true}));
 try{
  for(const theme of process.env.ONLY_LINKS?[]:['dark','light'])for(const viewport of [{width:390,height:844},{width:320,height:256},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
   await context.addInitScript(theme=>{localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));localStorage.setItem('predecessor-theme',theme);},theme);
   page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'}];S.enemies=[{slug:'gideon',role:'midlane'}];S.bans=['muriel'];save();});
   const picks=await page.evaluate(()=>JSON.stringify([S.locks,S.enemies,S.bans]));
   for(const route of ['meta','planner','draft','live','builds','guidance','library','changes','data','more']){
    await goToScreen(page,route);
    const state=await page.evaluate(()=>{
     const nav=document.querySelector(innerWidth<=700?'#mobile-navigation':'#navigation');
     const controls=[...nav.querySelectorAll('button'),...document.querySelectorAll('#main .destination-sections button')];
     return {route:S.route,current:document.querySelectorAll('[aria-current="page"]').length,headings:document.querySelectorAll('#main h1').length,overflow:document.documentElement.scrollWidth>innerWidth+1,offenders:[...document.querySelectorAll('#main *')].filter(b=>b.getBoundingClientRect().right>innerWidth+1&&!b.closest('.table-scroll')).slice(0,8).map(b=>({tag:b.tagName,cls:b.className,width:b.getBoundingClientRect().width})),short:controls.filter(b=>b.getBoundingClientRect().height<44).map(b=>b.textContent),picks:JSON.stringify([S.locks,S.enemies,S.bans])};
    });
    assert.equal(state.route,route);assert.equal(state.current,1);assert.equal(state.headings,1);assert(!state.overflow,JSON.stringify({theme,viewport,state}));assert.deepEqual(state.short,[]);assert.equal(state.picks,picks);
    report.states.push({theme,viewport,route});
    if(viewport.width!==320&&['meta','planner','builds','data'].includes(route))await page.screenshot({path:`qa/navigation-${engine}-${theme}-${viewport.width}-${route}.png`});
   }
   // Keyboard destinations remain operable, with a visible focus destination in the screen.
   await page.locator('[data-destination="plan"]:visible').focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>S.route),'planner');
   await context.close();
  }
  // Fresh profiles prove the address supplies its own cohort; saved Gold must not win.
  for(const bracket of ['bronze','silver','gold','platinum','diamond','paragon']){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
   await page.goto(url+`#view=plan&stage=draft&bracket=${bracket}`);
   try{await page.waitForFunction(b=>!!B&&!latestStatus.busy&&B.bracket.segment===b&&S.route==='draft',bracket,{timeout:60000});}
   catch(e){throw Error(e.message+' '+JSON.stringify(await page.evaluate(()=>({hash:location.hash,route:S.route,selected:S.bracket,loaded:B?.bracket.segment,linkApplied}))));}
   const next=bracket==='gold'?'diamond':'gold';await page.selectOption('#bracket',next);
   await page.waitForFunction(b=>B?.bracket.segment===b&&!latestStatus.busy&&new URLSearchParams(location.hash.slice(1)).get('bracket')===b,next);
   await page.reload();await page.waitForFunction(b=>B?.bracket.segment===b&&!latestStatus.busy&&S.route==='draft',next);
   report.links.push({requested:bracket,changedTo:next,reload:true});await context.close();
  }
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(`qa/navigation-${engine}.json`,JSON.stringify(report,null,2));}
 console.log(JSON.stringify({engine,states:report.states.length,links:report.links.length,errors:report.errors}));
})().catch(e=>{console.error(e);process.exit(1);});
