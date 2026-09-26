/* Approved companion flow, on top of the existing data, history and dialog systems. */
'use strict';
for(const key of ['selectedBuilds','heroPools'])if(!companionPrefs[key]||typeof companionPrefs[key]!=='object'||Array.isArray(companionPrefs[key]))companionPrefs[key]={};
let quickDraft={role:null,publication:null,signature:null,rows:[],preview:null},quickAlternative=false;
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
 const current=['match','planner','draft','live'].includes(S.route)?'match':['meta','hero','builds'].includes(S.route)?'meta':'more';
 return [['meta','Meta','meta'],['match','Match','match'],['more','More','more']].map(([id,label,route])=>`<button class="nav" data-destination="${id}" data-route="${route}" ${companionMedia.matches&&current===id?'aria-current="page"':''}>${destinationIcon(id)}<span>${label}</span></button>`).join('');
};
destinationSections=function(){
 if(companionMedia.matches&&['builds','more','data','library','guidance','changes'].includes(S.route))return '';
 return standardSections();
};
const traditionalMore=moreView;
moreView=function(){return traditionalMore().replace('<div class="more-grid">','<div class="more-grid"><button data-route="builds" data-full-reference>Full builds reference</button><button data-route="draft">Quick draft</button>');};
function detailModeButton(){return `<button class="quiet" data-reading-mode>${companionPrefs.fullDetails?'Quick companion view':'Full details'}</button>`;}
function planDate(plan){const review=plan.kind==='reviewed'?plan:previousReviewedBuild(plan.review);return `<p class="simple-source ${plan.kind!=='reviewed'?'warning':''}">${plan.kind==='reviewed'?'Reviewed':'Previous guidance'} ${esc(dayDate(review?.reviewed_at))} · patch ${esc(review?.patch||'unverified')}${!review?.patch_review&&E.strategyReviewDue().due?' · review due':''}${plan.manual?' · selected source playstyle remains a calculated sequence':''}</p>`;}
function simpleSetup(plan){return `<div class="simple-setup">${[['Augment',plan.augment,'perks'],['Eternal',plan.eternal,'perks'],['Blessing 1',plan.blessings?.[0],'perks'],['Blessing 2',plan.blessings?.[1],'perks'],['Crest',plan.crest,'items']].map(([label,n,kind])=>`<div><small>${label}</small>${n?itemButton(n,kind):'<strong>Unavailable</strong>'}</div>`).join('')}</div>`;}
function simplePurchases(plan){
 const items=plan.items||[],core=Math.min(plan.core?.length||0,items.length);
 const group=(label,from,to)=>to>from?`<h4 class="purchase-group">${label} · ${to-from>1?(from+1)+'–'+to:from+1}</h4><ol class="simple-purchases" start="${from+1}">${items.slice(from,to).map((n,j)=>`<li><span class="simple-position">${from+j+1}</span>${itemButton(n)}</li>`).join('')}</ol>`:'';
 return group('Core',0,core)+group('Flexible',core,items.length);
}
// Rec 1: the whole starting build at a glance, directly under the hero header, with its provenance.
function buildStripHTML(p){
 const plan=chosenPlan(p);if(!plan.items?.length)return '';
 const category=plan.manual?{text:'Calculated sequence',type:'calculated'}:buildCategory(plan);
 return `<section class="build-strip" aria-label="Starting build: ${esc(plan.items.join(', '))}"><div class="build-strip-head"><strong>Starting build</strong>${badge(category.text,category.type)}</div><ol class="build-strip-items">${plan.items.map(n=>`<li>${itemButton(n)}</li>`).join('')}</ol></section>`;
}
function simpleBuildHTML(p,{quick=false}={}){
 const plan=chosenPlan(p),choice=buildSelection(p),category=plan.manual?{text:'Calculated sequence · selected source playstyle',type:'calculated'}:buildCategory(plan);
 return `<section class="panel simple-build" data-selected-plan="${esc(p.slug+'|'+p.role)}">${badge(category.text,category.type)}<h2>${quick?'Set these before the match':'Your starting build'}</h2>${planDate(plan)}${plan.patch_review?'<p class="simple-source">Patch-reviewed starting point · current-patch build statistics unavailable.</p>':''}${choice.status==='invalid'?note(esc(choice.reason),true)+`<button data-reset-playstyle="${esc(p.slug+'|'+p.role)}">Use the available starting plan</button>`:''}${plan.items.length?`<h3 class="build-step"><span aria-hidden="true">01</span> Pre-match loadout</h3><p class="simple-source build-provenance">${plan.kind==='reviewed'?'Reviewed choices':'Calculated selection'} · no whole-loadout win rate is claimed.</p>${simpleSetup(plan)}${quick?'<details data-keep="quick-purchases"><summary>Purchase order after loading in</summary>':''}<h3 class="build-step"><span aria-hidden="true">02</span> Purchase order</h3>${simplePurchases(plan)}${quick?'</details>':''}<p>${esc(String(plan.reason||'').split(/(?<=[.!?])\s+/)[0])}</p><details data-keep="simple-build-evidence"><summary>Why this build, alternatives & source evidence</summary><div class="detail-content">${plannedBuildHTML(plan,true)}</div></details>`:note(esc(plan.reason||'No eligible current build. Previous guidance remains available below.'),true)+previousBuildHTML(plan)}</section>`;
}
// Rows follow the in-game ability bar; the ultimate sits last so its 6/11/16 ticks read as a separate line.
const SKILL_CHART_ROWS=['Primary','Secondary','Alternate','Ultimate'];
function skillChartHTML(plan,guide){
 const abilities=Object.fromEntries((B.heroes?.[plan.slug]?.abilities||[]).map(a=>[a.key,a])),rank={};
 const cells=guide.points.map(p=>({...p,rank:rank[p.token]=(rank[p.token]||0)+1}));
 const head=cells.map(p=>`<th scope="col" class="skill-chart-level">${p.level}</th>`).join('');
 const rows=SKILL_CHART_ROWS.map(token=>{
  const first=cells.find(p=>p.token===token);if(!first)return '';
  const icon=abilities[first.key]?.image_url;
  return `<tr data-skill-row="${esc(token)}"><th scope="row"><span class="skill-chart-ability">${icon?`<img src="${esc(icon)}" alt="" width="24" height="24" loading="lazy">`:''}<span class="skill-chart-name">${esc(first.name)}</span><kbd>${esc(first.key)}</kbd></span></th>${cells.map(p=>p.token===token
   ?`<td class="is-ticked"><span class="skill-box" aria-hidden="true">✓</span><span class="sr-only">Level ${p.level}, rank ${p.rank}</span></td>`
   :`<td><span class="skill-box" aria-hidden="true"></span></td>`).join('')}</tr>`;
 }).join('');
 const legend=SKILL_CHART_ROWS.map(token=>cells.find(p=>p.token===token)).filter(Boolean).map(p=>`<span><kbd>${esc(p.key)}</kbd> ${esc(p.name)}</span>`).join('');
 return `<div class="skill-chart-scroll" role="region" aria-label="Skill order chart, levels 1 to 18" tabindex="0"><table class="skill-chart"><caption class="sr-only">Skill points by hero level for ${esc(name(plan.slug))}. Each column is a level; the ticked box is the ability to rank up.</caption><thead><tr><th scope="col" class="skill-chart-corner">Level</th>${head}</tr></thead><tbody>${rows}</tbody></table></div><p class="skill-chart-legend" aria-hidden="true">${legend}</p>`;
}
// Build-page alternates by enemy team type (engine teamAlternates): calculated item rules on the reviewed core.
function teamAlternatesHTML(p){
 const choice=buildSelection(p);if(choice.status==='invalid')return '';
 let r;try{r=E.teamAlternates(p,{variant:choice.index});}catch(e){return '';}
 const head=`<div class="skill-guide-head"><h2>Adapt to the enemy team</h2>${badge('Calculated · item rules','calculated')}</div>`;
 if(!r.available)return `<section class="team-alternates panel" data-team-alternates="${esc(p.slug+'|'+p.role)}">${head}<p class="simple-source">${esc(r.reason)}</p></section>`;
 const body=x=>x.status==='swap'?x.swaps.map(s=>`<div class="team-alt-change"><span>Swap</span>${itemButton(s.from)}<span aria-hidden="true">→</span><span class="sr-only">for</span>${itemButton(s.to)}</div><small>Item ${s.position}${s.evidence?' · '+esc(s.evidence):''}</small>`).join('')
  :x.status==='covered'?`<div class="team-alt-change"><span>Already in this build</span>${x.coveredBy.map(n=>itemButton(n)).join('')}</div>${x.earlier?`<small>Buy ${esc(x.earlier.item)} earlier, as item ${x.earlier.position}.</small>`:''}`
  :`<small>No calculated swap fits this build's flexible slots; keep the starting build.</small>`;
 return `<section class="team-alternates panel" data-team-alternates="${esc(p.slug+'|'+p.role)}">${head}<p class="simple-source">Find the row that matches the enemy team. ${esc(r.note)}</p><ul class="team-alt-list">${r.rows.map(x=>`<li data-team-type="${esc(x.id)}" data-status="${esc(x.status)}"><strong class="team-alt-type">${esc(x.label)}</strong>${body(x)}</li>`).join('')}</ul></section>`;
}
function skillPointsHTML(plan){
 const choice=buildSelection(plan),guide=SkillGuide.make(B,plan,{variantIndex:choice.index}),key=plan.slug+'|'+plan.role;
 if(!guide.points.length)return `<section class="skill-guide panel"><h2>Skill order · unavailable</h2><p>${esc(guide.reason)}</p></section>`;
 const source=guide.source||{};
 return `<section class="skill-guide panel" data-skill-guide="${esc(key)}"><div class="skill-guide-head"><h2>Skill order · levels 1–18</h2>${badge(guide.label,guide.kind==='reviewed'?'reviewed':guide.kind==='observed'?'observed':'calculated')}</div>${skillChartHTML(plan,guide)}<p class="simple-source">Read left to right: each column is a hero level, and the ticked box is the ability to rank up. Names first; keys are default PC bindings.</p><details data-keep="skill-reason"><summary>Why this order & source</summary><p>${esc(guide.reason)}</p>${Number.isFinite(source.wr)&&Number.isFinite(source.played)?`<p>Observed sequence: ${pct(source.wr)} win rate · ${games(source.played)}.</p>`:''}<p class="simple-source">${guide.kind==='observed'?'Statz dataset '+esc(source.patch)+' · fetched '+esc(date(source.fetched_at)):guide.kind==='reviewed'?'Order reviewed '+esc(date(source.reviewed_at)):'Priority reviewed '+esc(date(source.reviewed_at))+'; this exact allocation still needs review.'}${source.url?' · '+link(source.url,'Source'):''}</p>${guide.notes.map(n=>note(esc(n),true)).join('')}</details></section>`;
}
function alternativesHTML(p){
 const stats=B.heroes[p.slug]?.roles?.[p.role],rows=stats?.builds||[];
 return `<h2>Alternative playstyles</h2><p>Observed variants, not a best-build ranking. A six-item path assembled from these rows is calculated.</p><button data-reset-playstyle="${esc(p.slug+'|'+p.role)}">Use the available starting plan</button>${rows.map((b,index)=>{const plan=E.plannedBuild(p.slug,p.role,{index,forceObserved:true});return `<article class="panel">${badge('Observed variant · Statz','observed')}<h3>${esc(b.perk)} / ${esc(b.eternal)}</h3><p>${pct(b.winRate)} win rate · ${games(b.playedGames)}</p><p class="simple-source">Dataset ${esc(B.patch)} · fetched ${esc(date(stats.fetched_at))} · exact match window unconfirmed.</p><details><summary>Inspect loadout and purchase path</summary>${simpleSetup(plan)}${simplePurchases(plan)}<p>${esc(plan.caution)}</p></details><button class="primary" data-choose-playstyle="${esc(p.slug+'|'+p.role+'|'+index)}">Choose this playstyle</button></article>`;}).join('')||empty('No source playstyles for this role.')}`;
}
function simplePartnersHTML(p){
 const partners=E.partners(p.slug,{min:100,heroRole:p.role,metric:'kit'}),rows=RecommendationView.partnerShortlist(partners.combined,5);
 return `<h2>Partners for ${esc(name(p.slug))}</h2><p class="simple-source">Kit fit first, with role variety among nearby suggestions. Pair samples are hero-wide, not role-specific; missing evidence is unknown.</p>${rows.map(r=>{const pair=r.pair,reason=r.fit?.reasons?.[0];return `<article class="panel simple-partner">${heroButton(r.slug,r.role)}<small>${esc(labels[r.role])}</small><p>${esc(reason?.summary||reason?.text||reason||'Inspect supporting abilities.')}</p><p>${badge('Calculated','calculated')} ${num(r.fit?.score,0)} kit points</p>${pair?`<p>${pct(pair.wr)} together · ${games(pair.played)}<br>${pp(pair.lift)} against the stronger overall baseline.</p><details><summary>Baselines, uncertainty & source</summary><p>${esc(name(pair.a))}: ${pct(pair.base_a)} · ${esc(name(pair.b))}: ${pct(pair.base_b)}</p>${pairCertaintyHTML(pair)}${heroSourceHTML(E.heroes[p.slug],p.role,'pairings')}</details>`:'<p class="simple-source">No eligible observed pair sample; this suggestion is based on kits.</p>'}<button data-pair="${esc([p.slug,r.slug,p.role,r.role].join('|'))}">Evidence & why</button></article>`;}).join('')||empty('No supported partner suggestions.')}`;
}
function simpleCountersHTML(p){
 const data=RecommendationView.counterplay(E,E.heroes,p.slug,p.role),strategy=data.strategy;
 return `<h2>Counterplay for ${esc(name(p.slug))}</h2><p>Responses to watch for when playing this hero.</p>${data.picks.map(r=>`<article class="panel">${badge(r.evidenceKind==='reviewed'?'Reviewed counter-pick':'Observed difficult matchup',r.evidenceKind==='reviewed'?'reviewed':'observed')}<h3>${esc(name(r.slug))}</h3>${r.evidenceKind==='reviewed'?`<p>${esc(r.reason)}</p><p>${esc(r.limit||'Execution and team context matter.')}</p><small>Reviewed ${esc(date(r.reviewed_at))}</small>`:`<p>${pct(r.wr)} ${esc(name(p.slug))} win rate · ${games(r.played)}</p><p class="simple-source">${esc(r.label||r.source)} · ${esc(date(r.fetched_at))} · enemy role unconfirmed. Not proof of a hard counter.</p>`}</article>`).join('')}${!data.picks.length?'<p>No supported named counter in this evidence. That does not mean this hero has no counters.</p>':''}${data.points.length?`<section class="panel">${badge(strategy.active?'Reviewed counterplay':'Previous counterplay · needs review',strategy.active?'reviewed':'warning')}<ol>${data.points.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><small>Reviewed ${esc(date(strategy.reviewed_at))} · patch ${esc(strategy.patch)}</small></section>`:''}<details><summary>All matchups & source evidence</summary>${counterplayHTML(p.slug,p.role)}${supportedMatchupsHTML(p.slug,p.role,E.heroes[p.slug],E.heroes[p.slug].roles?.[p.role])}${exploratoryMatchupsHTML(p.slug,p.role,E.heroes[p.slug],E.heroes[p.slug].roles?.[p.role])}</details>`;
}
mobileHero=function(){
 if(companionPrefs.fullDetails)return fullMobileHero()+detailModeButton();
 const p={slug:S.hero,role:S.heroRole},hero=E.heroes[p.slug];if(!hero)return guidedHome();
 const perf=E.displayPerformance(p),counter=RecommendationView.counterplay(E,E.heroes,p.slug,p.role),tab=['pairings','counters','kit'].includes(S.heroTab)?S.heroTab:quickAlternative?'alternatives':'builds';
 const buttons=[['builds','Build'],['alternatives','Options'],...(counter.available?[['counters','Counters']]:[]),['pairings','Partners'],['kit','Kit']];
 const body=tab==='alternatives'?alternativesHTML(p):tab==='pairings'?patchContextHTML(p.slug,'partners')+simplePartnersHTML(p):tab==='counters'?simpleCountersHTML(p):tab==='kit'?patchContextHTML(p.slug)+kitView(hero):simpleBuildHTML(p)+teamAlternatesHTML(p)+patchContextHTML(p.slug)+skillPointsHTML(chosenPlan(p));
 return `<button class="text-button" data-route="meta">← Meta</button><div class="hero-header mobile-hero-head">${art(p.slug,'large')}<div><h1>${esc(name(p.slug))}</h1><label>Role<select id="mobile-hero-role">${options(E.roles(p.slug).map(r=>[r,labels[r]]),p.role)}</select></label></div></div>${buildStripHTML(p)}<p class="simple-source">${perf?displayedRoleText(perf):esc(roleSampleText(p.slug,p.role))}</p><div class="simple-sections tab-strip tab-strip--segmented" role="tablist" aria-label="Hero sections">${buttons.map(([id,label])=>`<button role="tab" data-simple-section="${id}" aria-selected="${id===tab}" tabindex="${id===tab?0:-1}"${id===tab?` aria-controls="hero-sec-${tab==='alternatives'?'builds':tab}"`:''}>${label}</button>`).join('')}</div><section id="hero-sec-${tab==='alternatives'?'builds':tab}" class="simple-hero-section" role="tabpanel" aria-label="${esc(buttons.find(b=>b[0]===tab)?.[1]||'Build')}">${body}</section><div class="adapt-dock"><button class="primary" data-start-live="true">Adapt to my match</button></div><div class="simple-actions">${detailModeButton()}<button id="favorite-hero" aria-pressed="${companionPrefs.favorites.includes(p.slug+'|'+p.role)}">Favorite</button><button id="share-hero">Share</button></div>`;
};
function draftInputs(){return JSON.stringify([S.candidateRole,S.locks,S.enemies,S.bans,companionPrefs.heroPools[S.candidateRole]||[],B.generated_at,S.bracket]);}
function quickEvidenceKey(){return JSON.stringify([B.generated_at,B.patch,B.official?.live?.version,S.bracket]);}
function refreshQuickDraft(wide=false){
 const pool=companionPrefs.heroPools[S.candidateRole]||[];
 const rows=E.recommend(S.locks,{role:S.candidateRole,bans:S.bans,enemies:S.enemies,min:100,metric:'kit'}).filter(c=>wide||!pool.length||pool.includes(c.picks[c.picks.length-1].slug));
 quickDraft={role:S.candidateRole,publication:B.generated_at,evidence:quickEvidenceKey(),signature:draftInputs(),preview:null,rows:rows.slice(0,3).map(c=>{const p=c.picks[c.picks.length-1],fit=c.links?.find(l=>l.a===p.slug||l.b===p.slug)?.fit,reason=fit?.reasons?.[0];return {p,reason:reason?.summary||reason?.text||'Fits the selected role; inspect its kit and team coverage.'};})};
}
// A legacy Builds route remains a complete reference page. It is no longer a duplicate primary destination.
const oldRenderCompanion=renderCompanion;
renderCompanion=function(){if(B&&companionMedia.matches&&S.route==='builds'){$('#main').innerHTML=mobileBuilds();return true;}return oldRenderCompanion();};
const oldAfterDestination=afterDestinationRender;
afterDestinationRender=function(){oldAfterDestination();if(B&&companionMedia.matches&&['data','library','guidance','changes','builds'].includes(S.route))$('#main').insertAdjacentHTML('afterbegin','<button data-route="more">← More</button>');};
const oldAfterHero=afterHeroRender;
afterHeroRender=function(){if(simpleMode()&&S.route==='hero')return;oldAfterHero();};
const oldSpySections=spySections;
spySections=function(){if(!simpleMode())oldSpySections();};
const oldOpenHeroSimple=openHero;
openHero=function(...args){quickAlternative=false;oldOpenHeroSimple(...args);};
document.addEventListener('click',event=>{
 const el=event.target.closest('button');if(!el)return;const d=el.dataset;
 const handles=['readingMode','simpleSection','choosePlaystyle','resetPlaystyle','quickRefresh','quickPool','quickWide','quickPreview','quickLock','liveVariant','liveDefault'].some(k=>k in d);
 if(!handles)return;event.preventDefault();event.stopImmediatePropagation();
 try{
  if('liveVariant' in d||'liveDefault' in d){const me=S.locks.find(p=>p.slug===S.me);if(!me)throw Error('Choose your hero first.');choosePlaystyle(me,'liveDefault' in d?null:Number(d.liveVariant));}
  else if('readingMode' in d){companionPrefs.fullDetails=!companionPrefs.fullDetails;saveCompanionPrefs();}
  else if(d.simpleSection){quickAlternative=d.simpleSection==='alternatives';S.heroTab=quickAlternative?'builds':d.simpleSection;}
  else if(d.choosePlaystyle){const [slug,role,i]=d.choosePlaystyle.split('|');choosePlaystyle({slug,role},Number(i));quickAlternative=false;S.heroTab='builds';}
  else if(d.resetPlaystyle){const [slug,role]=d.resetPlaystyle.split('|');choosePlaystyle({slug,role},null);quickAlternative=false;}
  else if('quickRefresh' in d)refreshQuickDraft();
  else if('quickWide' in d)refreshQuickDraft(true);
  else if(d.quickPool){const pool=companionPrefs.heroPools[S.candidateRole]||[];if(pool.includes(d.quickPool))companionPrefs.heroPools[S.candidateRole]=pool.filter(s=>s!==d.quickPool);else if(pool.length<3)companionPrefs.heroPools[S.candidateRole]=[...pool,d.quickPool];else throw Error('Your pool has three heroes. Remove one to replace it.');saveCompanionPrefs();}
  else if(d.quickPreview){if(quickDraft.evidence!==quickEvidenceKey())throw Error('Evidence changed. Refresh the shortlist before reading a new setup.');const why=CompanionState.blocked(d.quickPreview,S.candidateRole,{allies:S.locks,enemies:S.enemies,bans:S.bans},E);if(why)throw Error(why);quickDraft.preview=d.quickPreview;}
  else if(d.quickLock){if(quickDraft.evidence!==quickEvidenceKey())throw Error('Evidence changed. Refresh the shortlist before locking this setup.');const why=CompanionState.blocked(d.quickLock,S.candidateRole,{allies:S.locks,enemies:S.enemies,bans:S.bans},E);if(why)throw Error(why);const result=useInLive(d.quickLock,S.candidateRole);save();render();recordNavigation();showUndo(result.before,'Hero selected for this match.');return;}
  render();recordNavigation(true);
  if(d.simpleSection)document.querySelector(`[data-simple-section="${d.simpleSection}"]`)?.focus({preventScroll:true});
  else if(d.quickPreview){const heading=document.querySelector('.quick-setup>h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});document.querySelector('.quick-setup')?.scrollIntoView({block:'start'});}
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
 const heroes=Object.keys(E.heroes).filter(s=>mode==='me'||s!==me?.slug).sort((a,b)=>name(a).localeCompare(name(b)));
 return `<label class="match-search">${mode==='me'?'Find your hero':'Find an enemy hero'}<input id="match-search" type="search" autocomplete="off" placeholder="Hero name"></label>
 <div class="match-grid" role="group" aria-label="${mode==='me'?'Choose your hero':'Enemy heroes'}">${heroes.map(s=>`<button type="button" class="match-hero" data-match-pick="${esc(s)}" data-match-mode="${mode}" data-name="${esc(name(s).toLowerCase())}" ${mode==='enemy'?`aria-pressed="${chosen.has(s)}"`:''}>${art(s,'tiny')}<span>${esc(name(s))}</span></button>`).join('')}</div>`;
}
function matchResultHTML(me,enemies){
 const selection=buildSelection(me);
 if(selection.status==='invalid')return `<section class="panel match-result"><h2>Choose your playstyle again</h2>${note(esc(selection.reason),true)}<button data-reset-playstyle="${esc(me.slug+'|'+me.role)}">Use the starting plan</button></section>`;
 if(!enemies.length)return `<section class="panel match-result"><h2>No enemies yet</h2><p class="simple-source">Tap the enemy heroes you can see. Until then, these are this build's answers by enemy team type.</p></section>${teamAlternatesHTML(me)}`;
 const choice=buildSelection(me);
 let a;try{if(choice.status==='invalid')throw Error(choice.reason);a=E.adaptBuild(me,[],enemies,{state:'even',primaryThreat:null,variant:choice.index});}
 catch(e){return `<section class="panel match-result">${note(esc(e.message),true)}</section>`;}
 const types=matchTeamTypes(a.enemyProfile||{});
 const typesHTML=`<section class="panel match-types"><div class="skill-guide-head"><h2>Enemy team type</h2>${badge('Calculated · enemy kits','calculated')}</div>${types.length?`<ul class="match-type-list">${types.map(([label,n,who])=>`<li><strong>${esc(label)}</strong> <span>${n}${esc(who)}</span></li>`).join('')}</ul>`:'<p class="simple-source">No team type stands out from these kits yet.</p>'}<p class="simple-source">Counted from each hero's kit, not from what they buy or how much damage they deal.</p></section>`;
 if(!a.available)return typesHTML+`<section class="panel match-result"><h2>Build for this match</h2>${note(esc(a.unavailableReason),true)}<button data-hero="${esc(me.slug)}" data-role="${esc(me.role)}">Open the build page</button></section>`;
 const base=new Set(a.baseline.map(n=>n.toLowerCase())),changed=new Map(a.swaps.map(s=>[s.to.toLowerCase(),s]));
 const rows=a.slots.map((s,i)=>{const swap=changed.get(s.name.toLowerCase()),moved=!swap&&base.has(s.name.toLowerCase())&&a.baseline.findIndex(n=>n.toLowerCase()===s.name.toLowerCase())!==i;
  return `<li class="${swap?'is-changed':''}"><span class="simple-position">${i+1}</span>${itemButton(s.name)}${swap?`<small>Replaces ${esc(swap.from)}${s.candidate?.trigger?.condition?' · '+esc(s.candidate.trigger.condition):''}</small>`:moved?'<small>Bought earlier for this match</small>':''}</li>`;}).join('');
 const reasons=a.swaps.map(s=>`<li><strong>${esc(s.to)}</strong>: ${esc(s.reason)}</li>`).join('');
 const unmet=(a.unmet||[]).map(id=>a.needs.find(n=>n.id===id)?.label||id);
 return typesHTML+`<section class="panel match-result"><div class="skill-guide-head"><h2>Build for this match</h2>${badge(a.swaps.length?'Calculated changes':'Starting build kept',a.swaps.length?'calculated':'reviewed')}</div>
 <ol class="simple-purchases match-build">${rows}</ol>
 ${reasons?`<ul class="match-reasons">${reasons}</ul>`:'<p class="simple-source">No change is needed for these enemies under the item rules; keep the starting build.</p>'}
 ${unmet.length?`<p class="simple-source">Not changed automatically: ${esc(unmet.join(', '))}.</p>`:''}
 <p class="simple-source">${esc(a.note)}</p>
 <button data-hero="${esc(me.slug)}" data-role="${esc(me.role)}">Open ${esc(name(me.slug))}'s build page</button></section>`;
}
function matchView(){
 const me=matchMe(),enemies=matchEnemies(),picking=!me||S.matchPicking==='me'?'me':'enemy';
 const intro=head('Match',me?name(me.slug)+' · '+labels[me.role]:'Your match',me?'Tap the enemy heroes you can see. The build below updates as you go.':'Choose who you play, then tap the enemy heroes you can see.');
 const meHTML=me?`<section class="panel match-me"><div class="match-me-row">${art(me.slug,'')}<div><strong>${esc(name(me.slug))}</strong><label>Role<select id="match-role">${options(E.roles(me.slug).map(r=>[r,labels[r]]),me.role)}</select></label></div></div><div class="match-actions"><button type="button" data-match-change="me">${picking==='me'?'Keep '+esc(name(me.slug)):'Change hero'}</button><button type="button" data-match-new="true">New match</button></div></section>`:'';
 const enemyHTML=me?`<section class="panel match-enemies"><div class="skill-guide-head"><h2>Enemy team · ${enemies.length}/5</h2></div>${enemies.length?`<ul class="match-chips">${enemies.map(e=>`<li><button type="button" class="match-chip" data-match-pick="${esc(e.slug)}" data-match-mode="enemy" aria-label="Remove ${esc(name(e.slug))}">${art(e.slug,'tiny')}<span>${esc(name(e.slug))}</span><span aria-hidden="true">×</span></button></li>`).join('')}</ul>`:'<p class="simple-source">None yet.</p>'}</section>`:'';
 return intro+meHTML+(picking==='me'?`<section class="panel match-pick"><h2>${me?'Choose a different hero':'Who do you play?'}</h2>${matchGridHTML('me')}</section>`:enemyHTML+matchResultHTML(me,enemies)+`<details class="panel match-pick" data-keep="match-enemy-grid" ${enemies.length<5?'open':''}><summary>Add enemy heroes</summary>${matchGridHTML('enemy')}</details>`);
}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-match-pick],[data-match-change],[data-match-new]');if(!el)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  const key=el.dataset.matchPick,mode=el.dataset.matchMode,y=scrollY;
  if(key)mode==='me'?matchSetMe(key):matchAddEnemy(key);
  else if(el.dataset.matchChange){S.matchPicking=S.matchPicking==='me'&&matchMe()?'enemy':'me';}
  else if(el.dataset.matchNew){S.enemies=[];S.bans=[];S.matchPicking='enemy';save();}
  // Keep keyboard focus: the same grid button survives the redraw; a removed chip or the finished hero grid hands
  // focus to that hero's grid button or to the enemy search.
  redrawKeepingFocus();
  if(key&&!$('#main').contains(document.activeElement))(mode==='me'?$('#match-search'):document.querySelector(`.match-hero[data-match-pick="${CSS.escape(key)}"]`))?.focus({preventScroll:true});
  if(mode==='enemy')scrollTo(0,y);
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
