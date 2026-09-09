'use strict';
// Design acceptance against the local static preview: hierarchy, affordance, contrast and layout targets from the
// six-critic review. Observations are never modified; every check reads the rendered DOM of the real app.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),url=process.env.PREVIEW_URL||'http://127.0.0.1:12928/project/';
const lum=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)];return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const toHex=rgb=>{const m=rgb.match(/\d+/g);return m?'#'+m.slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):null;};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--disable-gpu']});
 const report={engine:'Microsoft Edge on Windows',version:browser.version(),runs:[]};
 try{
  // 1536×864 at 1.25 device scale approximates Windows 125% scaling on a 1920×1080 monitor (browser emulation, not native scaling).
  for(const viewport of [{width:1920,height:1080,scale:1},{width:2560,height:1440,scale:1},{width:1536,height:864,scale:1.25}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.scale}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:60000});
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';S.liveContexts={};save();});
   await page.locator('#bracket').selectOption('gold');await page.waitForFunction(()=>B&&!latestStatus.busy&&B.bracket.segment==='gold');
   const run={viewport,checks:[],errors};const check=(v,label)=>{assert(v,label+' @'+viewport.width);run.checks.push(label);};
   const route=async r=>{await page.evaluate(r=>document.querySelector('[data-route="'+r+'"]').click(),r);await page.evaluate(()=>window.scrollTo(0,0));};
   // Hierarchy: the first data row on Meta sits inside the first screen; the status stack stays compact.
   await route('meta');
   const firstRow=await page.evaluate(()=>document.querySelector('.meta-table tbody tr').getBoundingClientRect().top+scrollY);
   check(firstRow<=520,'meta first data row within the first screen (y='+Math.round(firstRow)+')');
   check(await page.evaluate(()=>document.querySelector('#main').getBoundingClientRect().top+scrollY<=240),'status chrome above main is at most 240px');
   check(await page.evaluate(()=>getComputedStyle(document.querySelector('#progress.failed')||document.querySelector('#progress')).color!=='rgb(255, 138, 154)'),'retained-data notice is amber, red is reserved for hard failures');
   check((await page.locator('#source-notices').textContent()).includes('Source failure'),'named source failure stays visible');
   check(await page.locator('.meta-aside .role-priority').count()===1,'reviewed working pool moved beside the table');
   // Affordance: hero names are links, chips are flat, the reviewed tier is a button with a text cue.
   check(await page.evaluate(()=>getComputedStyle(document.querySelector('.meta-table .text-button.hero-cell .name')).textDecorationLine.includes('underline')),'hero names carry link styling');
   check(await page.evaluate(()=>[...document.querySelectorAll('.tag')].every(t=>getComputedStyle(t).borderTopWidth==='0px')),'status chips are flat, never bordered');
   check(await page.evaluate(()=>document.querySelector('[data-meta-decision] small')!==null),'reviewed tier button explains itself');
   // Contrast: control borders and inputs use the verified 3:1 border against the page and their own fill.
   const border=await page.evaluate(()=>getComputedStyle(document.querySelector('#bracket')).borderTopColor);
   const bg=await page.evaluate(()=>getComputedStyle(document.querySelector('#bracket')).backgroundColor);
   check(ratio(toHex(border),toHex(bg))>=3,'select border ≥3:1 against its fill');
   const muted=await page.evaluate(()=>getComputedStyle(document.querySelector('.footer')||document.querySelector('small')).color);
   const panelBg=await page.evaluate(()=>getComputedStyle(document.querySelector('.panel')).backgroundColor);
   check(ratio(toHex(muted),toHex(panelBg))>=4.5,'muted caption text ≥4.5:1 on panels');
   const pageBg=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
   check(ratio(toHex(border),toHex(pageBg))>=3,'select border ≥3:1 against the page background');
   // Gold economy: at most one filled primary action per main view.
   for(const r of ['meta','builds','planner','draft','live','library','guidance','changes','data']){
    await route(r);
    check(await page.evaluate(()=>[...document.querySelectorAll('#main .primary')].filter(b=>b.offsetParent).length<=1),'at most one primary action on '+r);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow on '+r);
    check(await page.locator('#main h1').count()===1,'one page title on '+r);
    check(await page.evaluate(()=>[...document.querySelectorAll('#main small, #main .footer, #main .note')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)),'no supporting text under 12px on '+r);
   }
   // Hero page: tabs directly under the header; partners first; builds tab shows six slots and the full loadout.
   await route('meta');await page.locator('#main .meta-table [data-hero="steel"]').first().click();
   check(await page.evaluate(()=>{const h=document.querySelector('.hero-header').getBoundingClientRect(),t=document.querySelector('[role=tablist][aria-label="Hero detail"]').getBoundingClientRect();return t.top>h.bottom&&t.top-h.bottom<80;}),'hero tabs sit directly under the hero header');
   check(await page.evaluate(()=>document.querySelector('.partner').getBoundingClientRect().top+scrollY<=700),'first partner card within the first screen');
   check(await page.evaluate(()=>[...document.querySelectorAll('.partner')].slice(0,3).every(c=>c.querySelectorAll('.metric-row strong').length<=2)),'partner cards lead with at most two figures');
   check((await page.locator('.partner').first().innerText()).match(/kit interaction points|Calculated kit fit|kit fit/i)!==null,'partner cards keep the kit-fit evidence');
   check(ratio(toHex(await page.evaluate(()=>getComputedStyle(document.querySelector('.partner .tag')).color)),toHex(panelBg))>=4.5,'chip text ≥4.5:1 on partner cards');
   await page.locator('[data-hero-tab="builds"]').click();
   check(await page.locator('#main .build-path').first().locator('li').count()===6,'six item positions on the recommended build');
   check(await page.locator('#main .loadout-strip').first().locator('>div').count()===5,'augment, Eternal, both blessings and crest visible without opening details');
   check(await page.evaluate(()=>[...document.querySelectorAll('#main summary')].some(s=>s.textContent.startsWith('Full setup, execution and sources'))),'full setup details preserved');
   // Global hero finder: typing a name opens that hero's partners with picks intact.
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'}];save();});
   await page.locator('#hero-jump').fill('Gideon');await page.locator('#hero-jump').dispatchEvent('change');
   check(await page.locator('#main h1').innerText()==='Gideon','hero finder opens the typed hero');
   check(await page.evaluate(()=>S.locks.length===1&&S.locks[0].slug==='steel'),'hero finder keeps locked picks');
   await page.locator('#hero-jump').focus();await page.keyboard.press('Tab');
   check(await page.evaluate(()=>document.activeElement&&document.activeElement!==document.body&&document.activeElement.id!=='hero-jump'),'finder does not trap focus');
   // Planner and Live game: pickers and the "you are playing" control appear inside the first screen.
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'},{slug:'gideon',role:'midlane'}];S.size=5;S.me='steel';save();});
   await route('planner');
   check(await page.evaluate(()=>document.querySelector('.slots').getBoundingClientRect().top+scrollY<=innerHeight),'planner slots inside the first viewport');
   await page.evaluate(()=>{S.enemies=[{slug:'khaimera',role:'jungle'}];save();});await route('live');
   check(await page.evaluate(()=>{const s=document.querySelector('#me-hero');return s&&getComputedStyle(s).borderTopColor!==getComputedStyle(document.querySelector('.slot select')).borderTopColor;}),'"you are playing" control is visually distinct from roster selects');
   check(await page.evaluate(()=>document.querySelector('#me-hero').getBoundingClientRect().top+scrollY<=innerHeight+200),'"you are playing" near the picks');
   // Sources: a computed verdict leads; the full source table and drill-downs remain.
   await route('data');
   check(await page.locator('.verdict>div').count()===4,'sources page leads with a four-part computed verdict');
   check((await page.locator('.verdict').innerText()).includes('sources ok'),'verdict counts sources from the bundle');
   check(await page.locator('.source-table tbody tr').count()>=5,'source status table retained');
   check(await page.locator('#compare-bracket').count()===1,'rank comparison control retained');
   // Library: compact rows instead of oversized tiles.
   await route('library');
   check(await page.evaluate(()=>{const cards=[...document.querySelectorAll('.library-grid .panel')];return cards.length>100&&cards.every(c=>c.getBoundingClientRect().height<=96);}),'item catalogue rows are compact');
   // Keyboard: role tabs respond to arrow keys; disclosures open with the keyboard.
   await route('meta');await page.locator('[data-meta-role="jungle"]').focus();await page.keyboard.press('ArrowRight');
   check(await page.evaluate(()=>S.role==='offlane'),'arrow keys move role tabs');await page.locator('[data-meta-role="jungle"]').click();
   await page.locator('.meta-aside details summary').first().focus();await page.keyboard.press('Enter');
   check(await page.evaluate(()=>document.querySelector('.meta-aside details').open),'details open from the keyboard');
   check(await page.evaluate(()=>{const s=document.querySelector('.meta-aside details summary'),style=getComputedStyle(s);return document.activeElement===s&&style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2;}),'focus style defined');
   // Missing image fallback keeps the name readable.
   check(await page.evaluate(()=>{const p=document.querySelector('.portrait');const img=p.querySelector('img');if(img)img.dispatchEvent(new Event('error',{bubbles:true}));return p.textContent.trim().length>=2;}),'portrait fallback keeps a readable label');
   check(errors.length===0,'no page JavaScript errors');
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';S.liveContexts={};save();});
   report.runs.push(run);await context.close();
  }
  // ---- revision 2: phone pass (390×844) — chrome budget, visible navigation, touch targets, single-line figures.
  {
   const viewport={width:390,height:844,scale:2};
   const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:60000});
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';S.liveContexts={};save();});
   if(await page.locator('#bracket').inputValue()!=='gold'){await page.locator('#bracket').selectOption('gold');await page.waitForFunction(()=>B&&!latestStatus.busy&&B.bracket.segment==='gold');}
   const run={viewport,checks:[],errors};const check=(v,label)=>{assert(v,label+' @phone');run.checks.push(label);};
   const route=async r=>{await page.evaluate(r=>document.querySelector('[data-route="'+r+'"]').click(),r);await page.evaluate(()=>window.scrollTo(0,0));};
   await route('meta');
   check(await page.evaluate(()=>document.querySelector('#main').getBoundingClientRect().top+scrollY<=430),'phone chrome above main is at most 430px');
   check(await page.evaluate(()=>document.querySelector('.meta-table tbody tr').getBoundingClientRect().top+scrollY<=900),'phone: first data row within about one screen');
   check(await page.evaluate(()=>['meta','builds','planner','draft','live'].every(r=>{const b=document.querySelector('[data-route="'+r+'"]').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth+1&&b.top>=0;})),'phone: the five planning routes are visible without a menu tap');
   check(await page.evaluate(()=>document.querySelector('#menu-toggle').offsetParent===null),'phone: menu button retired (still in the DOM)');
   check(await page.evaluate(()=>{const nav=document.querySelector('#navigation');return nav.scrollWidth>nav.clientWidth;}),'phone: remaining routes reachable by scrolling the row');
   check(await page.evaluate(()=>[...document.querySelectorAll('.nav, .topbar .tools button, #status-toggle, #theme-toggle')].filter(b=>b.offsetParent!==null).every(b=>b.getBoundingClientRect().height>=36)),'phone: every shell control at least 36px tall');
   check(await page.evaluate(()=>{const r=document.querySelector('#bracket').getBoundingClientRect(),f=document.querySelector('#hero-jump').getBoundingClientRect();return Math.abs(r.top-f.top)<4&&f.right<=innerWidth+1&&r.width>=110;}),'phone: rank and finder share one row inside the viewport');
   check(await page.evaluate(()=>!!(document.querySelector('#bracket').getAttribute('aria-label')&&document.querySelector('#hero-jump').getAttribute('aria-label'))),'phone: hidden label text is replaced by accessible names');
   check((await page.locator('#source-notices').textContent()).includes('Source failure'),'phone: named source failure stays visible');
   for(const r of ['meta','builds','planner','draft','live','library','guidance','changes','data']){
    await route(r);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone: no horizontal overflow on '+r);
    check(await page.evaluate(()=>[...document.querySelectorAll('#main small, #main .footer, #main .note')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)),'phone: no supporting text under 12px on '+r);
   }
   await route('meta');await page.locator('#main .meta-table [data-hero="steel"]').first().click();
   check(await page.evaluate(()=>{const t=[...document.querySelectorAll('.hero-header .quick-stats>div')].map(d=>d.getBoundingClientRect());return t.length===2&&Math.abs(t[0].top-t[1].top)<2&&t[1].right<=innerWidth+1;}),'phone: hero evidence tiles sit side by side');
   check(await page.evaluate(()=>document.querySelector('[role=tablist][aria-label="Hero detail"]').getBoundingClientRect().top+scrollY<=900),'phone: hero tabs within about one screen');
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'},{slug:'gideon',role:'midlane'}];S.size=5;S.me='steel';save();});await route('planner');
   await page.locator('#generate').click();await page.waitForFunction(()=>compositions?.alternatives?.length>0,{},{timeout:60000});
   check(await page.evaluate(()=>[...document.querySelectorAll('.comp-card .metric-row strong')].slice(0,8).every(s=>s.getBoundingClientRect().height<=30)),'phone: headline figures stay on one line');
   await page.evaluate(()=>{S.enemies=[{slug:'khaimera',role:'jungle'}];save();});await route('live');
   check(await page.evaluate(()=>{const b=[...document.querySelectorAll('.section-title button')];return b.length>0&&b.every(x=>x.getBoundingClientRect().height<=48);}),'phone: section actions stay on one line');
   await route('data');
   check(await page.evaluate(()=>[...document.querySelectorAll('.source-table th')].every(th=>th.getBoundingClientRect().height<=40)),'phone: source table headers never split mid-word');
   check(errors.length===0,'phone: no page JavaScript errors');
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';S.liveContexts={};save();});
   report.runs.push(run);await context.close();
  }
  // ---- revision 2: light theme — opt-in toggle, persistence, and the same contrast floors measured live.
  {
   const viewport={width:1920,height:1080,scale:1,theme:'light'};
   const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:60000});
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';S.liveContexts={};save();});
   if(await page.locator('#bracket').inputValue()!=='gold'){await page.locator('#bracket').selectOption('gold');await page.waitForFunction(()=>B&&!latestStatus.busy&&B.bracket.segment==='gold');}
   const run={viewport,checks:[],errors};const check=(v,label)=>{assert(v,label+' @light');run.checks.push(label);};
   const route=async r=>{await page.evaluate(r=>document.querySelector('[data-route="'+r+'"]').click(),r);await page.evaluate(()=>window.scrollTo(0,0));};
   check(await page.evaluate(()=>!document.documentElement.hasAttribute('data-theme')),'default theme is dark');
   check(await page.locator('#theme-toggle').textContent()==='Light theme','toggle offers the light theme');
   await page.locator('#theme-toggle').click();
   check(await page.evaluate(()=>document.documentElement.getAttribute('data-theme')==='light'),'toggle switches to light');
   check(await page.locator('#theme-toggle').textContent()==='Dark theme'&&await page.locator('#theme-toggle').getAttribute('aria-pressed')==='true','toggle reports its state');
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!B&&!latestStatus.busy,{timeout:60000});
   check(await page.evaluate(()=>document.documentElement.getAttribute('data-theme')==='light'),'light theme persists across reload');
   check(await page.evaluate(()=>localStorage.getItem('predecessor-theme')==='light'&&!/theme/.test(localStorage.getItem('predecessor-planner-v2')||'')),'theme stored separately from the saved plan');
   await route('meta');
   const pageBg=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
   check(lum(toHex(pageBg))>0.6,'light theme paints a light page');
   const panelBg=await page.evaluate(()=>getComputedStyle(document.querySelector('.panel')).backgroundColor);
   const col=async sel=>toHex(await page.evaluate(s=>getComputedStyle(document.querySelector(s)).color,sel));
   check(ratio(await col('small'),toHex(panelBg))>=4.5,'light: muted caption text ≥4.5:1 on panels');
   check(ratio(await col('#main a'),toHex(panelBg))>=4.5,'light: links ≥4.5:1 on panels');
   check(ratio(await col('.brand small'),toHex(await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).backgroundColor)))>=4.5,'light: brass text ≥4.5:1 on the rail');
   const border=await page.evaluate(()=>getComputedStyle(document.querySelector('#bracket')).borderTopColor),fill=await page.evaluate(()=>getComputedStyle(document.querySelector('#bracket')).backgroundColor);
   check(ratio(toHex(border),toHex(fill))>=3&&ratio(toHex(border),toHex(pageBg))>=3,'light: rank select border ≥3:1 against fill and page');
   check(ratio(toHex(await page.evaluate(()=>getComputedStyle(document.querySelector('#bracket')).color)),toHex(fill))>=4.5,'light: rank select text ≥4.5:1');
   const ctrl=await page.evaluate(()=>getComputedStyle(document.querySelector('#hero-jump')).borderTopColor);
   check(ratio(toHex(ctrl),toHex(pageBg))>=3,'light: control borders ≥3:1 against the page');
   check(ratio(toHex(await page.evaluate(()=>getComputedStyle(document.querySelector('#refresh')).color)),toHex(await page.evaluate(()=>getComputedStyle(document.querySelector('#refresh')).backgroundColor)))>=4.5,'light: refresh action text ≥4.5:1');
   await page.locator('#main .meta-table [data-hero="steel"]').first().click();
   for(const cls of ['observed','calculated','reviewed']){
    const c=await page.evaluate(k=>{const t=document.querySelector('.tag.'+k);if(!t)return null;let el=t;while(el&&getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)')el=el.parentElement;return [getComputedStyle(t).color,el?getComputedStyle(el).backgroundColor:null];},cls);
    if(c&&c[1]&&!c[1].startsWith('rgba('))check(ratio(toHex(c[0]),toHex(c[1]))>=4.5,'light: '+cls+' chip text ≥4.5:1 on its surface');
   }
   for(const r of ['meta','builds','planner','draft','live','library','guidance','changes','data']){
    await route(r);
    check(await page.evaluate(()=>[...document.querySelectorAll('#main .primary')].filter(b=>b.offsetParent).length<=1),'light: at most one primary action on '+r);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'light: no horizontal overflow on '+r);
   }
   await page.evaluate(()=>{S.locks=[{slug:'steel',role:'jungle'}];S.enemies=[{slug:'khaimera',role:'jungle'}];S.size=5;save();});await route('live');
   check(ratio(await col('.slot.enemy label'),toHex(await page.evaluate(()=>getComputedStyle(document.querySelector('.slot.enemy')).backgroundColor)))>=4.5,'light: enemy slot labels ≥4.5:1');
   await page.locator('#theme-toggle').click();
   check(await page.evaluate(()=>!document.documentElement.hasAttribute('data-theme')&&localStorage.getItem('predecessor-theme')==='dark'),'toggle returns to dark and remembers it');
   check(errors.length===0,'light: no page JavaScript errors');
   await page.evaluate(()=>{S.locks=[];S.enemies=[];S.bans=[];S.me='';S.liveContexts={};save();localStorage.removeItem('predecessor-theme');});
   report.runs.push(run);await context.close();
  }
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});
  fs.writeFileSync(path.join(root,'qa','edge-design-acceptance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({engine:report.engine,runs:report.runs.map(r=>({viewport:r.viewport,checks:r.checks.length}))}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
