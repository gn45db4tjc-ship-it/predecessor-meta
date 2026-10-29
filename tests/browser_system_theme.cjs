'use strict';
// The website follows the device's light or dark setting until the theme switch stores a choice (29 Oct 2026; UI
// review of 12 Oct, minor item "the light theme is a manual toggle"). A stored choice wins either way, and a device
// change while the page is open is followed only when nothing is stored. Probe first: before this change a light
// device opened the dark theme. START_PREVIEW=1 serves PREVIEW_DIR (default: the seed site browser_audit_regressions.cjs stages).
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:13064/';
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':process.env.BROWSER_CHANNEL||'msedge';
let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(url).port,'--bind','127.0.0.1','--directory',process.env.PREVIEW_DIR||path.resolve(__dirname,'..','qa','audit-site')],{windowsHide:true,stdio:'ignore'});
  for(let attempt=0;;attempt++){try{if((await fetch(url)).ok)break;}catch{}if(attempt===50)throw Error('Preview did not start');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:engine,headless:true}));
 const errors=[];
 try{
  const open=async(colorScheme,stored,width=390)=>{
   const context=await browser.newContext({viewport:{width,height:844},colorScheme,serviceWorkers:'block'}),page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(t=>{localStorage.setItem('predecessor-companion-v1',JSON.stringify({installSeen:true}));if(t)localStorage.setItem('predecessor-theme',t);},stored);
   await page.goto(url);await page.waitForFunction(()=>typeof B!=='undefined'&&!!B,null,{timeout:60000});
   const theme=()=>page.evaluate(()=>document.documentElement.getAttribute('data-theme')||'dark');
   // A media change is delivered as an event, so give it a moment before reading.
   const settle=want=>page.waitForFunction(w=>(document.documentElement.getAttribute('data-theme')||'dark')===w,want,{timeout:3000}).catch(()=>{});
   return {context,page,theme,settle};
  };
  for(const [scheme,stored,expected] of [['light',null,'light'],['dark',null,'dark'],['light','dark','dark'],['dark','light','light']]){
   for(const width of [390,1440]){
    const {context,theme}=await open(scheme,stored,width);
    assert.equal(await theme(),expected,JSON.stringify({scheme,stored,width}));
    await context.close();
   }
  }
  // A device change while open is followed when nothing is stored, and the switch names the other theme.
  let {context,page,theme,settle}=await open('dark',null,1440);
  await page.emulateMedia({colorScheme:'light'});await settle('light');
  assert.equal(await theme(),'light','follows a change to light');
  assert.equal(await page.locator('#theme-toggle').textContent(),'Switch to dark theme');
  await page.emulateMedia({colorScheme:'dark'});await settle('dark');
  assert.equal(await theme(),'dark','follows a change back to dark');
  // Pressing the switch stores a choice; the device setting no longer moves it.
  await page.locator('#theme-toggle').click();
  assert.equal(await theme(),'light');
  await page.emulateMedia({colorScheme:'dark'});await settle('dark');
  assert.equal(await theme(),'light','a stored choice wins over a device change');
  assert.equal(await page.evaluate(()=>localStorage.getItem('predecessor-theme')),'light');
  await context.close();
  assert.deepEqual(errors,[]);
  console.log('System theme: all checks passed ('+engine+')');
 }finally{await browser.close();if(preview)preview.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
