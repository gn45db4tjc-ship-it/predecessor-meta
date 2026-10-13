'use strict';
// axe (WCAG 2.1 A/AA) on every phone screen and the phone's open states, in both themes, then dialog keyboard return and
// large-text reflow at 320 px. Since 2.36.0 Match replaces Live, Draft and Compose. START_PREVIEW=1 serves PREVIEW_DIR.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:12932/',axe=process.env.AXE_PATH||require.resolve('axe-core/axe.min.js');
const ready=p=>p.waitForFunction(()=>{if(!B||latestStatus.busy)return false;const r=S.route;S.route='hero';const gate=guideGate();S.route=r;return gate==='';},null,{timeout:60000});
const scan=async(p,theme,route,report)=>{const r=await p.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));report.push({theme,route,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,8)}))});};
let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(url).port,'--bind','127.0.0.1','--directory',process.env.PREVIEW_DIR||path.resolve(__dirname,'..','qa','audit-site')],{windowsHide:true,stdio:'ignore'});
  for(let attempt=0;;attempt++){try{if((await fetch(url)).ok)break;}catch{}if(attempt===50)throw Error('Preview did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const b=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true})),report=[],errors=[];try{
 for(const theme of ['dark','light']){const c=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await c.addInitScript(t=>{localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));localStorage.setItem('predecessor-theme',t)},theme);await p.goto(url);await ready(p);await p.addScriptTag({path:axe});
 for(const route of ['meta','hero','match','more','builds','guidance','library','changes','data']){await p.evaluate(r=>{S.locks=[{slug:'steel',role:'jungle'}];S.me='steel';S.enemies=[{slug:'khaimera',role:'jungle'},{slug:'gideon',role:'midlane'}];S.bans=[];S.matchPicking='enemy';save();if(r==='hero')openHero('steel','jungle');else changeRoute(r);},route);await scan(p,theme,route,report);}
 const states=[['meta-name-order',async()=>{await p.evaluate(()=>changeRoute('meta'));await p.selectOption('#mobile-meta-order','name');}],['match-your-team',async()=>{await p.evaluate(()=>changeRoute('match'));await p.locator('#main [data-match-allies]').first().click();}],['match-my-lane',async()=>{await p.locator('#main [data-match-lane]').first().click();}],['match-change-hero',async()=>{await p.locator('#main [data-match-change]').first().click();}],['source-limitations',async()=>{await p.evaluate(()=>{B.errors=[...(B.errors||[]),{source:'Accessibility probe',severity:'warning',detail:'A source note for the accessibility check.'}];changeRoute('meta');});await p.locator('#mobile-limits').click();assert.ok(await p.locator('#detail').isVisible(),'the limitations dialog opens');}]];
 for(const [route,open] of states){await open();await scan(p,theme,route,report);}
 // Escape closes the dialog and returns focus to the page; large text still reflows at 320 px.
 await p.keyboard.press('Escape');assert.ok(!(await p.locator('#detail').isVisible()),'Escape closes the dialog');assert.ok(await p.evaluate(()=>document.activeElement!==document.body),'focus returns from the dialog');
 await p.evaluate(()=>changeRoute('more'));await p.locator('#large-text').check();await p.evaluate(()=>changeRoute('match'));await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>document.activeElement!==document.body));
 await p.setViewportSize({width:320,height:800});for(const route of ['match','meta','more'])assert.ok(await p.evaluate(r=>{changeRoute(r);return document.documentElement.scrollWidth<=innerWidth+1;},route),'large text 320px '+route);await c.close();
 }
 assert.deepEqual(errors,[]);
 }finally{await b.close();if(preview)preview.kill();fs.writeFileSync('qa/companion-accessibility.json',JSON.stringify(report,null,2));}console.log(JSON.stringify({scans:report.length,failing:report.filter(x=>x.violations.length)},null,2));assert.ok(report.every(r=>!r.violations.length),'WCAG automated checks');})().catch(e=>{if(preview)preview.kill();console.error(e);process.exit(1)});
