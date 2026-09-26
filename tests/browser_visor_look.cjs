'use strict';
// Visor colours in the local Windows app. Windows only (the loopback app locks its data folder with msvcrt), so it
// is not a CI step. It starts predecessor_meta.py --no-fetch on an isolated copy of the committed gold seed and points
// the app at sample look files through PREDECESSOR_META_VISOR_LOOK_FILE (test-only). It never reads or writes the
// real %LOCALAPPDATA%\VisorHost\look.json.
//   PLAYWRIGHT_PATH=<node_modules/playwright> node tests/browser_visor_look.cjs
// Optional: BROWSER_CHANNEL (default msedge), PYTHON_EXE, LOCAL_PORT (default 12994), AXE_PATH (axe.min.js file),
// SKIP_POLL_WAIT=1 skips the two real 30-second waits that prove the timed re-read.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
const port=Number(process.env.LOCAL_PORT||12994),base=`http://127.0.0.1:${port}/`;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pm-visor-')),data=path.join(work,'data'),lookFile=path.join(work,'look.json');
const axePath=process.env.AXE_PATH||require.resolve('axe-core/axe.min.js',{paths:[path.dirname(require.resolve(process.env.PLAYWRIGHT_PATH||'playwright')),root]});
const DEFAULT_DARK={'--bg':'#090e1c','--surface':'#131e34','--brand':'#a9c5ff','--brand-text':'#aac7ff'};
const SEMANTIC=['--text','--text-2','--muted','--green','--blue','--red','--amber','--gold','--gold-text','--official','--enemy-text','--indicator','--focus','--tier-a-fill','--observed-tint','--calculated-tint','--reviewed-tint','--official-tint','--amber-tint-2'];
const SAMPLES={
 amber:{style:'orbit',palette:'ember',glass:'medium',calm:false,accent:'#F0A020',text:'#F4F1EA',muted:'#B8B0A0',warn:'#FF6A3D',tint:'#1A1206'},
 violet:{style:'nebula',palette:'amethyst',glass:'light',calm:true,accent:'#8A4DFF',text:'#EEE8FF',muted:'#A89CC8',warn:'#FFB020',tint:'#120A24'},
 ice:{style:'cockpit',palette:'ice',glass:'clear',calm:false,accent:'#E1EBFA',text:'#F5F8FF',muted:'#9FB0C8',warn:'#FFC04D',tint:'#0B1220'},
 red:{style:'orbit',palette:'alert',glass:'solid',calm:false,accent:'#E0303A',text:'#FFF0F0',muted:'#C8A0A0',warn:'#FFD000',tint:'#1A0708'},
};
// Replaced atomically, as the Visor does. On Windows a rename over a file fails while any handle is open (the app's
// microsecond read, a virus scan), so a rename-based writer retries; the suite counts how often that happened.
let renameRetries=0;
function writeLook(value){
 const tmp=lookFile+'.tmp';fs.writeFileSync(tmp,typeof value==='string'?value:JSON.stringify({schema:1,updated:new Date().toISOString(),...value}));
 for(let attempt=0;;attempt++){try{fs.renameSync(tmp,lookFile);return;}catch(e){if(e.code!=='EPERM'&&e.code!=='EBUSY'||attempt===40)throw e;renameRetries++;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
}
function removeLook(){fs.rmSync(lookFile,{force:true});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let app;
(async()=>{
 fs.mkdirSync(data,{recursive:true});fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(data,'last_successful_gold.json'),zlib.gunzipSync(fs.readFileSync(path.join(root,'public-seed-gold.json.gz'))));
 fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({bracket:'gold'}));
 app=spawn(process.env.PYTHON_EXE||'python',['-B','-X','utf8',path.join(root,'predecessor_meta.py'),'--no-fetch','--no-open','--port',String(port),'--data-dir',data],
  {cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,PREDECESSOR_META_VISOR_LOOK_FILE:lookFile}});
 for(let attempt=0;;attempt++){try{if((await fetch(base+'api/identity')).ok)break;}catch{}if(attempt===100)throw Error('Local app did not start');await sleep(100);}
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const report={checks:[],errors:[],screenshots:[],limitations:['Windows loopback app only; not a CI step','No physical display calibration or screen-reader acceptance']};
 const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push('pageerror: '+e.message));
  // Step 7 blocks /api/look on purpose; only that request's failure is expected.
  let blockingLook=false;
  page.on('console',m=>{if(m.type()==='error'&&!(blockingLook&&/ERR_FAILED/.test(m.text())&&/\/api\/look/.test(m.location().url||'')))report.errors.push('console: '+m.text()+' '+(m.location().url||''));});
  const tokens=names=>page.evaluate(n=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(n.map(k=>[k,s.getPropertyValue(k).trim()]));},names);
  const served=()=>page.evaluate(()=>fetch('/api/look',{cache:'no-store'}).then(r=>r.json()));
  const ready=async()=>{await page.waitForFunction(()=>typeof B!=='undefined'&&B&&latestStatus&&!latestStatus.busy);};
  const nudge=()=>page.evaluate(()=>dispatchEvent(new Event('focus')));
  const brandIs=value=>page.waitForFunction(v=>getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()===v,value,{timeout:5000});
  const shot=async name=>{const file=path.join(qa,`visor-${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);};
  const contrastViolations=async()=>{await page.addScriptTag({path:axePath});return page.evaluate(()=>axe.run(document,{runOnly:{type:'rule',values:['color-contrast']}}).then(r=>r.violations.flatMap(v=>v.nodes.map(n=>n.target.join(' ')))));};

  // 1. No look file: the normal look, no setting, nothing applied.
  removeLook();
  await page.goto(base);await ready();
  check(await page.locator('#visor-look').count()===0,'missing file: no Visor stylesheet');
  check(await page.locator('.visor-setting').isHidden(),'missing file: setting hidden');
  const defaults=await tokens([...Object.keys(DEFAULT_DARK),...SEMANTIC]);
  for(const [name,value] of Object.entries(DEFAULT_DARK))check(defaults[name]===value,'missing file: default '+name);
  const baselineContrast=await contrastViolations();
  await shot('missing-meta-1440');
  await page.evaluate(()=>openHero('khaimera','jungle'));await page.waitForTimeout(300);
  await shot('missing-hero-1440');
  await page.evaluate(()=>changeRoute('meta'));

  // 2. The Visor writes a look: a focus re-read applies it without a reload; semantic tokens never move.
  writeLook(SAMPLES.amber);
  await nudge();
  const amber=await served();
  check(amber.available===true,'amber: served as available');
  await brandIs(amber.tokens['--brand']);
  const applied=await tokens(Object.keys(amber.tokens));
  check(Object.entries(amber.tokens).every(([k,v])=>applied[k]===v),'amber: every served token is on the root');
  check(JSON.stringify(await tokens(SEMANTIC))===JSON.stringify(Object.fromEntries(SEMANTIC.map(k=>[k,defaults[k]]))),'amber: evidence, status, text and gold tokens unchanged');
  check(await page.locator('#visor-follow').isChecked(),'amber: setting on by default');
  check((await page.locator('#visor-note').innerText()).trim()==='Orbit · ember','amber: setting names the look');
  check(await page.evaluate(()=>document.querySelector('meta[name=theme-color]').content)===amber.tokens['--bg'],'amber: browser chrome colour follows');
  const amberContrast=await contrastViolations();
  check(amberContrast.length<=baselineContrast.length,'amber: no new colour-contrast violations ('+amberContrast.length+' vs '+baselineContrast.length+')');
  await shot('amber-meta-1440');
  await page.evaluate(()=>openHero('khaimera','jungle'));await page.waitForTimeout(300);
  await shot('amber-hero-1440');
  await page.evaluate(()=>changeRoute('meta'));

  // 3. No flicker: unchanged re-reads touch nothing; a change edits the one stylesheet in place.
  await page.evaluate(()=>{window.__visorMutations=[];window.__visorSheet=document.getElementById('visor-look');new MutationObserver(m=>window.__visorMutations.push(...m.map(x=>x.type))).observe(document.head,{childList:true,subtree:true,characterData:true});});
  for(let i=0;i<3;i++){await nudge();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await sleep(150);}
  check((await page.evaluate(()=>window.__visorMutations.length))===0,'unchanged look: no DOM change on re-read');
  writeLook(SAMPLES.violet);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const violet=await served();
  await brandIs(violet.tokens['--brand']);
  check(await page.evaluate(()=>document.getElementById('visor-look')===window.__visorSheet),'changed look: same stylesheet element updated in place');
  check((await page.locator('#visor-note').innerText()).trim()==='Nebula · amethyst','violet: setting names the look');
  const violetContrast=await contrastViolations();
  check(violetContrast.length<=baselineContrast.length,'violet: no new colour-contrast violations');
  await shot('violet-meta-1440');

  // 4. The timed re-read: about every 30 s while visible, never while hidden (real waits).
  if(process.env.SKIP_POLL_WAIT!=='1'){
   writeLook(SAMPLES.ice);
   const ice=await served();
   await page.waitForFunction(v=>getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()===v,ice.tokens['--brand'],{timeout:35000});
   check(true,'ice: picked up by the 30-second re-read with no event');
   await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'}));
   writeLook(SAMPLES.red);
   await sleep(32000);
   check((await tokens(['--brand']))['--brand']===ice.tokens['--brand'],'hidden page: no re-read');
   await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
   const red=await served();
   await brandIs(red.tokens['--brand']);
   check(true,'visible again: re-read at once');
  }
  writeLook(SAMPLES.ice);await nudge();
  const ice=await served();await brandIs(ice.tokens['--brand']);
  const iceContrast=await contrastViolations();
  check(iceContrast.length<=baselineContrast.length,'ice: no new colour-contrast violations');
  await shot('ice-meta-1440');

  // 5. The setting: off restores the normal look and survives a reload; on follows again.
  await page.locator('#visor-follow').uncheck();
  check(await page.locator('#visor-look').count()===0,'setting off: stylesheet removed');
  check((await tokens(['--bg']))['--bg']===DEFAULT_DARK['--bg'],'setting off: normal background');
  check(await page.evaluate(()=>localStorage.getItem('predecessor-visor-colours'))==='off','setting off: stored with the other local preferences');
  await page.reload();await ready();
  check(await page.locator('#visor-look').count()===0&&!(await page.locator('#visor-follow').isChecked())&&await page.locator('.visor-setting').isVisible(),'setting off: kept after reload');
  await page.locator('#visor-follow').check();
  await brandIs(ice.tokens['--brand']);
  check(true,'setting on: follows again');

  // 6. Light theme stays untouched; the Visor applies to the dark theme only.
  await page.locator('#theme-toggle').click();
  const light=await tokens(['--bg','--surface','--brand']);
  check(light['--bg']==='#f0f3fb'&&light['--surface']==='#ffffff'&&light['--brand']==='#2854d7','light theme: its own tokens');
  check((await page.locator('#visor-note').innerText()).includes('dark theme only'),'light theme: setting says dark only');
  await shot('ice-light-theme-1440');
  await page.locator('#theme-toggle').click();
  await brandIs(ice.tokens['--brand']);
  check(true,'dark theme again: Visor colours return');

  // 7. First paint uses the look without waiting for /api/look.
  blockingLook=true;await page.route('**/api/look',r=>r.abort());
  await page.reload();await ready();
  check((await tokens(['--brand']))['--brand']===ice.tokens['--brand'],'first paint: inline look applied with /api/look blocked');
  const initial=await page.evaluate(()=>document.getElementById('visor-look')?.textContent||'');
  check(initial.startsWith(':root:not([data-theme=light]){'),'first paint: dark-only rule');
  await page.unroute('**/api/look');blockingLook=false;

  // 8. Broken, stale and removed files fall back silently.
  for(const [label,write] of [['malformed',()=>writeLook('{"schema":1,"accent":')],['wrong schema',()=>writeLook({...SAMPLES.amber,schema:2})],
   ['injection',()=>writeLook({...SAMPLES.amber,accent:'#123456;--green:#000'})],['stale future time',()=>writeLook({...SAMPLES.amber,updated:'2099-01-01T00:00:00Z'})],['removed',removeLook]]){
   writeLook(SAMPLES.ice);await nudge();await brandIs(ice.tokens['--brand']);
   write();await nudge();
   await page.waitForFunction(()=>!document.getElementById('visor-look'),null,{timeout:5000});
   check((await tokens(['--bg']))['--bg']===DEFAULT_DARK['--bg']&&await page.locator('.visor-setting').isHidden(),label+': normal look, setting hidden');
  }

  // 9. Phone width: the setting sits with the theme switch, which the phone shell moves to More, so it is hidden there.
  writeLook(SAMPLES.amber);await nudge();await brandIs(amber.tokens['--brand']);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  check(await page.locator('.visor-setting').isHidden(),'390px: setting hidden with the theme switch');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px: no horizontal overflow');
  await shot('amber-phone-390');
  await context.close();
  assert.deepEqual(report.errors,[]);
 }finally{
  await browser.close();
  if(app)app.kill();
  report.renameRetries=renameRetries;fs.writeFileSync(path.join(qa,'visor-look-browser.json'),JSON.stringify(report,null,2));
  try{fs.rmSync(work,{recursive:true,force:true});}catch{}
 }
 console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,renameRetries,screenshots:report.screenshots}));
})().catch(e=>{if(app)app.kill();console.error(e);process.exitCode=1;});
