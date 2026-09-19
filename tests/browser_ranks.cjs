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
      // At 700px and below the app renders its phone presentation (2.22 companion, 2.23 Meta dashboard):
      // role chips and a Top five dashboard replace the sortable role table.
      const phone=viewport.width<=700;
      await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>B&&!latestStatus.busy);
      const rows=[];
      for(const bracket of ['gold','bronze','silver','platinum','diamond','paragon']) {
        await page.locator('#bracket').selectOption(bracket);
        await page.waitForFunction(b=>B&&!latestStatus.busy&&B.bracket.segment===b,bracket);
        const cohort=await page.evaluate(()=>({segment:B.bracket.segment,label:B.scoped_statistics.bracket_label,
          rankIds:B.scoped_statistics.ranks,at:B.generated_at,steel:E.performance({slug:'steel',role:'jungle'}),
          validBuilds:Object.keys(E.heroes).filter(s=>E.roles(s).includes('jungle')&&E.plannedBuild(s,'jungle').kind==='reviewed').length}));
        assert.equal(cohort.segment,bracket); assert(cohort.validBuilds>0);
        assert((await page.locator('#patch-strip').innerText()).toLowerCase().includes(cohort.label.toLowerCase()),'patch strip names the selected rank (the strip is styled uppercase)');
        if(!phone&&viewport.width>=1440) {
          // 2.28.0: every rank keeps the desktop status chrome compact (the same measure as audit probe V8): one patch-strip
          // row, and at most 132 px above the page excluding material notices, which are always shown.
          const chromeSize=await page.evaluate(()=>{const cells=[...document.querySelectorAll('#patch-strip .patch-cell')].map(c=>Math.round(c.getBoundingClientRect().top)),material=document.querySelector('#material-notices');
            return {rows:new Set(cells).size,above:Math.round(document.querySelector('#main').getBoundingClientRect().top+scrollY-(material?material.getBoundingClientRect().height:0))};});
          assert.equal(chromeSize.rows,1,bracket+': the patch strip stays on one row at '+viewport.width+' px');
          assert(chromeSize.above<=132,bracket+': status chrome above the page is '+chromeSize.above+' px excluding material notices (at most 132)');
          cohort.chrome=chromeSize;
        }
        for(const role of ['jungle','offlane','midlane','carry','support']) {
          await page.locator((phone?'[data-mobile-role="':'[data-meta-role="')+role+'"]').click();
          const result=await page.evaluate(phone=>{
            const source=B.scoped_statistics.rows.filter(r=>r.role===S.role);
            const nodes=phone?[...document.querySelectorAll('#main section')].find(s=>s.querySelector('h2')?.textContent==='Top five').querySelectorAll('.mobile-hero-card'):document.querySelectorAll('.meta-table tbody tr');
            const table=[...nodes].map(tr=>({slug:tr.querySelector('[data-hero]').dataset.hero,text:tr.innerText}));
            return {source:source.map(r=>({slug:r.slug,wr:pct(r.winRate),games:num(r.matches,0)})),table,roleLabel:labels[S.role]};
          },phone);
          if(phone) {
            assert(result.table.length>0&&result.table.length<=5,'phone dashboard lists up to five leading heroes');
            for(const tile of result.table) {const row=result.source.find(r=>r.slug===tile.slug);assert(row,'phone tile comes from the selected rank rows');assert(tile.text.includes(row.wr));assert(tile.text.includes(row.games));}
          } else {
            assert.equal(result.table.length,result.source.length);
            for(const row of result.source) {const actual=result.table.find(r=>r.slug===row.slug);assert(actual.text.includes(row.wr));assert(actual.text.includes(row.games));}
          }
          if(bracket!=='gold'&&phone) {
            const home=await page.locator('#main').innerText();
            assert.equal(await page.locator('#main h1').innerText(),result.roleLabel+' at a glance');
            assert(home.includes('Role performance in '+cohort.label),'phone dashboard names the selected rank');
            assert.equal(await page.locator('#main [data-meta-decision]').count(),0);
            assert(!home.includes('Review unavailable'));
            assert(home.includes('Gold+ editorial guidance remains separate'),'phone keeps the authored Gold+ reference separate');
          } else if(bracket!=='gold') {
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
      if(phone) {
        // No sortable table or uncertainty columns on the phone; its finder searches within the chosen role.
        await page.locator('[data-mobile-role="jungle"]').click();
        await page.locator('#mobile-hero-search').fill('Steel');
        const found=page.locator('#main section').filter({has:page.locator('h2',{hasText:'Search results'})}).locator('.mobile-hero-card');
        assert.equal(await found.count(),1);
        await found.locator('[data-hero="steel"]').first().click();
      } else {
        await page.locator('[data-meta-role="jungle"]').click();
        await page.locator('[data-sort="matches"]').click();
        assert(await page.evaluate(()=>S.sort==='matches'&&S.direction===-1));
        await page.locator('#full-metrics').check();assert((await page.locator('.meta-table thead').innerText()).includes('95%'));
        await page.locator('#hero-search').fill('Steel');assert.equal(await page.locator('.meta-table tbody tr').count(),1);
        await page.locator('.meta-table [data-hero="steel"]').first().click();
      }
      assert.equal(await page.locator('h1').innerText(),'Steel');
      // The phone hero page names the rank in its header rather than in the desktop rank-evidence note.
      assert((await page.locator(phone?'#main':'.rank-evidence').innerText()).includes('Diamond+'));
      await page.locator('[data-hero-tab="builds"]').click();
      assert((await page.locator('#main').innerText()).includes('Recommended build'));
      await page.locator('[data-hero-tab="counters"]').click();
      assert(!(await page.locator('#main').innerText()).includes('This view could not render'));
      for(const route of ['builds','planner','draft','live','guidance']) {
        // Desktop and phone navigation both carry data-route since 2.22; use whichever is visible.
        const link = page.locator('[data-route="'+route+'"]:visible').first();
        if (!await link.count()) await page.locator('#menu-toggle').click();
        await link.click();
        // The compact phone Builds view names the rank in its eyebrow (styled uppercase, so read textContent); the phone
        // Live view has no rank note, and the rank selector stays on screen instead.
        if(phone&&route==='builds') assert((await page.locator('#main .page-head').textContent()).includes('Builds · Diamond+'));
        else if(phone&&route==='live') assert.equal(await page.locator('#bracket:visible').inputValue(),'diamond');
        else assert((await page.locator('.rank-evidence').innerText()).includes('Diamond+'));
        assert.equal(await page.locator('#main h1').count(),1);
      }
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>B&&!latestStatus.busy);
      assert.equal(await page.locator('#bracket').inputValue(),'diamond');
      // Since 2.22 a reload reopens the section named in the address (#view=guidance) instead of falling back to Meta.
      assert.equal(await page.evaluate(()=>S.route),'guidance');
      assert((await page.locator('.rank-evidence').innerText()).includes('Diamond+'));
      await page.locator('[data-route="meta"]:visible').first().click();
      const metaHeading=phone?'Jungle at a glance':'Diamond+ meta';
      assert.equal(await page.locator('#main h1').innerText(),metaHeading);
      if(phone) assert((await page.locator('#main').innerText()).includes('Role performance in Diamond+'));
      // On the phone, Export snapshot lives under More.
      if(phone) await page.locator('#menu-toggle').click();
      const downloadEvent=page.waitForEvent('download');await page.locator('#export:visible').click();const download=await downloadEvent;
      const exported=path.join(root,'qa',engine+'-'+viewport.width+'-diamond.html');await download.saveAs(exported);
      const snapshot=await context.newPage();await snapshot.goto('file:///'+exported.replace(/\\/g,'/'));
      assert.equal(await snapshot.locator('#main h1').innerText(),metaHeading);
      assert.equal(await snapshot.evaluate(()=>B.bracket.segment),'diamond');await snapshot.close();
      await page.screenshot({path:path.join(root,'qa',engine+'-'+viewport.width+'-diamond.png')});
      assert.deepEqual(errors,[]);receipt.runs.push({viewport,presentation:phone?'phone dashboard':'desktop table',cohorts:rows,[phone?'roleDashboards':'roleTables']:30,export:'Diamond+ preserved',errors});
      await context.close();
    }
    fs.writeFileSync(path.join(root,'qa',engine+'-rank-acceptance.json'),JSON.stringify(receipt,null,2));
    console.log(JSON.stringify({engine,viewports:receipt.runs.length,roleTables:30,roleDashboards:30,status:'passed'}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
