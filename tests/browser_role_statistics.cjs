// A patch rollover must not erase the display of valid older role observations.
// Exercise real renderers, while proving the recommendation policy stays closed.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:12973/';let preview;
(async()=>{
 if(process.env.START_PREVIEW==='1'){
  preview=require('node:child_process').spawn(process.env.PYTHON_EXE||'python',['-B','-m','http.server',new URL(base).port,'--bind','127.0.0.1','--directory','qa/audit-site'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===50)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 }
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch():chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'})),report={screens:[],errors:[]};
 try{
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addInitScript(t=>localStorage.setItem('predecessor-theme',t),theme);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>typeof B!=='undefined'&&!!B&&!latestStatus.busy);
  await page.evaluate(()=>{B.official={...B.official,status:'verified',live:{...B.official.live,version:'99.1'}};delete B.recommendation_context;B.guidance.status='needs review';E=MetaEngine.create(B);S.route='meta';render();});
  for(const role of ['jungle','offlane','midlane','carry','support']){
   await page.locator(`[${width<700?'data-mobile-role':'data-meta-role'}="${role}"]`).click();
   const data=await page.evaluate(phone=>{
    const expected=Object.entries(B.heroes).filter(([s,h])=>h.roles?.[S.role]?.status==='ok'&&h.roles[S.role].playedGames>0);
    const nodes=[...document.querySelectorAll(phone?'#mobile-all-list .mobile-hero-card':'.meta-table tbody tr')];
    return {source:E.performancePolicy().source,eligible:E.evidenceState().ranking_current,expected:expected.map(([slug,h])=>({slug,wr:pct(h.roles[S.role].winRate),games:games(h.roles[S.role].playedGames)})),rows:nodes.map(n=>({slug:n.querySelector('[data-hero]')?.dataset.hero,text:n.innerText})),text:document.querySelector('#main').innerText,overflow:document.documentElement.scrollWidth>innerWidth+1};
   },width<700);
   assert.equal(data.source,null);assert.equal(data.eligible,false);assert(data.expected.length>0);assert(!data.overflow);assert.match(data.text,/previous (?:Statz|dataset|role statistics)/i);
   for(const r of data.expected){const row=data.rows.find(x=>x.slug===r.slug);assert(row,'missing '+r.slug);assert(row.text.includes(r.wr),'rate missing '+r.slug);if(width<700){assert(row.text.includes(r.games));assert.match(row.text,/previous dataset/);}}
   report.screens.push({width,theme,role,samples:data.expected.length});
  }
  await page.evaluate(()=>openHero('khaimera','jungle'));await page.waitForTimeout(100);
  assert.match(await page.locator('#main').innerText(),/previous dataset/i);
  const at=await page.evaluate(()=>date(B.heroes.khaimera.roles.jungle.fetched_at||B.sources.statz_hero_pages.fetched_at));
  if(width<700)assert((await page.locator('#main > .simple-source').first().innerText()).includes(at));
  await page.addScriptTag({path:process.env.AXE_PATH||require.resolve('axe-core/axe.min.js')});
  const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));assert.deepEqual(violations,[],`${width} ${theme}`);
  await page.screenshot({path:`qa/role-statistics-${width}-${theme}.png`,fullPage:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({screens:report.screens.length,errors:report.errors}));
 }finally{await browser.close();if(preview)preview.kill();fs.writeFileSync('qa/role-statistics-browser-'+(process.env.BROWSER_ENGINE||'edge')+'.json',JSON.stringify(report,null,2));}
})().catch(e=>{if(preview)preview.kill();console.error(e);process.exitCode=1;});
