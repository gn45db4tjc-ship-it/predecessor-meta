/* Approved companion flow, on top of the existing data, history and dialog systems. */
'use strict';
for(const key of ['selectedBuilds','heroPools'])if(!companionPrefs[key]||typeof companionPrefs[key]!=='object'||Array.isArray(companionPrefs[key]))companionPrefs[key]={};
let quickAlternative=false;
const fullMobileHero=mobileHero;
const standardNavigation=destinationNavigation,standardSections=destinationSections;
const simpleMode=()=>companionMedia.matches&&!companionPrefs.fullDetails;
function buildSelection(p){const ref=companionPrefs.selectedBuilds[p.slug+'|'+p.role];if(!ref&&S.liveVariant!=null&&S.me===p.slug&&S.locks.some(a=>a.slug===p.slug&&a.role===p.role))return {status:'invalid',index:null,reason:'A playstyle saved by the previous app needs to be chosen again. Its old variant number cannot identify the same build after an update.'};return CompanionState.resolve(B,E,ref,p.slug,p.role);}
function chosenPlan(p){const choice=buildSelection(p);return choice.status==='selected'?choice.plan:choice.status==='invalid'?{slug:p.slug,role:p.role,kind:'unavailable',items:[],core:[],blessings:[],reason:choice.reason,review:E.buildReview(p.slug,p.role)}:E.plannedBuild(p.slug,p.role);}
function choosePlaystyle(p,index){const key=p.slug+'|'+p.role;if(index===null)delete companionPrefs.selectedBuilds[key];else companionPrefs.selectedBuilds[key]=CompanionState.reference(B,E,p.slug,p.role,index);saveCompanionPrefs();if(S.me===p.slug&&S.locks.some(a=>a.slug===p.slug&&a.role===p.role))S.liveVariant=null;save();}
// An old numeric override blocks its own hero/role until an explicit choice clears it.
adviceFor=function(p){const choice=buildSelection(p),enemies=coachEnemies(p),ctx={...contextFor(p)};if(choice.status==='invalid')throw Error(choice.reason);if(ctx.primaryThreat&&!enemies.some(e=>e.slug===ctx.primaryThreat))delete ctx.primaryThreat;return E.adaptBuild(p,S.locks.filter(a=>a.slug!==p.slug).concat(p),enemies,{...ctx,variant:choice.index});};
destinationNavigation=function(phone){
 if(!phone)return standardNavigation(phone);
 const current=['match','planner','draft','live'].includes(S.route)?'match':['meta','hero'].includes(S.route)?'meta':'more';
 return [['meta','Meta','meta'],['match','Match','match'],['more','More','more']].map(([id,label,route])=>`<button class="nav" data-destination="${id}" data-route="${route}" ${companionMedia.matches&&current===id?'aria-current="page"':''}>${destinationIcon(id)}<span>${label}</span></button>`).join('');
};
destinationSections=function(){
 if(companionMedia.matches&&['builds','more','data','library','guidance','changes'].includes(S.route))return '';
 return standardSections();
};
function detailModeButton(){return `<button class="quiet" data-reading-mode>${companionPrefs.fullDetails?'Quick companion view':'Full details'}</button>`;}
// 2.50.0: full details is a reading mode the reader chose; its exit leads every page it changes (hero and Meta), so
// leaving it never means scrolling to the end of a 16,000 px page.
function readingModeBar(){return companionPrefs.fullDetails?`<div class="reading-mode-bar"><span>Full details</span><button class="quiet" data-reading-mode>Quick companion view</button></div>`:'';}
function planDate(plan){const review=plan.kind==='reviewed'?plan:previousReviewedBuild(plan.review);return `<p class="simple-source ${plan.kind!=='reviewed'?'warning':''}">${plan.kind==='reviewed'?'Reviewed':'Previous guidance'} ${esc(dayDate(review?.reviewed_at))} · patch ${esc(review?.patch||'unverified')}${!review?.patch_review&&E.strategyReviewDue().due?' · review due':''}${plan.manual?' · selected source playstyle remains a calculated sequence':''}</p>`;}
function simpleSetup(plan){return `<div class="simple-setup">${[['Augment',plan.augment,'perks'],['Eternal',plan.eternal,'perks'],['Blessing 1',plan.blessings?.[0],'perks'],['Blessing 2',plan.blessings?.[1],'perks'],['Crest',plan.crest,'items']].map(([label,n,kind])=>`<div><small>${label}</small>${n?itemButton(n,kind):'<strong>Unavailable</strong>'}</div>`).join('')}</div>`;}
function simplePurchases(plan){
 const items=plan.items||[],core=Math.min(plan.core?.length||0,items.length);
 const group=(label,from,to)=>to>from?`<h4 class="purchase-group">${label} · ${to-from>1?(from+1)+'–'+to:from+1}</h4><ol class="simple-purchases" start="${from+1}">${items.slice(from,to).map((n,j)=>`<li><span class="simple-position">${from+j+1}</span>${itemButton(n)}</li>`).join('')}</ol>`:'';
 return group('Core',0,core)+group('Flexible',core,items.length);
}
// 2.37.0 phone build card: the six items once (Core, then Flexible), the loadout in one row, and one provenance
// line whose dialog holds the category, dates, reason, alternatives and sources. Nothing is dropped, only moved.
// 2.50.0: the sheet states the date and scope once; the plan card below it carries the category, the reason and the
// loadout samples (the six items stay on the page behind the sheet, so the card leaves them out).
function buildAboutHTML(plan){
 return `${planDate(plan)}${plan.patch_review?'<p class="simple-source">Patch-reviewed starting point · current-patch build statistics unavailable.</p>':''}<p class="simple-source">${plan.kind==='reviewed'?'Reviewed choices':'Calculated selection'} · no whole-loadout win rate is claimed.</p><div class="detail-content">${plannedBuildHTML(plan,false,false,{items:false})}</div>`;
}
function simpleBuildHTML(p){
 const plan=chosenPlan(p),choice=buildSelection(p),category=plan.manual?{text:'Calculated sequence',type:'calculated'}:buildCategory(plan);
 const review=plan.kind==='reviewed'?plan:previousReviewedBuild(plan.review),key=esc(p.slug+'|'+p.role);
 const invalid=choice.status==='invalid'?note(esc(choice.reason),true)+`<button data-reset-playstyle="${key}">Use the available starting plan</button>`:'';
 if(!plan.items.length)return `<section class="panel simple-build" data-selected-plan="${key}"><h2>Starting build</h2>${invalid}${note(esc(plan.reason||'No eligible current build. Previous guidance remains available below.'),true)}${previousBuildHTML(plan)}</section>`;
 return `<section class="panel simple-build simple-build--compact" data-selected-plan="${key}"><h2 class="sr-only">Starting build</h2>${invalid}${simplePurchases(plan)}${simpleSetup(plan)}<button type="button" class="build-about" data-build-about="${key}">${badge(category.text,category.type)}<span>${esc(dayDate(review?.reviewed_at))} · ${esc(review?.patch||'unverified')}</span><span class="build-about-more">Why this build ›</span></button></section>`;
}
// One line of observed context: the saved-date badge replaces the fetch date instead of repeating it.
function compactRoleText(perf,rate=true){const saved=savedTag(perf.fetched_at,perf.retained);return saved+(rate?pct(perf.wr)+' · ':'')+games(perf.played)+' · '+esc(perf.source)+' '+esc(perf.patch||'')+(saved?'':' · '+esc(dayDate(perf.fetched_at)))+(perf.inspection_only?' · previous dataset':'');}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-build-about]');if(!el)return;event.preventDefault();event.stopImmediatePropagation();
 const [slug,role]=el.dataset.buildAbout.split('|');detail(name(slug)+' · '+labels[role]+' · why this build',buildAboutHTML(chosenPlan({slug,role})));
},true);
// Rows follow the in-game ability bar; the ultimate sits last so its 6/11/16 ticks read as a separate line.
const SKILL_CHART_ROWS=['Primary','Secondary','Alternate','Ultimate'];
function skillChartHTML(plan,guide){
 const abilities=Object.fromEntries((B.heroes?.[plan.slug]?.abilities||[]).map(a=>[a.key,a])),rank={};
 const all=guide.points.map(p=>({...p,rank:rank[p.token]=(rank[p.token]||0)+1}));
 // 2.50.0: a phone draws levels 1-9 and 10-18 as two tables, so every level is on screen (levels 13-18, with the
 // third ultimate point, used to sit off to the side with no sign they were there). Wider screens keep one table.
 const halves=companionMedia.matches&&all.length>9?[all.slice(0,9),all.slice(9)]:[all];
 const table=cells=>{
  const head=cells.map(p=>`<th scope="col" class="skill-chart-level">${p.level}</th>`).join('');
  const rows=SKILL_CHART_ROWS.map(token=>{
   const first=all.find(p=>p.token===token);if(!first)return '';
   const icon=abilities[first.key]?.image_url;
   return `<tr data-skill-row="${esc(token)}"><th scope="row"><span class="skill-chart-ability">${icon?`<img src="${esc(icon)}"${sharpIcon(icon)} alt="" width="24" height="24" loading="lazy">`:''}<span class="skill-chart-name">${esc(first.name)}</span><kbd>${esc(first.key)}</kbd></span></th>${cells.map(p=>p.token===token
    ?`<td class="is-ticked"><span class="skill-box" aria-hidden="true"></span><span class="sr-only">Level ${p.level}, rank ${p.rank}</span></td>`
    :`<td><span class="skill-box" aria-hidden="true"></span></td>`).join('')}</tr>`;
  }).join('');
  const span=cells.length?cells[0].level+(cells.length>1?' to '+cells[cells.length-1].level:''):'';
  return `<table class="skill-chart"><caption class="sr-only">Skill points by hero level for ${esc(name(plan.slug))}${halves.length>1?', levels '+span:''}. Each column is a level; the ticked box is the ability to rank up.</caption><thead><tr><th scope="col" class="skill-chart-corner">Level</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
 };
 const legend=SKILL_CHART_ROWS.map(token=>all.find(p=>p.token===token)).filter(Boolean).map(p=>`<span><kbd>${esc(p.key)}</kbd> ${esc(p.name)}</span>`).join('');
 return `<div class="skill-chart-scroll${halves.length>1?' skill-chart-scroll--split':''}" role="region" aria-label="Skill order chart, levels 1 to 18" tabindex="0">${halves.map(table).join('')}</div><p class="skill-chart-legend" aria-hidden="true">${legend}</p>`;
}
// Build-page alternates by enemy team type (engine teamAlternates): calculated item rules on the reviewed core.
// 2.37.0 phone Kit: every section starts closed. Each ability shows its key, name and first sentence; the full
// card (values, corrections, verification notes) opens on tap. A flagged ability says so in its summary.
function compactKitHTML(h){
 const notes=patchNotes('hero',S.hero).replace('<details open>','<details data-keep="kit-patch-notes">');
 const flagged=(a,i)=>!!a.description_issue||(B.description_reviews||[]).some(r=>r.path?.[0]==='heroes'&&r.path[1]===h.slug&&r.path[2]==='abilities'&&r.path[3]===i);
 const first=t=>{const s=String(t||'').split(/(?<=[.!?])\s+/)[0];return s.length>110?s.slice(0,107)+'…':s;};
 return `<div class="skill-guide-head"><h2>Kit</h2>${badge('Calculated capabilities')}</div>${h.official_kit?sourceLine(h.official_kit.source,h.official_kit.fetched_at,'Official '+h.official_kit.patch+' kit'):''}${notes}${relevantChanges('hero',S.hero).length?note('Only listed corrections are applied to the source fields; use the official notes for other changed values.',true):''}<div class="coverage">${(h.capabilities||[]).map(c=>`<button class="quiet" data-capability="${esc(c)}">${esc(c.replaceAll('_',' '))}</button>`).join('')}</div><div class="kit-abilities">${(h.abilities||[]).map((a,i)=>`<details class="kit-ability" data-keep="kit-ability-${i}"><summary><kbd>${esc(a.key)}</kbd><span><strong>${esc(a.display_name)}</strong>${flagged(a,i)?' · <em>needs verification</em>':''}<small>${esc(first(a.text))}</small></span></summary>${kitAbilityHTML(h,a,i)}</details>`).join('')}</div>${correctionAudit('heroes',S.hero)}`;
}
function teamAlternatesHTML(p){
 const choice=buildSelection(p);if(choice.status==='invalid')return '';
 const memo=teamAlternatesHTML.cache&&teamAlternatesHTML.cache.E===E?teamAlternatesHTML.cache:(teamAlternatesHTML.cache={E,results:new Map()}),key=p.slug+'|'+p.role+'|'+choice.index;
 let r;if(memo.results.has(key))r=memo.results.get(key);else{try{r=E.teamAlternates(p,{variant:choice.index});}catch(e){r=null;}memo.results.set(key,r);}if(!r)return '';
 const head=`<div class="skill-guide-head"><h2>Adapt to the enemy team</h2>${badge('Calculated · item rules','calculated')}</div>`;
 if(!r.available)return `<section class="team-alternates panel" data-team-alternates="${esc(p.slug+'|'+p.role)}">${head}<p class="simple-source">${esc(r.reason)}</p></section>`;
 // 2.37.0: one line per swap; answers already in the build and types with no fitting swap fold into one line each.
 // The qualifying effect is one tap away in the item's own dialog.
 const short={tanky:'Tanky',healing:'Healing',magical:'Magic damage',physical:'Physical damage',burst:'Burst',magic_burst:'Magic burst',shields:'Shields',basic_attacks:'Basic attacks'},label=x=>short[x.id]||x.label;
 const swaps=r.rows.filter(x=>x.status==='swap'),covered=r.rows.filter(x=>x.status==='covered'),none=r.rows.filter(x=>x.status==='none');
 // When every swap replaces the same flexible item, say so once in the intro instead of on each row.
 const froms=[...new Set(swaps.flatMap(x=>x.swaps.map(s=>s.from)))],oneFrom=froms.length===1?froms[0]:'';
 // 2.50.0: types that call for the same swap (Magic damage and Magic burst often do) share one line.
 const shared=new Map();for(const x of swaps)for(const s of x.swaps){const k=(s.to+'|'+s.from).toLowerCase(),g=shared.get(k);if(g){if(!g.types.includes(x))g.types.push(x);}else shared.set(k,{s,types:[x]});}
 const swapRows=[...shared.values()].map(({s,types})=>`<li data-team-type="${esc(types.map(x=>x.id).join(' '))}" data-status="swap"><strong class="team-alt-type">${types.map(x=>esc(label(x))).join(' · ')}</strong><span class="team-alt-change">${itemButton(s.to)}<small${oneFrom?' class="sr-only"':''}>replaces ${esc(s.from)}${s.evidence?`<span class="sr-only"> · ${esc(s.evidence)}</span>`:''}</small></span></li>`).join('');
 const coveredRow=covered.length?`<li data-status="covered"><strong class="team-alt-type">Already covered</strong><small>${covered.map(x=>`${esc(label(x))} (${x.coveredBy.map(esc).join(', ')})`).join(' · ')}${covered.filter(x=>x.earlier).map(x=>` · buy ${esc(x.earlier.item)} earlier, as item ${x.earlier.position}`).join('')}</small></li>`:'';
 const noneRow=none.length?`<li data-status="none"><strong class="team-alt-type">No swap fits</strong><small>${none.map(x=>esc(label(x))).join(' · ')}</small></li>`:'';
 return `<section class="team-alternates panel" data-team-alternates="${esc(p.slug+'|'+p.role)}">${head}<p class="simple-source">${oneFrom?`Against each team type, swap ${esc(oneFrom)} for the item shown`:'One flexible swap per enemy team type'}; the core stays. Calculated, not a win prediction.</p><ul class="team-alt-list">${swapRows}${coveredRow}${noneRow}</ul></section>`;
}
function skillPointsHTML(plan){
 const choice=buildSelection(plan),guide=SkillGuide.make(B,plan,{variantIndex:choice.index}),key=plan.slug+'|'+plan.role;
 if(!guide.points.length)return `<section class="skill-guide panel"><h2>Skill order · unavailable</h2><p>${esc(guide.reason)}</p></section>`;
 const source=guide.source||{};
 return `<section class="skill-guide panel" data-skill-guide="${esc(key)}"><div class="skill-guide-head"><h2>Skill order · levels 1–18</h2>${badge(guide.label,guide.kind==='reviewed'?'reviewed':guide.kind==='observed'?'observed':'calculated')}</div>${skillChartHTML(plan,guide)}<details data-keep="skill-reason"><summary>Why this order & source</summary><p>${esc(guide.reason)}</p>${Number.isFinite(source.wr)&&Number.isFinite(source.played)?`<p>Observed sequence: ${pct(source.wr)} win rate · ${games(source.played)}.</p>`:''}<p class="simple-source">${guide.kind==='observed'?'Statz dataset '+esc(source.patch)+' · fetched '+esc(date(source.fetched_at)):guide.kind==='reviewed'?'Order reviewed '+esc(date(source.reviewed_at)):'Priority reviewed '+esc(date(source.reviewed_at))+'; this exact allocation still needs review.'}${source.url?' · '+link(source.url,'Source'):''}</p>${guide.notes.map(n=>note(esc(n),true)).join('')}</details></section>`;
}
function alternativesHTML(p){
 const stats=B.heroes[p.slug]?.roles?.[p.role],rows=stats?.builds||[];
 return `<h2>Alternative playstyles</h2><p>Observed variants, not a best-build ranking. A six-item path assembled from these rows is calculated.</p>${rows.length?`<p class="simple-source">Dataset ${esc(B.patch)} · fetched ${esc(dayDate(stats.fetched_at))} · exact match window unconfirmed.</p>`:''}<button data-reset-playstyle="${esc(p.slug+'|'+p.role)}">Use the available starting plan</button>${rows.map((b,index)=>{const plan=E.plannedBuild(p.slug,p.role,{index,forceObserved:true});return `<article class="panel">${badge('Observed variant · Statz','observed')}<h3>${esc(b.perk)} / ${esc(b.eternal)}</h3><p>${pct(b.winRate)} win rate · ${games(b.playedGames)}</p><details><summary>Inspect loadout and purchase path</summary>${simpleSetup(plan)}${simplePurchases(plan)}<p>${esc(plan.caution)}</p></details><button class="primary" data-choose-playstyle="${esc(p.slug+'|'+p.role+'|'+index)}">Choose this playstyle</button></article>`;}).join('')||empty('No source playstyles for this role.')}`;
}
function simplePartnersHTML(p){
 const partners=E.partners(p.slug,{min:100,heroRole:p.role,metric:'kit'}),rows=RecommendationView.partnerShortlist(partners.combined,5);
 // 2.37.0: the kit score and the evidence button share one row, and the "no observed pair" line is said once below the cards.
 const noPair=rows.filter(r=>!r.pair).length;
 const foot=rows.length?`<p class="simple-source partner-footnote">${noPair===rows.length?'No eligible observed pair sample for these partners; they are based on kits. ':noPair?`${noPair} of ${rows.length} have no eligible observed pair sample and are based on kits. `:''}Pair samples are hero-wide, not role-specific; missing evidence is unknown.</p>`:'';
 return `<h2>Partners for ${esc(name(p.slug))}</h2><p class="simple-source">Kit fit first, with role variety among nearby suggestions.</p>${rows.map(r=>{const pair=r.pair,reason=r.fit?.reasons?.[0];return `<article class="panel simple-partner"><div class="partner-head">${heroButton(r.slug,r.role)}<small>${esc(labels[r.role])}</small></div><p>${esc(reason?.summary||reason?.text||reason||'Inspect supporting abilities.')}</p>${pair?`<p>${pct(pair.wr)} together · ${games(pair.played)} · ${pp(pair.lift)} against the stronger overall baseline.</p>`:''}<div class="partner-foot">${badge('Calculated','calculated')}<span>${num(r.fit?.score,0)} kit points</span><button data-pair="${esc([p.slug,r.slug,p.role,r.role].join('|'))}">Evidence & why</button></div></article>`;}).join('')||empty('No supported partner suggestions.')}${foot}`;
}
function simpleCountersHTML(p){
 const data=RecommendationView.counterplay(E,E.heroes,p.slug,p.role),strategy=data.strategy;
 const observed=data.picks.filter(r=>r.evidenceKind!=='reviewed'),srcKey=r=>(r.label||r.source)+'|'+r.fetched_at,shared=observed.length>1&&observed.every(r=>srcKey(r)===srcKey(observed[0]))?observed[0]:null;
 const obsSource=r=>`${esc(r.label||r.source)} · ${esc(dayDate(r.fetched_at))} · enemy role unconfirmed. Not proof of a hard counter.`;
 return `<h2>Counterplay for ${esc(name(p.slug))}</h2><p>Responses to watch for when playing this hero.</p>${shared?`<p class="simple-source">Observed matchups: ${obsSource(shared)}</p>`:''}${data.picks.map(r=>`<article class="panel">${badge(r.evidenceKind==='reviewed'?'Reviewed counter-pick':'Observed difficult matchup',r.evidenceKind==='reviewed'?'reviewed':'observed')}<h3>${esc(name(r.slug))}</h3>${r.evidenceKind==='reviewed'?`<p>${esc(r.reason)}</p><details class="counter-limit"><summary>Limits · reviewed ${esc(dayDate(r.reviewed_at))}</summary><p>${esc(r.limit||'Execution and team context matter.')}</p></details>`:`<p>${pct(r.wr)} ${esc(name(p.slug))} win rate · ${games(r.played)}</p>${shared?'':`<p class="simple-source">${obsSource(r)}</p>`}`}</article>`).join('')}${!data.picks.length?'<p>No supported named counter in this evidence. That does not mean this hero has no counters.</p>':''}${data.points.length?`<section class="panel">${badge(strategy.active?'Reviewed counterplay':'Previous counterplay · needs review',strategy.active?'reviewed':'warning')}<ol>${data.points.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><small>Reviewed ${esc(dayDate(strategy.reviewed_at))} · patch ${esc(strategy.patch)}</small></section>`:''}<details><summary>All matchups & source evidence</summary>${counterplayHTML(p.slug,p.role)}${supportedMatchupsHTML(p.slug,p.role,E.heroes[p.slug],E.heroes[p.slug].roles?.[p.role])}${exploratoryMatchupsHTML(p.slug,p.role,E.heroes[p.slug],E.heroes[p.slug].roles?.[p.role])}</details>`;
}
mobileHero=function(){
 if(companionPrefs.fullDetails)return readingModeBar()+fullMobileHero();
 const p={slug:S.hero,role:S.heroRole},hero=E.heroes[p.slug];if(!hero)return guidedHome();
 const perf=E.displayPerformance(p),counter=RecommendationView.counterplay(E,E.heroes,p.slug,p.role),tab=['pairings','counters','kit'].includes(S.heroTab)?S.heroTab:quickAlternative?'alternatives':'builds';
 const buttons=[['builds','Build'],['alternatives','Options'],...(counter.available?[['counters','Counters']]:[]),['pairings','Partners'],['kit','Kit']];
 const body=tab==='alternatives'?alternativesHTML(p):tab==='pairings'?patchContextHTML(p.slug,'partners')+simplePartnersHTML(p):tab==='counters'?simpleCountersHTML(p):tab==='kit'?patchContextHTML(p.slug)+compactKitHTML(hero):simpleBuildHTML(p)+skillPointsHTML(chosenPlan(p))+teamAlternatesHTML(p)+patchContextHTML(p.slug);
 const fav=companionPrefs.favorites.includes(p.slug+'|'+p.role);
 return `<div class="hero-header mobile-hero-head mobile-hero-head--compact"${artVars(p.slug)}>${art(p.slug,'large')}<div class="hero-head-main"><h1>${esc(name(p.slug))}</h1><label><span class="sr-only">Role</span><select id="mobile-hero-role" aria-label="Role">${options(E.roles(p.slug).map(r=>[r,labels[r]]),p.role)}</select></label></div><div class="hero-head-actions"><button id="favorite-hero" aria-pressed="${fav}" aria-label="Favorite ${esc(name(p.slug))} ${esc(labels[p.role])}">${star()}</button><button id="share-hero" aria-label="Share ${esc(name(p.slug))}">Share</button></div><button class="primary hero-use-match" data-start-live="true">Use in Match</button></div><p class="simple-source hero-context">${perf&&!perf.inspection_only&&shownTier(p.slug,p.role)?metaTierButton(p.slug,p.role)+' ':''}${perf?`<span class="hero-figure"${wrVars(perf.wr)}><span class="sr-only">Win rate </span>${pct(perf.wr)}</span> <span class="hero-sample">${compactRoleText(perf,false)}</span>`:esc(roleSampleText(p.slug,p.role))}</p><div class="simple-sections tab-strip tab-strip--segmented" role="tablist" aria-label="Hero sections">${buttons.map(([id,label])=>`<button role="tab" data-simple-section="${id}" aria-selected="${id===tab}" tabindex="${id===tab?0:-1}"${id===tab?` aria-controls="hero-sec-${tab==='alternatives'?'builds':tab}"`:''}>${label}</button>`).join('')}</div><section id="hero-sec-${tab==='alternatives'?'builds':tab}" class="simple-hero-section" role="tabpanel" aria-label="${esc(buttons.find(b=>b[0]===tab)?.[1]||'Build')}">${body}</section><div class="simple-actions">${detailModeButton()}</div>`;
};
// A legacy Builds route remains a complete reference page. It is no longer a duplicate primary destination.
const oldRenderCompanion=renderCompanion;
renderCompanion=function(){if(B&&companionMedia.matches&&S.route==='builds'){$('#main').innerHTML=mobileBuilds();return true;}return oldRenderCompanion();};
const oldAfterDestination=afterDestinationRender;
afterDestinationRender=function(){oldAfterDestination();if(B&&companionMedia.matches&&['data','library','guidance','changes','builds'].includes(S.route))$('#main').insertAdjacentHTML('afterbegin','<button class="text-button back-link back" data-route="more">More</button>');};
const oldAfterHero=afterHeroRender;
afterHeroRender=function(){if(simpleMode()&&S.route==='hero')return;oldAfterHero();};
const oldSpySections=spySections;
spySections=function(){if(!simpleMode())oldSpySections();};
const oldOpenHeroSimple=openHero;
openHero=function(...args){quickAlternative=false;oldOpenHeroSimple(...args);};
document.addEventListener('click',event=>{
 const el=event.target.closest('button');if(!el)return;const d=el.dataset;
 const handles=['readingMode','simpleSection','choosePlaystyle','resetPlaystyle'].some(k=>k in d);
 if(!handles)return;event.preventDefault();event.stopImmediatePropagation();
 try{
  if('readingMode' in d){companionPrefs.fullDetails=!companionPrefs.fullDetails;saveCompanionPrefs();}
  else if(d.simpleSection){quickAlternative=d.simpleSection==='alternatives';S.heroTab=quickAlternative?'builds':d.simpleSection;}
  else if(d.choosePlaystyle){const [slug,role,i]=d.choosePlaystyle.split('|');choosePlaystyle({slug,role},Number(i));quickAlternative=false;S.heroTab='builds';}
  else if(d.resetPlaystyle){const [slug,role]=d.resetPlaystyle.split('|');choosePlaystyle({slug,role},null);quickAlternative=false;}
  render();recordNavigation(true);
  if(d.simpleSection)document.querySelector(`[data-simple-section="${d.simpleSection}"]`)?.focus({preventScroll:true});
 }catch(e){toast(e.message);}
},true);

// ==== MATCH (2.36): one screen replaces Compose, Draft and Live ====
// Pick your hero, tap the enemies you can see, and read the team type and the adapted build.
// Enemy roles are assigned only because the engine needs one hero per role; they do not change the advice here.
const LEGACY_MATCH_ROUTES=['planner','draft','live'];
function matchMe(){return S.locks.find(p=>p.slug===S.me)||null;}
function matchEnemies(){const me=matchMe();return S.enemies.filter(e=>!me||e.slug!==me.slug);}
function matchSetMe(slug){
 if(!E.heroes[slug])throw Error('Choose an available hero.');
 // Default to a role with an active reviewed build, so the adapted build has a plan to start from.
 const current=matchMe(),roles=E.roles(slug),role=current?.slug===slug?current.role:roles.find(r=>E.buildReview(slug,r)?.active)||roles[0];
 S.enemies=S.enemies.filter(e=>e.slug!==slug);S.bans=[];S.locks=[{slug,role}];S.me=slug;S.liveVariant=null;S.matchPicking='enemy';save();
}
function matchAddEnemy(slug){
 const me=matchMe();if(!E.heroes[slug]||slug===me?.slug)throw Error('Choose an available enemy hero.');
 if(S.enemies.some(e=>e.slug===slug)){S.enemies=S.enemies.filter(e=>e.slug!==slug);save();return;}
 if(S.enemies.length>=5)throw Error('An enemy team has five heroes. Remove one first.');
 const taken=new Set(S.enemies.map(e=>e.role)),role=E.roles(slug).find(r=>!taken.has(r))||roleOrder.find(r=>!taken.has(r));
 S.enemies=[...S.enemies,{slug,role}];save();
}
function matchTeamTypes(profile){
 const who=list=>list?.length?' · '+list.map(s=>name(s)).join(', '):'',types=[];
 if(profile.front>=2)types.push(['Tanky',profile.front,who(profile.frontWho)]);
 if(profile.healers>=1)types.push(['Healing',profile.healers,who(profile.healWho)]);
 if(profile.mag>=2)types.push(['Magic damage',profile.mag,who(profile.magWho)]);
 if(profile.phys>=2)types.push(['Physical damage',profile.phys,who(profile.physWho)]);
 if(profile.burst>=3)types.push(['Burst',profile.burst,who(profile.burstWho)]);
 if(profile.shielders>=1)types.push(['Shields',profile.shielders,who(profile.shieldWho)]);
 if(profile.hold>=2||profile.cc>=3)types.push(['Crowd control',profile.cc,who(profile.ccWho)]);
 return types;
}
function matchGridHTML(mode){
 const me=matchMe(),chosen=new Set(S.enemies.map(e=>e.slug));
 // 2.50.0: when you choose your own hero, your favorites and recent heroes come first, then everyone alphabetically.
 const mine=mode==='me'?[...new Set([...companionPrefs.favorites.map(v=>v.split('|')[0]),...companionPrefs.recent.map(p=>p.slug)])].filter(s=>E.heroes[s]):[];
 const heroes=mine.concat(Object.keys(E.heroes).filter(s=>(mode==='me'||s!==me?.slug)&&!mine.includes(s)).sort((a,b)=>name(a).localeCompare(name(b))));
 return `<label class="match-search">${mode==='me'?'Find your hero':'Find an enemy hero'}<input id="match-search" type="search" autocomplete="off" placeholder="Hero name"></label>
 <div class="match-grid" role="group" aria-label="${mode==='me'?'Choose your hero':'Enemy heroes'}">${heroes.map(s=>`<button type="button" class="match-hero" data-match-pick="${esc(s)}" data-match-mode="${mode}" data-name="${esc(name(s).toLowerCase())}" ${mode==='enemy'?`aria-pressed="${chosen.has(s)}"`:''}${mine.includes(s)?' data-mine="true"':''}>${art(s,'tiny')}<span>${esc(name(s))}</span></button>`).join('')}</div>`;
}
// One adaptBuild per enemy line-up: the Enemy team summary and the result below share it.
function matchAdapted(me,enemies){
 const choice=buildSelection(me),key=[me.slug,me.role,choice.status,choice.index,enemies.map(e=>e.slug+':'+e.role).join(',')].join('|'),c=matchAdapted.cache;
 if(c&&c.key===key&&c.E===E)return c.a;
 let a;try{if(choice.status==='invalid')throw Error(choice.reason);a=E.adaptBuild(me,[],enemies,{state:'even',primaryThreat:null,variant:choice.index});}
 catch(e){a={error:e.message};}
 matchAdapted.cache={key,E,a};return a;
}
function matchSummaryHTML(me,enemies){
 if(!enemies.length||buildSelection(me).status==='invalid')return '';
 const a=matchAdapted(me,enemies);if(a.error||!a.available)return '';
 const key=n=>String(n).toLowerCase(),base=new Set(a.baseline.map(key)),final=a.slots.map(s=>s.name),kept=new Set(final.map(key));
 const adds=final.filter(n=>!base.has(key(n))),drops=a.baseline.filter(n=>!kept.has(key(n)));
 return `<p class="match-summary">${adds.length?`<strong>${adds.length===1?'1 change':adds.length+' changes'}:</strong> add ${adds.map(esc).join(', ')} <span>· drop ${drops.map(esc).join(', ')}</span>`:'<strong>Keep the starting build</strong> for these enemies.'}</p>`;
}
// 2.41.0: a kept build carries its own category (a source playstyle is an observed choice, not a reviewed build).
function matchResultHTML(me,enemies){
 const selection=buildSelection(me);
 if(selection.status==='invalid')return `<section class="panel match-result"><h2>Choose your playstyle again</h2>${note(esc(selection.reason),true)}<button data-reset-playstyle="${esc(me.slug+'|'+me.role)}">Use the starting plan</button></section>`;
 if(!enemies.length)return `<section class="panel match-result"><h2>No enemies yet</h2><p class="simple-source">Tap the enemy heroes you can see. Until then, these are this build's answers by enemy team type.</p></section>${teamAlternatesHTML(me)}`;
 const a=matchAdapted(me,enemies);
 if(a.error)return `<section class="panel match-result">${note(esc(a.error),true)}</section>`;
 const types=matchTeamTypes(a.enemyProfile||{});
 const typesHTML=`<section class="panel match-types"><div class="skill-guide-head"><h2>Enemy team type</h2>${badge('Calculated · enemy kits','calculated')}</div>${types.length?`<ul class="match-type-list">${types.map(([label,n,who])=>`<li><strong>${esc(label)}</strong> <span>${n}${esc(who)}</span></li>`).join('')}</ul>`:'<p class="simple-source">No team type stands out from these kits yet.</p>'}<p class="simple-source">Counted from each hero's kit, not from what they buy or how much damage they deal.</p></section>`;
 if(!a.available)return typesHTML+`<section class="panel match-result"><h2>Build for this match</h2>${note(esc(a.unavailableReason),true)}<button data-hero="${esc(me.slug)}" data-role="${esc(me.role)}">Open the build page</button></section>`;
 const base=new Set(a.baseline.map(n=>n.toLowerCase())),changed=new Map(a.swaps.map(s=>[s.to.toLowerCase(),s]));
 const rows=a.slots.map((s,i)=>{const swap=changed.get(s.name.toLowerCase()),moved=!swap&&base.has(s.name.toLowerCase())&&a.baseline.findIndex(n=>n.toLowerCase()===s.name.toLowerCase())!==i;
  return `<li class="${swap?'is-changed':''}"><span class="simple-position">${i+1}</span>${itemButton(s.name)}${swap?`<small>Replaces ${esc(swap.from)}${s.candidate?.trigger?.condition?' · '+esc(s.candidate.trigger.condition):''}</small>`:moved?'<small>Bought earlier for this match</small>':''}</li>`;}).join('');
 const reasons=a.swaps.map(s=>`<li><strong>${esc(s.to)}</strong>: ${esc(s.reason)}</li>`).join('');
 const unmet=(a.unmet||[]).map(id=>a.needs.find(n=>n.id===id)?.label||id);
 return typesHTML+`<section class="panel match-result"><div class="skill-guide-head"><h2>Build for this match</h2>${a.swaps.length?badge('Calculated changes','calculated'):(k=>badge('Starting build kept · '+k.text,k.type))(buildCategory(a.plan))}</div>
 <ol class="simple-purchases match-build">${rows}</ol>
 ${reasons?`<ul class="match-reasons">${reasons}</ul>`:'<p class="simple-source">No change is needed for these enemies under the item rules; keep the starting build.</p>'}
 ${unmet.length?`<p class="simple-source">Not changed automatically: ${esc(unmet.join(', '))}.</p>`:''}
 <p class="simple-source">${esc(a.note)}</p>
 <button data-hero="${esc(me.slug)}" data-role="${esc(me.role)}">Open ${esc(name(me.slug))}'s build page</button></section>`;
}
function matchView(){
 const me=matchMe(),enemies=matchEnemies(),picking=!me||S.matchPicking==='me'?'me':'enemy';
 const intro=head('Match',me?name(me.slug)+' · '+labels[me.role]:'Your match',me?'Pick the enemy heroes you can see. The adapted build updates as you go.':'Choose who you play, then pick the enemy heroes you can see.');
 const meHTML=me?`<section class="panel match-me"><div class="match-me-row">${art(me.slug,'')}<div><strong>${esc(name(me.slug))}</strong><label>Role<select id="match-role">${options(E.roles(me.slug).map(r=>[r,labels[r]]),me.role)}</select></label></div></div><div class="match-actions"><button type="button" data-match-change="me">${picking==='me'?'Keep '+esc(name(me.slug)):'Change hero'}</button><button type="button" data-match-new="true">New match</button></div></section>`:'';
 const enemyHTML=me?`<section class="panel match-enemies"><div class="skill-guide-head"><h2>Enemy team · ${enemies.length}/5</h2></div>${enemies.length?`<ul class="match-chips">${enemies.map(e=>`<li><button type="button" class="match-chip" data-match-pick="${esc(e.slug)}" data-match-mode="enemy" aria-label="Remove ${esc(name(e.slug))}">${art(e.slug,'tiny')}<span>${esc(name(e.slug))}</span><span aria-hidden="true">×</span></button></li>`).join('')}</ul>${matchSummaryHTML(me,enemies)}`:'<p class="simple-source">None yet.</p>'}</section>`:'';
 return intro+(picking==='me'?meHTML+`<section class="panel match-pick"><h2>${me?'Choose a different hero':'Who do you play?'}</h2>${matchGridHTML('me')}</section>`:`<div class="match-layout"><div class="match-column">${meHTML}${enemyHTML}<details class="panel match-pick" data-keep="match-enemy-grid${enemies.length<5?'':'-full'}" ${enemies.length<5?'open':''}><summary>${enemies.length<5?'Add enemy heroes':'Change enemy heroes'}</summary>${matchGridHTML('enemy')}</details></div><div class="match-column match-column--result">${matchResultHTML(me,enemies)}</div></div>`);
}
// 2.50.0: an action that clears picks says so and offers Undo for as long as the message shows.
function undoToast(message,undo){const t=$('#toast');toast(message);const b=document.createElement('button');b.type='button';b.className='toast-undo';b.textContent='Undo';b.addEventListener('click',()=>{t.classList.add('hide');undo();});t.append(' ',b);}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-match-pick],[data-match-change],[data-match-new]');if(!el)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  const key=el.dataset.matchPick,mode=el.dataset.matchMode,y=scrollY,keyboard=event.detail===0;
  // 2.50.0: the tapped portrait stays under the finger. A new chip row above the grid used to push the grid down.
  const gridButton=()=>key?document.querySelector(`.match-pick .match-hero[data-match-pick="${CSS.escape(key)}"]`):null,anchor=mode==='enemy'&&el.matches('.match-hero')?el.getBoundingClientRect().top:null;
  let undo=null;
  if(key)mode==='me'?matchSetMe(key):matchAddEnemy(key);
  else if(el.dataset.matchChange){S.matchPicking=S.matchPicking==='me'&&matchMe()?'enemy':'me';}
  else if(el.dataset.matchNew){const before={enemies:S.enemies,bans:S.bans};if(before.enemies.length)undo=()=>{S.enemies=before.enemies;S.bans=before.bans;S.matchPicking='enemy';save();render();};S.enemies=[];S.bans=[];S.matchPicking='enemy';save();}
  // Keep keyboard focus: the same grid button survives the redraw; a removed chip or the finished hero grid hands
  // focus to that hero's grid button, or (from the keyboard only) to the enemy search. A tap never moves focus into
  // the search box, which would raise the phone keyboard over the portraits.
  redrawKeepingFocus();
  if(key&&!$('#main').contains(document.activeElement))(mode==='me'?(keyboard?$('#match-search'):$('#main')):gridButton())?.focus({preventScroll:true});
  if(mode==='enemy'){const now=gridButton(),top=now?.getClientRects().length?now.getBoundingClientRect().top:null;if(anchor!=null&&top!=null)scrollBy(0,top-anchor);else scrollTo(0,y);}
  if(undo)undoToast('New match · enemy team cleared.',undo);
 }catch(e){toast(e.message);}
},true);
document.addEventListener('input',event=>{
 if(event.target.id!=='match-search')return;
 const q=event.target.value.trim().toLowerCase();
 for(const b of event.target.closest('.match-pick')?.querySelectorAll('.match-hero')||[])b.hidden=!!q&&!b.dataset.name.includes(q);
});
document.addEventListener('change',event=>{
 if(event.target.id!=='match-role')return;event.stopImmediatePropagation();
 const me=matchMe(),role=event.target.value;if(!me||!E.roles(me.slug).includes(role))return;
 S.locks=[{slug:me.slug,role}];S.liveVariant=null;save();render();
},true);
