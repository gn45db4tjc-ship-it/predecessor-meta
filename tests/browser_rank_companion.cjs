// Source-policy-aware six-rank acceptance. Retained Pred samples may legitimately yield to Statz.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:12969/';
(async()=>{const engine=process.env.BROWSER_ENGINE||'edge',browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'msedge',headless:true}));const report={engine,roles:[],errors:[]};try{
 for(const width of [390,1440]){const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
  for(const bracket of ['bronze','silver','gold','platinum','diamond','paragon']){
   await page.selectOption('#bracket',bracket);await page.waitForFunction(b=>B?.bracket?.segment===b&&!latestStatus.busy,bracket);await page.evaluate(()=>changeRoute('meta'));
   for(const role of ['jungle','offlane','midlane','carry','support']){
    await page.locator(`[${width<700?'data-mobile-role':'data-meta-role'}="${role}"]`).click();
    const state=await page.evaluate(phone=>{
     const nodes=[...document.querySelectorAll(phone?'#mobile-all-list .mobile-hero-card':'.meta-table tbody tr')],source=effectiveStatSource();
     const expected=phone?Object.keys(E.heroes).filter(s=>E.roles(s).includes(S.role)): (source==='statz'?B.tier_list:B.scoped_statistics?.rows||[]).filter(r=>r.role===S.role).map(r=>r.slug);
     return {expected,rows:nodes.map(n=>{const slug=n.querySelector('[data-hero]')?.dataset.hero,p=E.performance({slug,role:S.role});return {slug,text:n.innerText,rate:p?pct(p.wr):null,games:p?games(p.played):null};}),bracket:S.bracket,loaded:B.bracket.segment,source,overflow:document.documentElement.scrollWidth>innerWidth+1};
    },width<700);
    assert.equal(state.bracket,bracket);assert.equal(state.loaded,bracket);assert.deepEqual(state.rows.map(r=>r.slug).sort(),state.expected.sort());assert(!state.overflow);
    if(width<700)for(const row of state.rows){if(row.rate){assert(row.text.includes(row.rate));assert(row.text.includes(row.games));}else assert(!/%/.test(row.text),'missing sample stays missing: '+row.slug);}
    report.roles.push({width,bracket,role,source:state.source,rows:state.rows.length});
   }
  }
  await page.goto(url+'#hero=steel&role=jungle&bracket=diamond&tab=counters');await page.waitForFunction(()=>B?.bracket?.segment==='diamond'&&S.route==='hero'&&!latestStatus.busy);assert.equal(await page.locator('#main h1').innerText(),'Steel');assert.equal(await page.evaluate(()=>S.heroTab),'counters');
  await page.reload();await page.waitForFunction(()=>B?.bracket?.segment==='diamond'&&S.hero==='steel'&&!latestStatus.busy);assert.equal(await page.evaluate(()=>S.heroTab),'counters');
  if(width<700)await page.evaluate(()=>changeRoute('more'));
  const down=page.waitForEvent('download');await page.locator('#export:visible').click();const download=await down,path=`qa/rank-${engine}-${width}-export.html`;await download.saveAs(path);const snapshot=await context.newPage();await snapshot.goto(require('node:url').pathToFileURL(require('node:path').resolve(path)).href);assert.equal(await snapshot.evaluate(()=>B.bracket.segment),'diamond');assert.equal(await snapshot.locator('#main h1').count(),1);await context.close();
 }
 assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(`qa/ranks-companion-${engine}.json`,JSON.stringify(report,null,2));}console.log(JSON.stringify({engine,roles:report.roles.length,errors:report.errors}));})().catch(e=>{console.error(e);process.exitCode=1;});
