'use strict';
// Every screen at 390, 320 and 1440 px in both themes: one current page, one h1, no page overflow, 44 px navigation
// targets and the Match picks kept. Since 2.36.0 one Match screen replaces Compose, Draft and Live; their old IDs and
// old Plan links open Match. START_PREVIEW=1 serves PREVIEW_DIR (default: the seed site browser_audit_regressions.cjs stages).
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {goToScreen}=require('./navigation_helpers.cjs');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:13965/';
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':process.env.BROWSER_CHANNEL||'msedge';
const report={engine,states:[],links:[],skipped:[],errors:[]};
const ROUTES=['meta','hero','match','builds','guidance','library','changes','data','more'],LEGACY=['planner','draft','live'];
const ready=page=>page.waitForFunction(()=>{if(!B||latestStatus.busy)return false;const r=S.route;S.route='hero';const gate=guideGate();S.route=r;return gate==='';},null,{timeout:60000});
let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(url).port,'--bind','127.0.0.1','--directory',process.env.PREVIEW_DIR||path.resolve(__dirname,'..','qa','audit-site')],{windowsHide:true,stdio:'ignore'});
  for(let attempt=0;;attempt++){try{if((await fetch(url)).ok)break;}catch{}if(attempt===50)throw Error('Preview did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:engine,headless:true}));
 try{
  for(const theme of process.env.ONLY_LINKS?[]:['dark','light'])for(const viewport of [{width:390,height:844},{width:320,height:256},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
   await context.addInitScript(theme=>{localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));localStorage.setItem('predecessor-theme',theme);},theme);
   page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(url);await ready(page);
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'}];S.me='steel';S.enemies=[{slug:'gideon',role:'midlane'}];S.bans=['muriel'];save();});
   const picks=await page.evaluate(()=>JSON.stringify([S.locks,S.enemies,S.bans]));
   for(const route of [...ROUTES,...LEGACY]){
    if(route==='hero')await page.evaluate(()=>openHero('steel','jungle'));else await goToScreen(page,route);
    const state=await page.evaluate(()=>{
     const nav=document.querySelector(innerWidth<=700?'#mobile-navigation':'#navigation');
     const controls=[...nav.querySelectorAll('button'),...document.querySelectorAll('#main .destination-sections button')].filter(b=>b.getClientRects().length);
     return {route:S.route,current:document.querySelectorAll('[aria-current="page"]').length,headings:document.querySelectorAll('#main h1').length,failed:/could not render/.test(document.querySelector('#main').innerText),overflow:document.documentElement.scrollWidth>innerWidth+1,offenders:[...document.querySelectorAll('#main *')].filter(b=>b.getBoundingClientRect().right>innerWidth+1&&!b.closest('.table-scroll')).slice(0,8).map(b=>({tag:b.tagName,cls:String(b.className),width:b.getBoundingClientRect().width})),short:controls.filter(b=>b.getBoundingClientRect().height<44).map(b=>b.textContent.trim()),picks:JSON.stringify([S.locks,S.enemies,S.bans])};
    });
    const at=JSON.stringify({theme,viewport,route});
    assert.equal(state.route,LEGACY.includes(route)?'match':route,at);assert.equal(state.current,1,at);assert.equal(state.headings,1,at);assert(!state.failed,at);assert(!state.overflow,JSON.stringify({theme,viewport,state}));assert.deepEqual(state.short,[],at);assert.equal(state.picks,picks,at);
    report.states.push({theme,viewport,route});
    if(viewport.width!==320&&['meta','hero','match','builds','data'].includes(route))await page.screenshot({path:`qa/navigation-${engine}-${theme}-${viewport.width}-${route}.png`});
   }
   // Keyboard destinations remain operable.
   await page.locator('[data-destination="match"]:visible').first().focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>S.route),'match');
   await context.close();
  }
  // Fresh profiles prove the address supplies its own cohort; an old Plan link opens Match. Saved ranks must not win.
  const brackets=Object.entries((await (await fetch(new URL('manifest.json',url))).json()).cohorts).filter(([,c])=>c.url||c.projection).map(([b])=>b);
  if(brackets.length<2)report.skipped.push('changing rank from a link: this publication has data for one rank ('+brackets.join()+')');
  for(const bracket of brackets){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(url+`#view=plan&stage=draft&bracket=${bracket}`);
   try{await page.waitForFunction(b=>!!B&&!latestStatus.busy&&B.bracket.segment===b&&S.route==='match',bracket,{timeout:60000});}
   catch(e){throw Error(e.message+' '+JSON.stringify(await page.evaluate(()=>({hash:location.hash,route:S.route,selected:S.bracket,loaded:B?.bracket.segment}))));}
   const next=brackets.find(b=>b!==bracket)||bracket;if(next!==bracket){await page.selectOption('#bracket',next);await page.waitForFunction(b=>B?.bracket.segment===b&&!latestStatus.busy&&new URLSearchParams(location.hash.slice(1)).get('bracket')===b,next);}
   await page.reload();await page.waitForFunction(b=>B?.bracket.segment===b&&!latestStatus.busy&&S.route==='match',next);
   report.links.push({requested:bracket,changedTo:next,reload:true});
   // A hero link restores hero and role, Back returns to it, and an unknown hero explains itself.
   await page.goto(url+`#hero=steel&role=jungle&bracket=${bracket}&tab=builds`);await page.waitForFunction(b=>B?.bracket?.segment===b&&S.route==='hero'&&!latestStatus.busy,bracket);
   assert.deepEqual(await page.evaluate(()=>[S.hero,S.heroRole]),['steel','jungle'],'hero link restores hero and role');
   await goToScreen(page,'more');await page.goBack();await page.waitForFunction(()=>S.route==='hero'&&S.hero==='steel');
   await page.goto(url+`#hero=unknown&role=jungle&bracket=${bracket}&tab=builds`);await ready(page);
   assert.match(await page.locator('#main').innerText(),/linked hero is unavailable/i,'an unknown hero link has a recoverable explanation');
   await context.close();
  }
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync(`qa/navigation-${engine}.json`,JSON.stringify(report,null,2));}
 console.log(JSON.stringify({engine,states:report.states.length,links:report.links.length,skipped:report.skipped,errors:report.errors}));
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exit(1);});
