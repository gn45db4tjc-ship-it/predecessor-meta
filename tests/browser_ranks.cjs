// Regression: changing rank must expose that rank's observations, not a wall of unavailable Gold review cells.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),url=process.env.PREVIEW_URL||'http://127.0.0.1:12926/project/';
(async()=>{
  const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'edge';
  const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'msedge'}));
  const receipt={url,engine,runs:[]};
  try {
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>B&&!latestStatus.busy);
      const rows=[];
      for(const bracket of ['gold','bronze','silver','platinum','diamond','paragon']) {
        await page.locator('#bracket').selectOption(bracket);
        await page.waitForFunction(b=>B&&!latestStatus.busy&&B.bracket.segment===b,bracket);
        const cohort=await page.evaluate(()=>({segment:B.bracket.segment,label:B.scoped_statistics.bracket_label,
          rankIds:B.scoped_statistics.ranks,at:B.generated_at,steel:E.performance({slug:'steel',role:'jungle'}),
          validBuilds:Object.keys(E.heroes).filter(s=>E.roles(s).includes('jungle')&&E.plannedBuild(s,'jungle').kind==='reviewed').length}));
        assert.equal(cohort.segment,bracket); assert(cohort.validBuilds>0);
        assert((await page.locator('#patch-strip').innerText()).includes(cohort.label));
        for(const role of ['jungle','offlane','midlane','carry','support']) {
          await page.locator('[data-meta-role="'+role+'"]').click();
          const result=await page.evaluate(()=>{
            const source=B.scoped_statistics.rows.filter(r=>r.role===S.role);
            const table=[...document.querySelectorAll('.meta-table tbody tr')].map(tr=>({slug:tr.querySelector('[data-hero]').dataset.hero,text:tr.innerText}));
            return {source:source.map(r=>({slug:r.slug,wr:pct(r.winRate),games:num(r.matches,0)})),table};
          });
          assert.equal(result.table.length,result.source.length);
          for(const row of result.source) {const actual=result.table.find(r=>r.slug===row.slug);assert(actual.text.includes(row.wr));assert(actual.text.includes(row.games));}
          if(bracket!=='gold') {
            assert.equal(await page.locator('h1').innerText(),cohort.label+' meta');
            assert.equal(await page.locator('.meta-table [data-meta-decision]').count(),0);
            assert(!(await page.locator('.meta-table').innerText()).includes('Review unavailable'));
            assert(await page.locator('.rank-reference').count()===1);
          }
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        }
        rows.push(cohort);
      }
      assert(new Set(rows.map(r=>JSON.stringify(r.rankIds))).size===6,'Distinct source rank filters');
      assert.notEqual(rows.find(r=>r.segment==='gold').steel.played,rows.find(r=>r.segment==='diamond').steel.played,'Diamond uses its own sample');
      await page.locator('#bracket').selectOption('diamond');await page.waitForFunction(()=>B&&!latestStatus.busy&&B.bracket.segment==='diamond');
      await page.locator('[data-meta-role="jungle"]').click();
      await page.locator('[data-sort="matches"]').click();
      assert(await page.evaluate(()=>S.sort==='matches'&&S.direction===-1));
      await page.locator('#full-metrics').check();assert((await page.locator('.meta-table thead').innerText()).includes('95%'));
      await page.locator('#hero-search').fill('Steel');assert.equal(await page.locator('.meta-table tbody tr').count(),1);
      await page.locator('.meta-table [data-hero="steel"]').first().click();
      assert.equal(await page.locator('h1').innerText(),'Steel');
      assert((await page.locator('.rank-evidence').innerText()).includes('Diamond+'));
      await page.locator('[data-hero-tab="builds"]').click();
      assert((await page.locator('#main').innerText()).includes('Recommended build'));
      await page.locator('[data-hero-tab="counters"]').click();
      assert(!(await page.locator('#main').innerText()).includes('This view could not render'));
      for(const route of ['builds','planner','draft','live','guidance']) {
        if (!await page.locator('[data-route="'+route+'"]').isVisible()) await page.locator('#menu-toggle').click();
        await page.locator('[data-route="'+route+'"]').click();
        assert((await page.locator('.rank-evidence').innerText()).includes('Diamond+'));
        assert.equal(await page.locator('#main h1').count(),1);
      }
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>B&&!latestStatus.busy);
      assert.equal(await page.locator('#bracket').inputValue(),'diamond');
      assert.equal(await page.locator('h1').innerText(),'Diamond+ meta');
      const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;
      const exported=path.join(root,'qa',engine+'-'+viewport.width+'-diamond.html');await download.saveAs(exported);
      const snapshot=await context.newPage();await snapshot.goto('file:///'+exported.replace(/\\/g,'/'));
      assert.equal(await snapshot.locator('h1').innerText(),'Diamond+ meta');
      assert.equal(await snapshot.evaluate(()=>B.bracket.segment),'diamond');await snapshot.close();
      await page.screenshot({path:path.join(root,'qa',engine+'-'+viewport.width+'-diamond.png')});
      assert.deepEqual(errors,[]);receipt.runs.push({viewport,cohorts:rows,roleTables:30,export:'Diamond+ preserved',errors});
      await context.close();
    }
    fs.writeFileSync(path.join(root,'qa',engine+'-rank-acceptance.json'),JSON.stringify(receipt,null,2));
    console.log(JSON.stringify({engine,viewports:receipt.runs.length,roleTables:60,status:'passed'}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
