/* Approved companion flow, on top of the existing data, history and dialog systems. */
'use strict';
for(const key of ['selectedBuilds','skillLevels','heroPools'])if(!companionPrefs[key]||typeof companionPrefs[key]!=='object'||Array.isArray(companionPrefs[key]))companionPrefs[key]={};
let quickDraft={role:null,publication:null,signature:null,rows:[],preview:null},quickAlternative=false;
const fullMobileHero=mobileHero,fullMobileLive=liveMobile,fullMobileDraft=mobileDraft,fullDesktopDraft=draftView;
const standardNavigation=destinationNavigation,standardSections=destinationSections;
const simpleMode=()=>companionMedia.matches&&!companionPrefs.fullDetails;
function buildSelection(p){const ref=companionPrefs.selectedBuilds[p.slug+'|'+p.role];if(!ref&&S.liveVariant!=null&&S.me===p.slug&&S.locks.some(a=>a.slug===p.slug&&a.role===p.role))return {status:'invalid',index:null,reason:'A playstyle saved by the previous app needs to be chosen again. Its old variant number cannot identify the same build after an update.'};return CompanionState.resolve(B,E,ref,p.slug,p.role);}
function chosenPlan(p){const choice=buildSelection(p);return choice.status==='selected'?choice.plan:choice.status==='invalid'?{slug:p.slug,role:p.role,kind:'unavailable',items:[],core:[],blessings:[],reason:choice.reason,review:E.buildReview(p.slug,p.role)}:E.plannedBuild(p.slug,p.role);}
function choosePlaystyle(p,index){const key=p.slug+'|'+p.role;if(index===null)delete companionPrefs.selectedBuilds[key];else companionPrefs.selectedBuilds[key]=CompanionState.reference(B,E,p.slug,p.role,index);saveCompanionPrefs();if(S.me===p.slug&&S.locks.some(a=>a.slug===p.slug&&a.role===p.role))S.liveVariant=null;save();}
// An old numeric override blocks its own hero/role until an explicit choice clears it.
adviceFor=function(p){const choice=buildSelection(p),enemies=coachEnemies(p),ctx={...contextFor(p)};if(choice.status==='invalid')throw Error(choice.reason);if(ctx.primaryThreat&&!enemies.some(e=>e.slug===ctx.primaryThreat))delete ctx.primaryThreat;return E.adaptBuild(p,S.locks.filter(a=>a.slug!==p.slug).concat(p),enemies,{...ctx,variant:choice.index});};
destinationNavigation=function(phone){
 if(!phone)return standardNavigation(phone);
 const current=['planner','draft','live'].includes(S.route)?'plan':['meta','hero','builds'].includes(S.route)?'meta':'more';
 return [['meta','Meta','meta'],['plan','Plan','draft'],['more','More','more']].map(([id,label,route])=>`<button class="nav" data-destination="${id}" data-route="${route}" ${companionMedia.matches&&current===id?'aria-current="page"':''}>${destinationIcon(id)}<span>${label}</span></button>`).join('');
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
function skillChartHTML(plan,guide,level){
 const abilities=Object.fromEntries((B.heroes?.[plan.slug]?.abilities||[]).map(a=>[a.key,a])),rank={};
 const cells=guide.points.map(p=>({...p,rank:rank[p.token]=(rank[p.token]||0)+1}));
 const current=l=>l===level?' is-current':'';
 const head=cells.map(p=>`<th scope="col" class="skill-chart-level${current(p.level)}"${p.level===level?' aria-current="step"':''}><span>${p.level}</span></th>`).join('');
 const rows=SKILL_CHART_ROWS.map(token=>{
  const first=cells.find(p=>p.token===token);if(!first)return '';
  const icon=abilities[first.key]?.image_url;
  return `<tr data-skill-row="${esc(token)}"><th scope="row"><span class="skill-chart-ability">${icon?`<img src="${esc(icon)}" alt="" width="24" height="24" loading="lazy">`:''}<span class="skill-chart-name">${esc(first.name)}</span><kbd>${esc(first.key)}</kbd></span></th>${cells.map(p=>p.token===token
   ?`<td class="is-ticked${current(p.level)}"><span class="skill-box" aria-hidden="true">✓</span><span class="sr-only">Level ${p.level}, rank ${p.rank}</span></td>`
   :`<td class="${current(p.level).trim()}"><span class="skill-box" aria-hidden="true"></span></td>`).join('')}</tr>`;
 }).join('');
 return `<div class="skill-chart-scroll" role="region" aria-label="Skill order chart, levels 1 to 18" tabindex="0"><table class="skill-chart"><caption class="sr-only">Skill points by hero level for ${esc(name(plan.slug))}. Each column is a level; the ticked box is the ability to rank up.</caption><thead><tr><th scope="col" class="skill-chart-corner">Level</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function skillPointsHTML(plan){
 const choice=buildSelection(plan),guide=SkillGuide.make(B,plan,{variantIndex:choice.index}),key=plan.slug+'|'+plan.role;
 if(!guide.points.length)return `<section class="skill-guide panel"><h2>Skill order · unavailable</h2><p>${esc(guide.reason)}</p></section>`;
 const level=Math.max(1,Math.min(18,Number(companionPrefs.skillLevels[key])||1)),point=guide.points[level-1],source=guide.source||{};
 return `<section class="skill-guide panel" data-skill-guide="${esc(key)}"><div class="skill-guide-head"><h2>Skill order · levels 1–18</h2>${badge(guide.label,guide.kind==='reviewed'?'reviewed':guide.kind==='observed'?'observed':'calculated')}</div>${skillChartHTML(plan,guide,level)}<p class="simple-source">Read left to right: each column is a hero level, and the ticked box is the ability to rank up. Names first; keys are default PC bindings.</p><label>Your hero level<select data-skill-level-select>${options(guide.points.map(r=>[String(r.level),'Level '+r.level]),String(level))}</select></label><p class="skill-answer" aria-live="polite">Level ${level}: put the point in <strong>${esc(point.name)}</strong> (${esc(point.key)}).</p><details data-keep="skill-reason"><summary>Why this order & source</summary><p>${esc(guide.reason)}</p>${Number.isFinite(source.wr)&&Number.isFinite(source.played)?`<p>Observed sequence: ${pct(source.wr)} win rate · ${games(source.played)}.</p>`:''}<p class="simple-source">${guide.kind==='observed'?'Statz dataset '+esc(source.patch)+' · fetched '+esc(date(source.fetched_at)):guide.kind==='reviewed'?'Order reviewed '+esc(date(source.reviewed_at)):'Priority reviewed '+esc(date(source.reviewed_at))+'; this exact allocation still needs review.'}${source.url?' · '+link(source.url,'Source'):''}</p>${guide.notes.map(n=>note(esc(n),true)).join('')}</details></section>`;
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
 const body=tab==='alternatives'?alternativesHTML(p):tab==='pairings'?patchContextHTML(p.slug,'partners')+simplePartnersHTML(p):tab==='counters'?simpleCountersHTML(p):tab==='kit'?patchContextHTML(p.slug)+kitView(hero):simpleBuildHTML(p)+patchContextHTML(p.slug)+skillPointsHTML(chosenPlan(p));
 return `<button class="text-button" data-route="meta">← Meta</button><div class="hero-header mobile-hero-head">${art(p.slug,'large')}<div><h1>${esc(name(p.slug))}</h1><label>Role<select id="mobile-hero-role">${options(E.roles(p.slug).map(r=>[r,labels[r]]),p.role)}</select></label></div></div>${buildStripHTML(p)}<p class="simple-source">${perf?displayedRoleText(perf):esc(roleSampleText(p.slug,p.role))}</p><div class="simple-sections tab-strip tab-strip--segmented" role="tablist" aria-label="Hero sections">${buttons.map(([id,label])=>`<button role="tab" data-simple-section="${id}" aria-selected="${id===tab}" tabindex="${id===tab?0:-1}"${id===tab?` aria-controls="hero-sec-${tab==='alternatives'?'builds':tab}"`:''}>${label}</button>`).join('')}</div><section id="hero-sec-${tab==='alternatives'?'builds':tab}" class="simple-hero-section" role="tabpanel" aria-label="${esc(buttons.find(b=>b[0]===tab)?.[1]||'Build')}">${body}</section><div class="adapt-dock"><button class="primary" data-start-live="true">Adapt to my match</button></div><div class="simple-actions">${detailModeButton()}<button id="favorite-hero" aria-pressed="${companionPrefs.favorites.includes(p.slug+'|'+p.role)}">Favorite</button><button id="share-hero">Share</button></div>`;
};
liveMobile=function(){
 if(companionPrefs.fullDetails)return fullMobileLive()+detailModeButton();
 const me=S.locks.find(p=>p.slug===S.me);if(!me)return fullMobileLive();
 let a;try{a=adviceFor(me);}catch(e){return head('Live game','Check your selected build',esc(e.message))+`<button data-hero="${esc(me.slug)}" data-role="${me.role}">Choose a build</button>${detailModeButton()}`;}
 const plan=chosenPlan(me);
 return head('Live game',name(me.slug)+' · '+labels[me.role],'Add only what you know; your starting build remains available.')+`<div class="live-actions"><button data-new-match="true">New match</button><button data-live-lookup="true">Change my hero</button></div><section class="panel coach"><h2>${a.nextPurchase?'Next: '+esc(a.nextPurchase.name):a.available?'Six items owned':'Next purchase unavailable'}</h2>${a.available?`${badge(buildCategory(a.plan,a.nextPurchase).text,'calculated')}<p>${esc(a.explanations[0])}</p>${a.nextPurchase?itemButton(a.nextPurchase.name)+supportingSample(a.nextPurchase.measured,a.slots.indexOf(a.nextPurchase)+1):''}<details><summary>Suggested purchase path & reasons</summary><ol class="build-path">${a.slots.map((slot,i)=>`<li>${itemButton(slot.name)}${badge(buildCategory(a.plan,slot).text,'calculated')}<p>${esc(slot.label)}</p>${supportingSample(slot.measured,i+1)}</li>`).join('')}</ol>${a.changes.map(c=>`<p>${esc(c.item)}: ${esc(c.reason)}</p>`).join('')}</details>`:note(esc(a.unavailableReason),true)}${planDate(plan)}</section><button class="primary" data-edit-situation="${esc(me.slug+'|'+me.role)}">Add teammates, enemies & owned items</button>${skillPointsHTML(plan)}<details data-keep="compare-start"><summary>My original starting build</summary>${simpleBuildHTML(me)}</details>${detailModeButton()}`;
};
function draftInputs(){return JSON.stringify([S.candidateRole,S.locks,S.enemies,S.bans,companionPrefs.heroPools[S.candidateRole]||[],B.generated_at,S.bracket]);}
function quickEvidenceKey(){return JSON.stringify([B.generated_at,B.patch,B.official?.live?.version,S.bracket]);}
function refreshQuickDraft(wide=false){
 const pool=companionPrefs.heroPools[S.candidateRole]||[];
 const rows=E.recommend(S.locks,{role:S.candidateRole,bans:S.bans,enemies:S.enemies,min:100,metric:'kit'}).filter(c=>wide||!pool.length||pool.includes(c.picks[c.picks.length-1].slug));
 quickDraft={role:S.candidateRole,publication:B.generated_at,evidence:quickEvidenceKey(),signature:draftInputs(),preview:null,rows:rows.slice(0,3).map(c=>{const p=c.picks[c.picks.length-1],fit=c.links?.find(l=>l.a===p.slug||l.b===p.slug)?.fit,reason=fit?.reasons?.[0];return {p,reason:reason?.summary||reason?.text||'Fits the selected role; inspect its kit and team coverage.'};})};
}
function quickDraftView(){
 if(quickDraft.role!==S.candidateRole)quickDraft={role:S.candidateRole,rows:[],preview:null};
 const pool=companionPrefs.heroPools[S.candidateRole]||[],state={allies:S.locks,enemies:S.enemies,bans:S.bans},stale=quickDraft.signature!==draftInputs();
 const changed=quickDraft.evidence!==quickEvidenceKey(),blocked=p=>CompanionState.blocked(p.slug,p.role,state,E)||(changed?'Evidence changed — refresh shortlist':'');
 return head('Plan · quick draft','Choose from three','Prepare before your turn. Suggestions stay put until you update them.')+`<div class="toolbar"><label>Your role<select id="candidate-role">${options(roleOrder.map(r=>[r,labels[r]]),S.candidateRole)}</select></label><button class="primary" data-quick-refresh>Show my shortlist</button></div><details data-keep="personal-pool"><summary>My ${esc(labels[S.candidateRole])} heroes · ${pool.length}/3</summary><p>Optional familiar-hero pool. An empty pool considers everyone.</p><div class="simple-pool">${Object.keys(E.heroes).filter(s=>E.roles(s).includes(S.candidateRole)).sort((a,b)=>name(a).localeCompare(name(b))).map(s=>`<button data-quick-pool="${s}" aria-pressed="${pool.includes(s)}">${esc(name(s))}</button>`).join('')}</div></details>${quickDraft.rows.length&&stale?note('Picks, rank or evidence changed. This shortlist has stayed in place; update it when ready. Unavailable heroes cannot be locked.',true):''}<div class="grid three quick-candidates">${quickDraft.rows.map(({p,reason})=>`<article class="panel quick-candidate ${quickDraft.preview===p.slug?'is-selected':''}"><div class="quick-candidate-identity">${art(p.slug)}<h2>${esc(name(p.slug))}</h2></div><p>${esc(reason)}</p>${badge('Calculated kit-fit ordering','calculated')}<button data-quick-preview="${esc(p.slug)}" aria-pressed="${quickDraft.preview===p.slug}" ${blocked(p)?'disabled':''}>${esc(blocked(p)||'See pre-match setup')}</button></article>`).join('')}</div>${!quickDraft.rows.length?empty('Show your shortlist when ready. Fewer than three eligible heroes will show fewer suggestions.'):''}<button data-quick-wide>Show other heroes</button>${quickDraft.preview&&!changed?`<section class="quick-setup"><h2 id="quick-setup-${esc(quickDraft.preview)}-${esc(S.candidateRole)}" tabindex="-1">${esc(name(quickDraft.preview))}</h2>${simpleBuildHTML({slug:quickDraft.preview,role:S.candidateRole},{quick:true})}<button class="primary" data-quick-lock="${esc(quickDraft.preview)}" ${blocked({slug:quickDraft.preview,role:S.candidateRole})?'disabled':''}>Use this hero & continue to match</button></section>`:''}<button data-reading-mode>Full draft details</button>`;
}
mobileDraft=function(){return companionPrefs.fullDetails?fullMobileDraft()+detailModeButton():quickDraftView();};
draftView=function(){return companionPrefs.fullDetails?fullDesktopDraft()+detailModeButton():quickDraftView();};
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
// Keep the chosen level's column in view when the chart scrolls sideways on a phone; the ability column is sticky.
function revealSkillLevel(chart){const cell=chart.querySelector('.skill-chart-level.is-current');if(!cell)return;const pinned=chart.querySelector('.skill-chart-corner')?.offsetWidth||0,left=cell.offsetLeft-pinned,right=cell.offsetLeft+cell.offsetWidth;if(left<chart.scrollLeft)chart.scrollLeft=left;else if(right>chart.scrollLeft+chart.clientWidth)chart.scrollLeft=right-chart.clientWidth;}
function updateSkillLevel(el,level){const block=el.closest('[data-skill-guide]');if(!block||!Number.isInteger(level)||level<1||level>18)return;companionPrefs.skillLevels[block.dataset.skillGuide]=level;saveCompanionPrefs();const y=scrollY,x=block.querySelector('.skill-chart-scroll')?.scrollLeft||0;render();const next=document.querySelector(`[data-skill-guide="${CSS.escape(block.dataset.skillGuide)}"]`);if(next){const chart=next.querySelector('.skill-chart-scroll');if(chart){chart.scrollLeft=x;revealSkillLevel(chart);}next.querySelector('select')?.focus({preventScroll:true});}scrollTo(0,y);}
document.addEventListener('change',event=>{if(event.target.matches('[data-skill-level-select]')){event.stopImmediatePropagation();updateSkillLevel(event.target,Number(event.target.value));}},true);
