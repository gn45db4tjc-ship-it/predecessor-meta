/* Companion presentation. Inlined into local, exported and public HTML. No fetching here. */
const companionMedia=matchMedia('(max-width:700px)');
const matchKey='predecessor-match-v2',prefsKey='predecessor-companion-v1';
const copyValue=v=>JSON.parse(JSON.stringify(v));
let companionPrefs={recent:[],favorites:[],large:false,installSeen:false,homeQuery:''};
try{Object.assign(companionPrefs,JSON.parse(localStorage.getItem(prefsKey)||'{}'));}catch{}
if(!Array.isArray(companionPrefs.recent))companionPrefs.recent=[];if(!Array.isArray(companionPrefs.favorites))companionPrefs.favorites=[];
let undoAction=null,undoTimer=null,historyApplying=false,linkApplied='',companionError='';
S.liveContexts={};S.liveVariant=null;
try{const m=JSON.parse(sessionStorage.getItem(matchKey)||'{}');if(m.v===2&&m.contexts&&typeof m.contexts==='object'&&!Array.isArray(m.contexts))S.liveContexts=m.contexts;}catch{}
function saveCompanionPrefs(){try{localStorage.setItem(prefsKey,JSON.stringify(companionPrefs));}catch{toast('Preferences could not be saved on this device.');}}
function saveMatchSession(){try{sessionStorage.setItem(matchKey,JSON.stringify({v:2,contexts:S.liveContexts}));}catch{ /* Usable in memory when storage is unavailable. */ }}
function contextFor(p){const c=S.liveContexts[p.slug+'|'+p.role];return c&&typeof c==='object'?c:{owned:[],state:'even',priority:''};}
function coachEnemies(p){return S.enemies.filter(e=>e.slug!==p.slug);}
function adviceFor(p){const enemies=coachEnemies(p),ctx={...contextFor(p)};if(ctx.primaryThreat&&!enemies.some(e=>e.slug===ctx.primaryThreat))delete ctx.primaryThreat;return E.adaptBuild(p,S.locks.filter(a=>a.slug!==p.slug).concat(p),enemies,ctx);}
// The coach describes the evidence for this hero and role (its role sample) and the mechanics it reads; site refresh
// health is on the status line and Sources & accuracy.
/* The categories engine.js actually produces for a build part. A part is never reduced
   to "observed or substituted": a reviewed core, a calculated starting selection, a
   source playstyle the reader chose, an item merely brought forward and an item actually
   replaced are five different claims. */
function buildCategory(plan,slot){
 if(slot&&slot.kind==='owned')return {text:'Owned · kept',type:'saved'};
 /* kind 'need' means the engine REPLACED what was here. */
 if(slot&&slot.kind==='need')return {text:'Substitution · calculated',type:'calculated'};
 /* timing means the same item was moved earlier. Nothing was substituted. */
 if(slot&&slot.timing)return {text:'Brought earlier · calculated',type:'calculated'};
 if(plan&&plan.manual)return {text:'Observed choice',type:'observed'};
 if(plan&&plan.kind==='reviewed')return {text:'Reviewed',type:'reviewed'};
 return {text:'Calculated starting selection',type:'calculated'};
}
var OBSERVATION_POSITIONS={firstTier3:1,secondTier3:2,thirdTier3:3,fourthTier3:4,fifthTier3:5,sixthTier3:6};
/* Which purchase position the observation was actually recorded at, or null when the
   source does not express one (a Statz core sequence). */
function observationPosition(m){
 if(!m||m.slot==null)return null;
 if(OBSERVATION_POSITIONS[m.slot])return OBSERVATION_POSITIONS[m.slot];
 return /^[1-6]$/.test(String(m.slot))?Number(m.slot):null;
}
/* The engine's own reason, never a guess. currentItemPool marks a Statz observation
   inspection-only by construction; buildCandidate withdraws support from a Pred.gg one
   that is under the minimum, older than thirty hours, or dated in the future. */
function exclusionReason(m,now){
 if(!m||m.supports_current_fit)return '';
 if(m.source==='Statz')return 'Statz observation: inspection only, and it adds no current-patch fit points.';
 if(typeof m.played==='number'&&m.played<100)return 'Under the 100-game minimum, so it is inspection only.';
 var t=Date.parse(m.fetched_at),at=typeof now==='number'?now:Date.now();
 if(isFinite(t)){
  if(t>at+300000)return 'Its collection timestamp is in the future, so it is inspection only.';
  if(at-t>30*3600000)return 'Collected more than 30 hours ago, so it is inspection only.';
 }
 return 'Inspection only; it does not support automatic selection.';
}
/* A percentage beside a part is a WIN RATE for an observation with its own position,
   cohort and date. It is supporting evidence, never the category, and never silently
   adopted by the slot it happens to sit next to. */
function supportingSample(m,displayPosition,now,subject){
 if(!m)return '<small class="muted">No source observation for this '+(subject||'position')+'.</small>';
 var where=esc(m.label||m.source||'source');
 var line='Win rate '+pct(m.wr)+' over '+games(m.played)+' · '+where+' · collected '+esc(dayDate(m.fetched_at));
 var at=observationPosition(m),mismatch='';
 if(at&&displayPosition&&at!==displayPosition)mismatch=' Recorded at purchase position '+at+', not position '+displayPosition+'.';
 else if(!at&&m.source==='Statz')mismatch=' Recorded against a variant sequence, not this position.';
 var why=exclusionReason(m,now);
 if(why)return '<small class="muted">'+line+'.'+mismatch+' '+esc(why)+'</small>';
 return '<small class="muted">Supporting: '+line+'.'+mismatch+'</small>';
}
/* Said once for the whole build, so a per-part sentence is not repeated six times. */
/* ---- loadout evidence -------------------------------------------------------------
   A sample is shown beside a part only when it is a sample OF THAT PART. The item pool is
   not consulted here: it holds item purchase observations, and an augment, an Eternal and a
   blessing are not items. What describes them is the source build variant, and only the
   variant whose perk and Eternal are the ones being recommended. */
function nk(v){return String(v==null?'':v).toLowerCase().replace(/[^a-z0-9]+/g,'');}
/* The variant that IS this recommendation: same augment, same Eternal. Any other variant
   describes a different loadout, however similar it looks. */
function matchingVariant(plan,stats){
 var builds=(stats&&stats.builds)||[];
 if(!plan||!builds.length)return null;
 for(var i=0;i<builds.length;i++){
  if(nk(builds[i].perk)===nk(plan.augment)&&nk(builds[i].eternal)===nk(plan.eternal))return {build:builds[i],index:i};
 }
 return null;
}
function firstNamed(rows,wanted){
 var list=rows||[];
 for(var i=0;i<list.length;i++){var n=list[i]&&(list[i].display_name||list[i].name);if(nk(n)===nk(wanted))return list[i];}
 return null;
}
/* Where the recommended crest sits in its family. Finding the family and finding the
   recommendation's own observation are separate steps: the family says which rows are
   relevant, and each stage has its OWN sample or none. plannedBuild may recommend the base
   crest, its mid form, or one of its final upgrades. */
function crestForPlan(build,planCrest){
 var crests=(build&&build.best_base_crests)||[];
 for(var i=0;i<crests.length;i++){
  var c=crests[i],ups=c.upgrades||[];
  if(nk(c.display_name||c.name)===nk(planCrest))return {family:c,stage:'base',choice:c};
  if(c.midCrest&&nk(c.midCrest)===nk(planCrest))return {family:c,stage:'mid',choice:null};
  for(var j=0;j<ups.length;j++)if(nk(ups[j].display_name||ups[j].name)===nk(planCrest))return {family:c,stage:'upgrade',choice:ups[j]};
 }
 return null;
}
function crestName(x){return x?(x.display_name||x.name||''):'';}
function hasSample(x){return !!x&&typeof x.winRate==='number'&&isFinite(x.winRate)&&typeof x.playedGames==='number'&&isFinite(x.playedGames);}
/* One lookup per card, built from the plan's OWN hero and role. No module state, so new data
   cannot be served from a stale key. */
function loadoutEvidence(plan,stats,fetchedAt){
 var m=matchingVariant(plan,stats),out={variant:m,fetched_at:fetchedAt||(stats&&stats.fetched_at)||null,parts:{}};
 if(!m)return out;
 var b=m.build,pair={wr:b.winRate,played:b.playedGames,scope:'this augment and Eternal together, source variant '+(m.index+1)};
 out.parts.Augment=pair; out.parts.Eternal=pair;
 var b1=firstNamed(b.common_perks_1,plan.blessings&&plan.blessings[0]);
 var b2=firstNamed(b.common_perks_2,plan.blessings&&plan.blessings[1]);
 if(b1)out.parts['Blessing 1']={wr:b1.winRate,played:b1.playedGames,scope:'this blessing in variant '+(m.index+1)};
 if(b2)out.parts['Blessing 2']={wr:b2.winRate,played:b2.playedGames,scope:'this blessing in variant '+(m.index+1)};
 var cf=crestForPlan(b,plan.crest),v=' in variant '+(m.index+1);
 if(cf){
  out.crest=cf;
  var base=crestName(cf.family);
  /* The recommended crest's OWN row, never its family's. A parent's rate is not evidence
     about the upgrade it leads to, and a mid form without a row gets no borrowed figure. */
  if(cf.stage==='mid')out.parts.Crest={none:'The mid form has no separate sample'+v+'; '+base+'\u2019s own figure is not borrowed for it.'};
  else if(!hasSample(cf.choice))out.parts.Crest={none:(cf.stage==='upgrade'?'This upgrade of '+base:'This crest')+' has no sample of its own'+v+'. Nothing is borrowed from the rest of its family.'};
  else out.parts.Crest={wr:cf.choice.winRate,played:cf.choice.playedGames,
   scope:cf.stage==='upgrade'?'this final upgrade of '+base+v:'this base crest'+v};
 }
 return out;
}
/* 2.50.0: the strip names its category, source variant and collection date once (loadoutHeadHTML); each part shows
   only its own figure, and the Eternal, which shares the augment's pair figure, says so instead of repeating it. */
function loadoutSampleHTML(ev,label){
 var s=ev&&ev.parts?ev.parts[label]:null;
 if(!ev||!ev.variant)return '';
 if(!s)return '<small class="muted">No observation for this choice in that variant.</small>';
 if(s.none)return '<small class="muted">'+esc(s.none)+'</small>';
 if(label==='Eternal'&&ev.parts.Augment===s)return '<small class="muted">Same pair as the augment<span class="sr-only">: win rate '+pct(s.wr)+' over '+games(s.played)+'</span></small>';
 return '<small class="muted"><span class="sr-only">Win rate </span>'+pct(s.wr)+' · '+games(s.played)+'<span class="sr-only"> · '+esc(s.scope)+'</span></small>';
}
function loadoutHeadHTML(plan,ev){var c=buildCategory(plan,null);
 return '<p class="loadout-head">'+badge(c.text,c.type)+'<small class="muted">'+(ev&&ev.variant?'Figures: source variant '+(ev.variant.index+1)+' · collected '+esc(dayDate(ev.fetched_at)):'No source variant matches this augment and Eternal, so no part has a figure.')+'</small></p>';}
/* The categories engine.js actually produces for a build part. A part is never reduced
   to "observed or substituted": a reviewed core, a calculated starting selection, a
   source playstyle the reader chose, an item merely brought forward and an item actually
   replaced are five different claims. */
function loadoutPartHTML(label,name,kind,plan,ev){
 if(!name)return '<div class="loadout-absent"><small>'+esc(label)+'</small><p class="muted">Unavailable in this source.</p></div>';
 return '<div><small>'+esc(label)+'</small>'+itemButton(name,kind)+loadoutSampleHTML(ev,label)+'</div>';
}
/* The crest path, stated rather than implied: base, mid form, final upgrade, with the
   recommendation marked where it sits. A recommended FINAL upgrade does not evolve again, so
   its siblings are shown as alternatives to it, not as next steps. Every stage shows its own
   sample or says it has none. */
function crestRowSample(x,ev,what){
 if(!hasSample(x))return '<small class="muted">'+esc(what)+' has no sample of its own in that variant.</small>';
 return '<small class="muted">'+esc(what)+': '+pct(x.winRate)+' · '+games(x.playedGames)+'</small>';
}
// One choice inside a shared tile: the item and its own figure (or that it has none).
function crestOptionHTML(u){return '<li>'+itemButton(crestName(u),'items')+'<small class="muted">'+(hasSample(u)?'<span class="sr-only">Win rate </span>'+pct(u.winRate)+' · '+games(u.playedGames):'No sample of its own')+'</small></li>';}
function crestEvolutionHTML(ev,planCrest){
 if(!ev||!ev.variant)return '<div class="loadout-absent"><small>Crest path</small><p class="muted">No source variant matches the recommended augment and Eternal, so no crest rows apply.</p></div>';
 if(!ev.crest)return '<div class="loadout-absent"><small>Crest path</small><p class="muted">That variant recommends a different crest, so its rows do not describe '+esc(planCrest||'this crest')+'. Nothing is estimated in their place.</p></div>';
 var cf=ev.crest,fam=cf.family,base=crestName(fam),mid=fam.midCrest||null,ups=fam.upgrades||[];
 var mark=function(stage,label){return cf.stage===stage?'<strong>'+esc(label)+' (recommended'+(stage==='upgrade'?', final':'')+')</strong>':esc(label);};
 var path='<div class="loadout-context"><small>Crest path</small><p class="crest-path">'
  +mark('base',base)+(mid?TO+mark('mid',mid):'')
  +TO+(cf.stage==='upgrade'?mark('upgrade',crestName(cf.choice)):'one final upgrade')+'</p>'
  +crestRowSample(fam,ev,'Base crest, '+base)
  +(mid?'<small class="muted">The mid form, '+esc(mid)+', has no separate sample in this source.</small>':'')+'</div>';
 if(cf.stage==='upgrade'){
  var siblings=ups.filter(function(u){return nk(crestName(u))!==nk(crestName(cf.choice));});
  if(!siblings.length)return path+'<div class="loadout-absent"><small>Other final upgrades</small><p class="muted">No other final upgrade of '+esc(base)+' in this source.</p></div>';
  return path+'<div class="loadout-options"><small>Other final upgrades</small>'+badge('Observed alternatives','observed')+'<p class="muted">Each is an alternative to '+esc(crestName(cf.choice))+', not a further step.</p><ul>'+siblings.map(crestOptionHTML).join('')+'</ul></div>';
 }
 if(!ups.length)return path+'<div class="loadout-absent"><small>Evolves into</small><p class="muted">No final-upgrade rows in this source for '+esc(base)+'. Nothing is estimated in their place.</p></div>';
 return path+'<div class="loadout-options"><small>Evolves into</small>'+badge('Observed choices','observed')+'<p class="muted">Final upgrades of '+esc(base)+'.</p><ul>'+ups.map(crestOptionHTML).join('')+'</ul></div>';
}
function companionChrome(){
 if(companionMedia.matches){$('#menu-toggle').textContent='More';$('#menu-toggle').removeAttribute('aria-expanded');$('#menu-toggle').setAttribute('aria-controls','main');}
 document.documentElement.classList.toggle('large-text',!!companionPrefs.large);
 let nav=$('#mobile-navigation');if(!nav){nav=document.createElement('nav');nav.id='mobile-navigation';nav.setAttribute('aria-label','Phone navigation');document.body.append(nav);}
 stableHTML('#mobile-navigation',destinationNavigation(true));
 let status=$('#offline-status');if(!status){status=document.createElement('div');status.id='offline-status';status.setAttribute('role','status');$('.workspace').prepend(status);}status.textContent=navigator.onLine?'':'Offline · using saved data. Reconnect to check updates.';status.hidden=navigator.onLine;
 let limits=$('#mobile-limits');if(!limits){limits=document.createElement('button');limits.id='mobile-limits';limits.type='button';status.after(limits);}
 const limitation=companionMedia.matches&&B?limitationItems():[];limits.hidden=!limitation.length;
 if(limitation.length){const material=limitation.filter(i=>i.severity==='error'&&isMaterialError(i)),lead=material[0]||limitation[0];limits.classList.toggle('material',material.length>0);const html=`<strong><span class="limits-label">${material.length?'Source failure':'Limitations'}</span><span class="limits-sep"> · </span><span class="limits-count">${limitation.length}</span></strong><span>${esc(lead.source+': '+lead.detail)}</span><span aria-hidden="true">Details ›</span>`;if(limits.dataset.rendered!==html){limits.innerHTML=html;limits.dataset.rendered=html;}}
 // 2.37.0: on phones the limitations summary is always a compact chip in the rank row (the dialog keeps the detail).
 const compactContext=companionMedia.matches,tools=document.querySelector('.topbar .tools');document.body.classList.toggle('compact-context',compactContext);
 if(compactContext&&tools&&limits.parentElement!==tools)tools.append(limits);else if(!compactContext&&limits.previousElementSibling!==status)status.after(limits);

}
function displayedRoleText(perf){return savedTag(perf.fetched_at,perf.retained)+pct(perf.wr)+' · '+games(perf.played)+' · '+esc(perf.source)+' '+esc(perf.patch||'')+' · '+esc(date(perf.fetched_at))+(perf.inspection_only?' · Previous dataset; not current-patch evidence':'');}
// 2.37.0: a row shows a tier only when one applies, and flags only the few heroes without a reviewed build.
// 2.50.0: a calculated tier standing in for a withheld reviewed grade says why once, above the list (tierFallbackNote),
// instead of on every row; each row keeps its Calculated label.
function tierFallbackNote(role,rows){const held=rows.map(r=>shownTier(r.slug,role)).filter(t=>t?.kind==='calculated'&&t.fallback),queued=held.filter(t=>t.recheck).length;
 return held.length?`<p class="simple-source meta-tier-note">${held.length===1?'1 reviewed grade is':held.length+' reviewed grades are'} withheld${queued===held.length?' (recheck queued)':queued?' ('+queued+' with a recheck queued)':''}; ${held.length===1?'its row shows':'those rows show'} the calculated tier.</p>`:'';}
function heroTile(p,{favorite=false,flagBuild=true}={}){const perf=E.displayPerformance(p),plan=E.buildReview(p.slug,p.role),ready=!flagBuild||!!plan?.active,shown=perf&&!perf.inspection_only?shownTier(p.slug,p.role):null,tierValue=shown?.tier||null,calculated=shown?.kind==='calculated'?'Calculated':'';return `<article class="mobile-hero-card"${perf?wrVars(perf.wr):''}><div class="meta-hero-identity">${heroButton(p.slug,p.role).replace('</button>',(ready?'':`<span class="chip tag warning no-build-chip">${plan?'Build needs review':'No reviewed build'}</span>`)+'</button>')}</div><div class="mobile-stat">${perf?`${tierValue?tier(tierValue):''} <strong>${pct(perf.wr)}</strong><small>${calculated?`<span class="calculated tier-kind">${esc(calculated)}</span>`:''}${games(perf.played)}${perf.played<100?' · small sample':''}${perf.inspection_only?' · previous dataset':''}</small>`:`<small>${esc(noStatsText(p.role,p.slug))}</small>`}</div>${favorite?`<button class="favorite-button" data-favorite="${p.slug}|${p.role}" aria-label="Remove ${esc(name(p.slug))} from favorites">${star(true)}</button>`:''}</article>`;}
function strategyReviewDue(){return !!B&&E.strategyReviewDue().due;}
// 2.51.0: the freshness facts behind the phone status button, shared with the desktop ticker's state tag.
function statusFacts(){const core=latestStatus.health?.core_statistics||{},source=B?.sources?.statz_hero_pages||{},when=core.updated_at||source.fetched_at,state={current:'Current',aging:'Aging',stale:'Stale',retained:'Saved',unavailable:'Unavailable'}[E.sourceCurrency({...source,fetched_at:when}).state],verification=(()=>{try{return E.evidenceState().verification.state;}catch{return 'verified';}})(),pendingCheck=verification==='verified'&&(()=>{try{return E.performancePolicy().label==='Verification required';}catch{return false;}})(),paused=!!B&&(verification!=='verified'||pendingCheck),newContent=/content changed after this collection/i.test(B?.recommendation_context?.reason||''),label=paused?'Paused':E.displayPerformancePolicy().inspection_only?'Previous data':state;return {core,source,when,state,verification,pendingCheck,paused,newContent,label};}
function mobileStatusHTML(){const {core,source,when,state,verification,pendingCheck,paused,newContent,label}=statusFacts();return `<button class="mobile-health ${paused?'stale':state.toLowerCase()}" data-route="data"><strong>${esc(label)}</strong><span>${APP_CONFIG.mode==='export'?'Snapshot':local||shared?'App refresh':'Site refresh'} · Statz fetched ${esc(relativeTime(when))}${source.status==='retained'?' · retained':''}${E.statzGap?.()?' · '+E.statzGap().failed+(E.statzGap().failed===1?' hero page failed':' hero pages failed'):''} · Statz dataset ${esc(B?.patch||'unknown')} · ${paused?(newContent?'New official content · recommendations paused':pendingCheck?(/live verification failed/i.test(B?.guidance?.status||'')?'Live check failed · recommendations paused':'Live check pending · recommendations paused'):'Patch check failed · recommendations paused'):'Game patch '+esc(B?.official?.status==='verified'?B.official.live?.version:'unverified')}${(()=>{try{const b=E.evidenceState().builds;return b?' · Builds '+b.ready+'/'+b.total+' ready':'';}catch{return '';}})()}${strategyReviewDue()?' · Strategy review due':''}${(()=>{const x=['Stale','Aging','Saved','Paused'].includes(label)&&staleWhyNext();return !x?'':label==='Paused'?' · '+esc(x.check):' · '+esc(x.why)+' '+esc(x.next);})()}</span></button>`;}
function relativeTime(value){const ms=Date.now()-Date.parse(value);if(!Number.isFinite(ms))return 'unavailable';if(ms<-300000)return 'at a time ahead of this device\'s clock';const hours=Math.max(0,Math.floor(ms/3600000));return hours<1?'less than 1h ago':hours<24?hours+'h ago':Math.floor(hours/24)+'d ago';}
function roleListOrder(role){
 const chosen=['reviewed','wr','name'].includes(companionPrefs.metaOrder)?companionPrefs.metaOrder:'reviewed',all=roleHeroes(role).all;
 const byName=(a,b)=>name(a.slug).localeCompare(name(b.slug));
 if(chosen==='name')return all.sort(byName);
 if(E.displayPerformancePolicy().inspection_only)return chosen==='wr'?all.sort((a,b)=>(E.displayPerformance(b)?.wr??-1)-(E.displayPerformance(a)?.wr??-1)||byName(a,b)):all.sort(byName);
 const sampled=all.filter(r=>r.perf?.played>=100),rest=all.filter(r=>!(r.perf?.played>=100)).sort(byName);
 // 2.45.0: the tier order uses the tier each row shows: an active reviewed grade, otherwise the calculated tier.
 sampled.sort((a,b)=>{if(chosen==='reviewed'){const gap=(TIER_ORDER[shownTier(a.slug,role)?.tier]??9)-(TIER_ORDER[shownTier(b.slug,role)?.tier]??9);if(gap)return gap;}return b.perf.wr-a.perf.wr||b.perf.played-a.perf.played||byName(a,b);});
 return sampled.concat(rest);
}
function savedHeroShortcuts(favorites,recent){
 const seen=new Set(favorites.map(p=>p.slug+'|'+p.role));
 const recentOnly=recent.filter(p=>!seen.has(p.slug+'|'+p.role));
 if(!favorites.length&&!recentOnly.length)return '';
 const shortcut=p=>`<button data-hero="${esc(p.slug)}" data-role="${esc(p.role)}">${esc(name(p.slug))}<small>${esc(labels[p.role])}</small></button>`;
 return `<details class="saved-heroes" data-keep="saved-heroes"${companionPrefs.savedOpen?' open':''}><summary>Your heroes · ${favorites.length} ${favorites.length===1?'favorite':'favorites'} · ${recentOnly.length} recent</summary>${favorites.length?`<section id="mobile-favorites"><h2>Favorites</h2><div class="saved-hero-list">${favorites.map(p=>`<div>${shortcut(p)}<button class="favorite-button" data-favorite="${esc(p.slug+'|'+p.role)}" aria-label="Remove ${esc(name(p.slug))} ${esc(labels[p.role])} from favorites">${star(true)}</button></div>`).join('')}</div></section>`:''}${recentOnly.length?`<section id="mobile-recent"><h2>Recent</h2><div class="saved-hero-list">${recentOnly.map(p=>`<div>${shortcut(p)}</div>`).join('')}</div></section>`:''}</details>`;
}
function guidedHome(){
 const role=roleOrder.includes(S.role)?S.role:'jungle',query=String(companionPrefs.homeQuery||'').toLowerCase(),everyone=roleHeroes(role),rows=roleListOrder(role).filter(r=>name(r.slug).toLowerCase().includes(query));
 const order=companionPrefs.metaOrder||'reviewed',tiers=S.bracket==='gold'?E.metaReviewSummary(role):null,tiersLead=!!tiers?.active,policy=E.performancePolicy(),savedStats=policy.saved?' · saved statistics, fetched '+date(policy.fetched_at):'';
 const failedStats=everyone.rest.filter(r=>!r.perf&&statsReason(r.slug,role)==='failed').length;
 const favorites=companionPrefs.favorites.map(v=>{const [slug,r]=v.split('|');return {slug,role:r};}).filter(p=>E.heroes[p.slug]&&E.roles(p.slug).includes(p.role));
 const recent=companionPrefs.recent.filter(p=>E.heroes[p.slug]&&E.roles(p.slug).includes(p.role)).slice(0,5);
 const changes=(B.changes?.vs_previous_run?.changes||[]).filter(c=>c.role===role&&c.matches_from>=100&&c.matches_to>=100&&Math.abs(c.wr_delta)>=.005).sort((a,b)=>Math.abs(b.wr_delta)-Math.abs(a.wr_delta)).slice(0,3);
 const calculatedLead=order==='reviewed'&&!tiersLead&&everyone.sampled.some(r=>calculatedTier(r.slug,role)?.tier),ordering=order==='name'?'Alphabetical order':tiersLead&&order==='reviewed'?'Reviewed tier, then role performance':calculatedLead?'Calculated tier, then role performance in '+(B.bracket?.label||'selected rank'):'Role performance in '+(B.bracket?.label||'selected rank');
 const fallback=E.displayPerformancePolicy(),displayed=everyone.all.filter(r=>E.displayPerformance(r)).length;
 const sortOptions=fallback.inspection_only?[['name','Hero name'],['wr','Previous win %']]:[['reviewed','Tier'],['wr','Observed win rate'],['name','Hero name']];
 const displayedOrder=fallback.inspection_only&&order==='reviewed'?'name':order;
 const availability=fallback.inspection_only?'Current-patch statistics are '+(policy.label==='Verification required'?'paused':'unavailable')+'. '+displayed+' heroes have previous Statz '+fallback.patch+' samples below; fetched '+date(fallback.fetched_at)+'. They do not rank current recommendations.':!policy.source?'Role statistics are '+(policy.label==='Verification required'?'paused':'unavailable')+': '+(policy.note||'')+' Heroes remain available without numbers.':failedStats===everyone.all.length?'Statistics for all '+failedStats+' '+labels[role].toLowerCase()+' heroes failed to load in this collection. Heroes remain available without numbers.':!everyone.sampled.length?'No '+labels[role].toLowerCase()+' hero has 100 or more games in '+(B.bracket?.label||'this rank')+' yet. Smaller samples remain visible below.':everyone.sampled.length===1?'Only 1 '+labels[role].toLowerCase()+' hero has 100 or more games in '+(B.bracket?.label||'this rank')+'.':everyone.sampled.length+' heroes meet the 100-game eligibility threshold.';
 const lead=fallback.inspection_only?(policy.label==='Verification required'?'Editorial tiers are paused. ':'')+'Previous role statistics remain available while sources catch up. '+(order==='wr'?'Ordered by previous-dataset win rate.':'Alphabetical order; current rankings are unavailable.'):!policy.source?(S.bracket==='gold'?'Editorial tiers are paused for this role'+(tiers?.reason?' ('+tiers.reason.toLowerCase()+')':'')+'. ':'')+availability:order==='name'?'Heroes are listed alphabetically; measured rates and reviewed tiers remain separate.':tiersLead&&order==='reviewed'?'Reviewed tier guidance leads; role samples keep their source dates.':S.bracket==='gold'?'Editorial tiers '+(tiersLead?'are available separately':'are paused for this role'+(tiers?.reason?' ('+tiers.reason.toLowerCase()+')':''))+'. '+(everyone.sampled.length?(calculatedLead?'Heroes are ordered by calculated tier, then role performance.':'Heroes are ordered by role performance.'):availability):(calculatedLead?'Tiers are calculated from '+(B.bracket?.label||'this rank')+' games; Gold+ editorial guidance remains separate.':'Selected-rank statistics lead; Gold+ editorial guidance remains separate.');
 const compact=!companionPrefs.fullDetails;
 const overview=fallback.inspection_only?'Previous statistics · not a current ranking':!policy.source?'Role statistics '+(policy.label==='Verification required'?'paused':'unavailable'):policy.saved?'Saved statistics · check source dates':'Statistics & sample eligibility';
 const listStatus=`<p id="meta-order-status">${esc(availability)} ${policy.source?esc(ordering+savedStats)+'. ':''}The 100-game line is eligibility, not confidence.${order==='name'?'':' Smaller or missing samples follow the eligible rows.'}</p>`;
 // 2.37.0 quick view: the role strip is the heading, search and order share one row, and the statistics note
 // appears only when statistics are saved, previous or unavailable (the rank-row chip carries source issues).
 const unusual=fallback.inspection_only||!policy.source||policy.saved;
 // A missing reviewed build is flagged on its row only while it is the exception; when most of the role awaits review
 // (a new patch), one line says so instead of a chip on every row.
 const unreviewed=everyone.all.filter(r=>!E.buildReview(r.slug,role)?.active).length,flagBuilds=unreviewed*2<=everyone.all.length;
 const buildNote=!flagBuilds?`<p class="simple-source meta-build-note">Most ${esc(labels[role].toLowerCase())} starting builds are awaiting review for this patch; each hero page labels what it shows.</p>`:'';
 // 2.50.0: a search that matches heroes outside this role offers them instead of a dead end.
 const elsewhere=query&&!rows.length?Object.keys(E.heroes).filter(s=>!E.roles(s).includes(role)&&name(s).toLowerCase().includes(query)).sort((a,b)=>name(a).localeCompare(name(b))).slice(0,6):[];
 const noMatch=elsewhere.length?`<div class="empty meta-elsewhere"><p>No ${esc(labels[role].toLowerCase())} matches “${esc(companionPrefs.homeQuery)}”. In other roles:</p><div class="meta-elsewhere-list">${elsewhere.map(s=>heroButton(s,E.roles(s)[0])).join('')}</div><button type="button" class="quiet" data-clear-search>Clear search</button></div>`:empty('No hero matches this role and search.')+'<button type="button" class="quiet" data-clear-search>Clear search</button>';
 return (typeof readingModeBar==='function'?readingModeBar():'')+(compact?'':mobileStatusHTML())+(companionError?note(esc(companionError),true):'')+(compact?`<h1 class="sr-only">Meta · ${esc(B.bracket?.label||'')} · ${esc(labels[role])}</h1>`:head('Meta · '+esc(B.bracket?.label||''),labels[role]+' at a glance',esc(lead)))+
 `<div class="role-choices compact tab-strip tab-strip--segmented" role="tablist" aria-label="Role">${roleOrder.map(r=>`<button role="tab" data-mobile-role="${r}" aria-selected="${role===r}">${labels[r]}</button>`).join('')}</div><div class="meta-list-controls${compact?' meta-list-controls--quick':''}"><label class="mobile-search"><span${compact?' class="sr-only"':''}>Find a ${esc(labels[role].toLowerCase())}</span><input id="mobile-hero-search" type="search" autocomplete="off" placeholder="${compact?'Find a '+esc(labels[role].toLowerCase()):'Hero name'}" value="${esc(companionPrefs.homeQuery)}"></label><label><span${compact?' class="sr-only"':''}>Order by</span><select id="mobile-meta-order">${options(sortOptions,displayedOrder)}</select></label></div>`+
 savedHeroShortcuts(favorites,recent)+
 `<section id="mobile-role-list">${compact&&unusual?`<details class="meta-context" data-keep="meta-context"><summary>${esc(overview)}</summary><div class="detail-content">${mobileStatusHTML()}<p>${esc(lead)}</p>${listStatus}</div></details>`:''}${compact?`<h2 class="sr-only">${esc(labels[role])} heroes · ${rows.length} of ${everyone.all.length}</h2>`:`<div class="section-title"><h2>All ${esc(labels[role].toLowerCase())} heroes</h2><small>Showing ${rows.length} of ${everyone.all.length}</small></div>`}${compact?'':listStatus}${tierFallbackNote(role,rows)}<div class="mobile-card-list" id="mobile-all-list">${rows.map(r=>heroTile({slug:r.slug,role},{flagBuild:flagBuilds})).join('')||noMatch}</div>${buildNote}</section>`+
 `<section id="mobile-changes"><div class="section-title"><h2>What changed</h2><button class="quiet" data-route="changes">All changes</button></div>${changes.length?`<div class="mobile-card-list">${changes.map(c=>`<article class="mobile-change">${heroButton(c.slug,c.role,true)}<strong class="${c.wr_delta>0?'positive':'negative'}">${pp(c.wr_delta)}</strong><small>${num(c.matches_from,0)}${TO}${num(c.matches_to,0)} games</small></article>`).join('')}</div>`:empty('No qualifying win-rate movement in the available same-rank comparison.')}</section>`;
}
function mobileHero(){
 const p={slug:S.hero,role:S.heroRole};if(!E.heroes[p.slug])return guidedHome();if(!['builds','pairings','counters','kit'].includes(S.heroTab))S.heroTab='builds';
 const why=pickBlock(p.slug,p.role),mine=S.me===p.slug&&S.locks.some(x=>x.slug===p.slug&&x.role===p.role),blocked=mine?'':why,perf=E.displayPerformance(p),fav=companionPrefs.favorites.includes(p.slug+'|'+p.role);
 const full=heroView(),node=document.createElement('div');node.innerHTML=full.slice(full.indexOf('<nav class="toolbar hero-jump"'));const body=node.innerHTML;
 return `<button class="text-button back" data-route="meta">Meta</button>${mobileStatusHTML()}<div class="hero-header mobile-hero-head"${artVars(p.slug)}>${art(p.slug,'large')}<div><h1>${esc(name(p.slug))}</h1><label>Role<select id="mobile-hero-role">${options(E.roles(p.slug).map(r=>[r,labels[r]]),p.role)}</select></label></div><p class="mobile-hero-status">${metaTierButton(p.slug,p.role)}<span>${perf?displayedRoleText(perf):esc(roleSampleText(p.slug,p.role))}</span></p></div><div class="hero-actions"><button id="favorite-hero" aria-pressed="${fav}">${star()}${fav?'Favorited':'Favorite'}</button><button id="share-hero">Share</button><button data-start-live="true" ${blocked?'disabled aria-describedby="start-live-reason"':''}>${mine?'Open Match':'Use in Match'}</button></div>${blocked?`<p id="start-live-reason">${esc(blocked)}. Choose another hero or role.</p>`:''}${body}`;
}
function mobileBuilds(){const rows=Object.keys(E.heroes).filter(slug=>E.roles(slug).includes(S.role)&&name(slug).toLowerCase().includes(S.query.toLowerCase())).sort((a,b)=>name(a).localeCompare(name(b)));return head('Builds · '+esc(B.bracket?.label||''),'Starting builds','Choose a role, then open one compact plan. Source variants remain on the hero page.')+metaToolbarHTML()+maintenanceHTML()+`<div class="mobile-build-list">${rows.map(slug=>{const plan=E.plannedBuild(slug,S.role),perf=E.displayPerformance({slug,role:S.role});return `<details class="panel mobile-build-row" data-keep="build-${slug}"><summary>${art(slug,'tiny')}<span><strong>${esc(name(slug))}</strong><small>${perf?compactRoleText(perf):'Role sample unavailable'}</small></span><span>${plan.kind==='reviewed'?badge('Reviewed','reviewed'):badge('Provisional','warning')}</span></summary><div class="detail-content">${plannedBuildHTML(plan,true)}<button data-hero-builds="${slug}" data-role="${S.role}">Open full build</button></div></details>`;}).join('')}</div>${!rows.length?empty('No heroes match this role and search.'):''}`;}
// 2.37.0: More holds reference screens, sources and preferences. Draft sharing, export and the review packet are
// desktop tools (the desktop top bar keeps Share, Open and Export); the phone list stays short and tappable.
function moreView(){const phone=companionMedia.matches,installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 return head(phone?'More':'Sources',phone?'More':'Settings',phone?'Reference, sources and preferences.':'Reference, evidence and preferences.')+`<div class="more-grid">${[['library','Items & loadouts'],['builds','Starting builds'],['guidance','Reviewed guide'],['changes','Changes'],['data','Sources & accuracy']].map(([r,t])=>`<button data-route="${r}">${t}</button>`).join('')}${phone?'':'<button id="download-review-packet">Download strategy review packet</button>'}${installed?'':'<button id="companion-install">Install / offline help</button>'}</div><section class="panel more-preferences"><h2>Preferences</h2><button id="companion-theme">Switch to ${document.documentElement.dataset.theme==='light'?'dark':'light'} theme</button><label><input id="large-text" type="checkbox" ${companionPrefs.large?'checked':''}> Large text</label></section>`;}
function downloadReviewPacket(){const packet=E.reviewPacket({revision:typeof revision==='string'?revision:null,cohorts:typeof publishedCohorts==='object'?publishedCohorts:null,toolVersion:APP_CONFIG.tool_version});const blob=new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Predecessor-strategy-review-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
// ---- Phase H: browse every hero of a role, compact limitations, Live hero replacement with preview and Undo. ----
let metaShowAll=false;
function metaOrder(role){return (a,b)=>{{const d=(TIER_ORDER[shownTier(a.slug,role)?.tier]??9)-(TIER_ORDER[shownTier(b.slug,role)?.tier]??9);if(d)return d;}return (b.perf.wr??-1)-(a.perf.wr??-1)||(b.perf.played??0)-(a.perf.played??0);};}
// Every hero that plays the role: sampled heroes (100+ games) in Meta order, then the rest by sample size. Nothing is estimated.
// Why a hero shows no numbers: statistics paused for the whole page, or no sample for this rank and role.
function statsReason(slug,role){let policy={};try{policy=E.performancePolicy();}catch{}if(!policy.source)return policy.label==='Verification required'?'paused':'unavailable';if(policy.source==='pred'){const roles=B?.scoped_statistics?.roles;if(roles&&(!roles[role]||roles[role].status==='failed'))return 'failed';}if(policy.source==='statz'&&['failed','patch_conflict'].includes(B?.heroes?.[slug]?.roles?.[role]?.status))return 'failed';return 'none';}
// The same reason, naming the source the ranking actually uses (for the coach and the hero header).
function roleSampleText(slug,role){if(E.displayPerformancePolicy().inspection_only)return noStatsText(role,slug);let policy={};try{policy=E.performancePolicy();}catch{}const source=policy.source==='pred'?'Pred.gg':'Statz',r=(labels[role]||role).toLowerCase();return {paused:'Role statistics paused',unavailable:'Role statistics unavailable',failed:source+' '+r+' statistics failed to load',none:'No '+source+' '+(B?.bracket?.label||'rank')+' '+r+' sample'}[statsReason(slug,role)];}
function noStatsText(role,slug){if(E.displayPerformancePolicy().inspection_only)return 'No previous Statz '+(B.patch||'')+' '+(labels[role]||role).toLowerCase()+' sample';return {paused:'Statistics paused',unavailable:'Role statistics unavailable',failed:'Statistics failed to load',none:'No '+(B?.bracket?.label||'rank')+' '+(labels[role]||role).toLowerCase()+' sample'}[statsReason(slug,role)];}
function roleHeroes(role){const all=Object.keys(E.heroes).filter(slug=>E.roles(slug).includes(role)).map(slug=>({slug,role,perf:E.performance({slug,role})}));const sampled=all.filter(r=>r.perf?.played>=100).sort(metaOrder(role)),rest=all.filter(r=>!(r.perf?.played>=100)).sort((a,b)=>(b.perf?.played??-1)-(a.perf?.played??-1)||name(a.slug).localeCompare(name(b.slug)));return {sampled,rest,all:sampled.concat(rest)};}
function limitationItems(){let ev=null;try{ev=E.evidenceState();}catch{}const items=(ev?.limitations||[]).map(detail=>({source:'Evidence',detail,severity:ev.verification.state==='verified'?'warning':'error'})),key=i=>i.source+'|'+String(i.detail).slice(0,60),seen=new Set(items.map(key));for(const e of errors()){if(!seen.has(key(e))){seen.add(key(e));items.push(e);}}return items;}
// 2.37.0: what changes what a player sees comes first; source-audit detail stays one tap away.
function playerLimitation(i){return i.severity==='error'||/retained|community|current-patch statistics|verification|not refreshed|could not be refreshed/i.test(i.source+' '+i.detail);}
function limitsDialogHTML(){const items=limitationItems(),player=items.filter(playerLimitation),audit=items.filter(i=>!playerLimitation(i)),row=i=>`<li><strong>${esc(sourceLabel(i.source))}</strong> ${esc(humanKeys(i.detail))}</li>`;
 return `<p>Each source keeps its own date. Nothing is estimated when a source is missing.</p>${player.length?`<ul class="limits-list">${player.map(row).join('')}</ul>`:'<p>Nothing affects what you see right now.</p>'}${audit.length?`<details class="limits-audit"><summary>Source details · ${audit.length}</summary><ul class="limits-list">${audit.map(row).join('')}</ul></details>`:''}<button data-limits-sources="true">Open Sources &amp; accuracy</button>`;}
// Why a hero cannot be your Live hero in this role ('' when it can). An ally holding the role can be replaced.
function pickBlock(slug,role){if(!E.heroes[slug]||!E.roles(slug).includes(role))return 'Role unavailable';if(S.bans.includes(slug))return 'Banned';if(S.enemies.some(p=>p.slug===slug))return 'Picked by the enemy team';const ally=S.locks.find(p=>p.slug===slug);if(slug===S.me&&ally?.role===role)return 'Your current hero';if(ally&&ally.role!==role&&slug!==S.me)return 'On your team as '+labels[ally.role];return '';}
function renderCompanion(){
 if(!B){if(companionMedia.matches){$('#main').innerHTML=latestStatus.errors?.length?`<h1>Data unavailable</h1><p>${esc(latestStatus.errors[0].detail)}</p><button id="retry-companion">Retry update</button><p>Choose another rank above to inspect available data.</p>`:`<h1>Loading hero data</h1><p role="status">Your selections are safe. Opening ${esc(S.bracket)}…</p><div class="loading-skeleton" aria-hidden="true"></div>`;return true;}return false;}
 if(S.route==='more'){$('#main').innerHTML=moreView();return true;}
 if(!companionMedia.matches)return false;
 if(S.route==='meta'){$('#main').innerHTML=guidedHome();return true;}
 if(S.route==='hero'){$('#main').innerHTML=mobileHero();return true;}
 if(S.route==='builds'){$('#main').innerHTML=mobileBuilds();return true;}
 if(['match','planner','draft','live'].includes(S.route)){S.route='match';$('#main').innerHTML=matchView();return true;}
 return false;
}
// Guard the same role controls on both layouts; invalid options explain the conflict.
const originalChangeRoute=changeRoute,originalOpenHero=openHero;
const originalDetail=detail;let dialogReturn=null,dialogSituation=null,dialogReturnKey='';
// The control that opened a dialog, by id or data attributes, so focus can return to its redrawn copy.
function returnSelector(el){if(!el||el===document.body||el===document.documentElement)return '';if(el.id)return '#'+CSS.escape(el.id);const data=[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>'['+a.name+'="'+CSS.escape(a.value)+'"]').join('');return data?el.tagName.toLowerCase()+data:'';}
// 2.50.0: on the phone an open dialog is its own history entry, so Back (the system gesture) closes only the dialog
// instead of also leaving the page behind it. Closing it any other way removes that entry again.
let dialogEntry=false,dialogBackPending=false;
detail=function(title,body,refresh){const opening=!document.querySelector('#detail')?.open;if(opening){dialogReturn=document.activeElement;dialogReturnKey=returnSelector(dialogReturn);dialogSituation=dialogReturn?.dataset?.editSituation;}originalDetail(title,body,refresh);
 if(opening&&companionMedia.matches&&!historyApplying&&!dialogEntry&&location.protocol!=='file:'&&B&&writeNavigation('pushState',{...history.state,dialog:true},location.href))dialogEntry=true;};
$('#detail').addEventListener('close',()=>{if(!dialogEntry)return;dialogEntry=false;if(history.state?.dialog){dialogBackPending=true;history.back();}});
$('#detail').addEventListener('click',event=>{const d=event.currentTarget;if(event.target!==d)return;const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();});
$('#detail').addEventListener('close',()=>{const again=!dialogReturn?.isConnected&&dialogReturnKey?document.querySelector('#main '+dialogReturnKey):null;if(dialogReturn?.isConnected)dialogReturn.focus();else if(again)again.focus();else if(dialogReturn?.hasAttribute('data-edit-roster'))document.querySelector('[data-edit-roster]')?.focus();else if(dialogSituation)document.querySelector('[data-edit-situation]')?.focus();else $('#main').focus({preventScroll:true});});
let navigationTransition=false,navigationRestore=null,linkedBracketPending=null,navigationRankChange=null;
try{history.scrollRestoration='manual';}catch{}
function writeNavigation(method,state,url){try{history[method](state,'',url);return true;}catch(e){if(e?.name!=='SecurityError')throw e;return false;}}
function navigationState(){return {route:S.route,hero:S.hero,role:S.heroRole,tab:S.heroTab,bracket:S.bracket,metaRole:S.role,query:S.query,sort:S.sort,direction:S.direction,full:S.full,homeQuery:companionPrefs.homeQuery,showAll:metaShowAll};}
function navigationHash(n){
 const q=new URLSearchParams();
 if(n.route==='hero'&&n.hero){q.set('hero',n.hero);q.set('role',n.role);q.set('bracket',n.bracket);q.set('tab',n.tab);}
 else {const d=destinationFor(n.route);q.set('view',d);if(d==='reference')q.set('section',Object.keys(referenceSections).find(k=>referenceSections[k]===n.route)||'playbook');if(n.route==='more')q.set('section','settings');if(d==='meta'||n.route==='builds')q.set('role',n.metaRole);q.set('bracket',n.bracket);}
 return '#'+q.toString();
}
// Checkpoint only when leaving a screen. Scrolling itself never writes browser history.
function saveNavigationPosition(){
 if(historyApplying||location.protocol==='file:')return;
 const n=history.state?.companion||navigationState();
 const view={...n,metaRole:S.role,query:S.query,sort:S.sort,direction:S.direction,full:S.full,homeQuery:companionPrefs.homeQuery,showAll:metaShowAll};
 writeNavigation('replaceState',{...history.state,companion:view,scrollY,disclosures:disclosureStates()},location.href);
}
function recordNavigation(replace=false){
 if(historyApplying||location.protocol==='file:'||!B)return;
 const n=navigationState(),hash=navigationHash(n),url=new URL(location.href);url.hash=hash;
 if(history.state?.companion&&JSON.stringify(history.state.companion)===JSON.stringify(n)&&location.hash===hash)return;
 if(writeNavigation(replace?'replaceState':'pushState',{companion:n,scrollY,disclosures:disclosureStates()},url))linkApplied=url.hash;
}
// 2.50.0: the META tab returns to the reader's place in the list they left (same role and search); tapping it while on
// Meta starts at the top, as before.
let metaPlace=null;
function leaveMeta(){if(S.route==='meta'&&companionMedia.matches)metaPlace={role:S.role,query:companionPrefs.homeQuery,y:scrollY};}
changeRoute=function(route){
 const back=destinationRoute(route)==='meta'&&S.route!=='meta'&&companionMedia.matches?metaPlace:null;
 leaveMeta();if(destinationRoute(route)==='meta'&&S.route==='meta')metaPlace=null;
 saveNavigationPosition();navigationRestore=null;navigationTransition=true;
 // Suppress an old URL during the draw; the new URL is committed after the draw.
 linkApplied=location.hash;
 try{originalChangeRoute(destinationRoute(route));}finally{navigationTransition=false;}
 if(back&&S.route==='meta'&&back.role===S.role&&back.query===companionPrefs.homeQuery)requestAnimationFrame(()=>scrollTo({top:back.y,behavior:'instant'}));
 recordNavigation();
};
openHero=function(slug,role){
 if(!E.heroes[slug]){companionError='That hero is unavailable. Choose another.';changeRoute('meta');if(!companionMedia.matches)toast(companionError);return;}
 leaveMeta();saveNavigationPosition();originalOpenHero(slug,role);
 companionPrefs.recent=[{slug,role:S.heroRole},...companionPrefs.recent.filter(p=>p.slug!==slug||p.role!==S.heroRole)].slice(0,5);saveCompanionPrefs();
};
function requestLinkedBracket(bracket){
 if(bracket===S.bracket||linkedBracketPending===bracket)return;
 if(APP_CONFIG.mode==='export')throw Error('This snapshot contains only '+(B.bracket?.label||S.bracket)+'. Open the published app for another rank.');
 linkedBracketPending=bracket;linkApplied='';queueMicrotask(()=>{const select=$('#bracket');select.value=bracket;select.dispatchEvent(new Event('change',{bubbles:true}));linkedBracketPending=null;});
}
function applyCompanionLink(){
 const hash=location.hash;if(!hash||hash.startsWith('#plan=')||hash===linkApplied)return;linkApplied=hash;
 try{const q=new URLSearchParams(hash.slice(1));
 // The local collector changes the loaded bundle after settings requests complete.
 // Adopt its actual cohort before resolving a link; never label another bundle as it.
 if(local&&q.get('bracket')===B.bracket?.segment)S.bracket=B.bracket.segment;
 if(q.has('hero')){
   const allowed=['hero','role','bracket','tab'];if([...q.keys()].some(k=>!allowed.includes(k))||[...q.keys()].length!==new Set(q.keys()).size)throw Error('The hero link has unsupported fields.');
   const hero=q.get('hero'),role=q.get('role'),bracket=q.get('bracket'),tab=({build:'builds',partners:'pairings'})[q.get('tab')]||q.get('tab')||'builds';
   if(!E.heroes[hero])throw Error('The linked hero is unavailable. Choose a hero.');
   if(!roleOrder.includes(role)||!E.roles(hero).includes(role)){throw Error('Choose a supported role for the linked hero.');}
   if(!['bronze','silver','gold','platinum','diamond','paragon'].includes(bracket)||!['builds','pairings','counters','kit'].includes(tab))throw Error('The linked rank or section is invalid.');
   if(bracket!==S.bracket){requestLinkedBracket(bracket);return;}
   S.hero=hero;S.heroRole=role;S.heroTab=tab;S.route='hero';sectionSpy.requested=tab;/* a link names its section outright */
 }else if(q.has('view')){
   let r=q.get('view');const bracket=q.get('bracket'),role=q.get('role');
   if(bracket&&!['bronze','silver','gold','platinum','diamond','paragon'].includes(bracket))throw Error('The linked rank is invalid.');
   if(role&&!roleOrder.includes(role))throw Error('The linked role is invalid.');
   if(r==='plan'||['planner','draft','live'].includes(r)){r='match';}
   else if(r==='reference'){r=referenceSections[q.get('section')||'playbook'];if(!r)throw Error('This Reference section is unavailable.');}
   else if(r==='sources'){if(q.has('section')&&q.get('section')!=='settings')throw Error('This Sources section is unavailable.');r=q.get('section')==='settings'?'more':'data';}
   if(![...navs.map(x=>x[0]),'more'].includes(r))throw Error('This section is unavailable.');
   if(bracket&&bracket!==S.bracket){requestLinkedBracket(bracket);return;}
   S.route=r;if(role)S.role=role;
 }
 }catch(e){companionError=e.message;S.route='meta';if(!companionMedia.matches)setTimeout(()=>toast(e.message),0);}
}
function afterDestinationRender(){
 const main=$('#main');if(!main||!B)return;
 const sections=destinationSections();if(sections)main.insertAdjacentHTML('afterbegin',sections);
 if(navigationRankChange&&B.bracket?.segment===navigationRankChange){S.bracket=navigationRankChange;navigationRankChange=null;recordNavigation(true);}
 if(navigationRestore){
   const restore=navigationRestore;
   if(restore.companion.bracket===S.bracket&&B.bracket?.segment===S.bracket){
     restoreDisclosures(restore.disclosures);
     requestAnimationFrame(()=>requestAnimationFrame(()=>{
       if(navigationRestore!==restore)return;
       window.scrollTo({top:restore.scrollY||0,behavior:'instant'});
       if(!main.querySelector('.annex-loading'))navigationRestore=null;
     }));
   }
 }else if(!navigationTransition&&!historyApplying&&!linkedBracketPending&&linkApplied===location.hash&&!history.state?.companion&&!location.hash.startsWith('#plan='))recordNavigation(true);
}
function installHelp(){companionPrefs.installSeen=true;saveCompanionPrefs();document.querySelector('.install-hint')?.remove();detail('Install on your phone','<p><strong>iPhone / iPad:</strong> open this website in Safari, tap Share, then Add to Home Screen.</p><p><strong>Android:</strong> open in Chrome, use its menu and choose Install app or Add to Home screen.</p><p>Open a rank online once to save it on this device. Offline views retain their original dates. Images may be unavailable offline.</p>');}
async function shareHero(){const url=new URL(APP_CONFIG.mode==='local'||location.protocol==='file:'?'https://gn45db4tjc-ship-it.github.io/predecessor-meta/':location.href);url.search='';url.hash='hero='+encodeURIComponent(S.hero)+'&role='+S.heroRole+'&bracket='+S.bracket+'&tab='+S.heroTab;try{if(navigator.share){await navigator.share({title:name(S.hero)+' build',url:url.href});return;}}catch(e){if(e.name==='AbortError')return;}try{await navigator.clipboard.writeText(url.href);toast('Hero link copied.');}catch{detail('Share hero',`<label>Copy this link<input readonly value="${esc(url.href)}"></label><p>Contains only hero, role, bracket and section.</p>`);}}
document.addEventListener('click',async event=>{
 const el=event.target.closest('button');if(!el)return;const d=el.dataset;
 const handled=d.mobileRole||d.favorite||'clearSearch' in d||d.liveLookup||d.startLive||d.newMatch||d.editSituation||d.pickerRole||d.pickLive||d.confirmLive||d.closeDetail||d.limitsSources||['mobile-all-heroes','mobile-limits','menu-toggle','undo-action','companion-install','companion-theme','share-hero','favorite-hero','download-review-packet','live-context-clear','retry-companion'].includes(el.id);
 if(!handled)return;event.preventDefault();event.stopImmediatePropagation();
 try{
 if(el.id==='menu-toggle'){changeRoute('more');return;}
 if(el.id==='retry-companion'){$('#refresh').click();return;}
 if(el.id==='download-review-packet'){downloadReviewPacket();return;}
 if(el.id==='mobile-limits'){detail('Source limitations',limitsDialogHTML());return;}
 if(d.limitsSources){dialogReturn=null;dialogSituation=null;$('#detail').close();changeRoute('data');$('#main').focus({preventScroll:true});return;}
 else if(d.mobileRole){S.role=d.mobileRole;metaShowAll=false;saveCompanionPrefs();}
 else if('clearSearch' in d){companionPrefs.homeQuery='';saveCompanionPrefs();render();$('#mobile-hero-search')?.focus();return;}
 else if(d.favorite){companionPrefs.favorites=companionPrefs.favorites.filter(v=>v!==d.favorite);saveCompanionPrefs();}
 else if(el.id==='favorite-hero'){const key=S.hero+'|'+S.heroRole;companionPrefs.favorites=companionPrefs.favorites.includes(key)?companionPrefs.favorites.filter(v=>v!==key):[key,...companionPrefs.favorites].slice(0,20);saveCompanionPrefs();}
 else if(d.startLive){matchSetMe(S.hero);S.locks=[{slug:S.hero,role:E.roles(S.hero).includes(S.heroRole)?S.heroRole:E.roles(S.hero)[0]}];save();S.route='match';}
 else if(el.id==='companion-install'){installHelp();return;}
 else if(el.id==='companion-theme'){$('#theme-toggle').click();}
 else if(el.id==='share-hero'){await shareHero();return;}
 save();render();recordNavigation();{const again=returnSelector(el),back=again&&document.querySelector('#main '+again);(back||$('#main')).focus({preventScroll:true});}
 }catch(e){companionError=e.message;toast(e.message);}
},true);
document.addEventListener('change',event=>{
 const el=event.target,d=el.dataset;
 if(el.id==='bracket'&&linkedBracketPending!==el.value){saveNavigationPosition();navigationRestore=null;navigationRankChange=el.value;linkApplied=location.hash;}
 if(el.id==='mobile-meta-order'){companionPrefs.metaOrder=el.value;saveCompanionPrefs();render();$('#mobile-meta-order')?.focus();}
 else if(el.id==='mobile-hero-role'){S.heroRole=el.value;render();recordNavigation(true);$('#mobile-hero-role')?.focus();}
 else if(el.id==='large-text'){companionPrefs.large=el.checked;saveCompanionPrefs();companionChrome();}
 else if(el.id==='hero-role')setTimeout(()=>recordNavigation(true),0);
},true);
// 2.50.0: Your heroes stays open or closed as the reader left it; Enter in the hero search opens the first match.
document.addEventListener('toggle',event=>{if(event.target.matches?.('#main details.saved-heroes')){companionPrefs.savedOpen=event.target.open;saveCompanionPrefs();}},true);
document.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.target.id!=='mobile-hero-search')return;const first=$('#mobile-role-list [data-hero]');if(first){event.preventDefault();first.click();}});
document.addEventListener('input',event=>{if(event.target.id==='mobile-hero-search'){const pos=event.target.selectionStart;companionPrefs.homeQuery=event.target.value;saveCompanionPrefs();render();const input=$('#mobile-hero-search');input?.focus();input?.setSelectionRange(pos,pos);}});
document.addEventListener('click',event=>{if(event.target.closest('[data-meta-role]'))recordNavigation(true);if(event.target.closest('[data-hero-tab]')){recordNavigation(true);if(companionMedia.matches){const d=$('#main > details');if(d)d.open=true;}}});
window.addEventListener('popstate',event=>{
 if(dialogBackPending){dialogBackPending=false;return;}/* the dialog's own entry, removed after a close */
 if(dialogEntry&&$('#detail')?.open){dialogEntry=false;$('#detail').close();return;}/* 2.50.0: Back closes only the dialog */
 if($('#detail')?.open){dialogReturn=null;dialogReturnKey='';$('#detail').close();}/* 2.41.0: Back never leaves a dialog over another page */
 historyApplying=true;navigationRestore=event.state?.companion?event.state:null;
 try{
  if(navigationRestore){const n=navigationRestore.companion;
   S.route=n.route;S.hero=n.hero;S.heroRole=n.role;S.heroTab=n.tab;
   if(roleOrder.includes(n.metaRole))S.role=n.metaRole;
   for(const k of ['query','sort','direction','full'])if(n[k]!==undefined)S[k]=n[k];
   if(n.homeQuery!==undefined)companionPrefs.homeQuery=n.homeQuery;if(n.showAll!==undefined)metaShowAll=n.showAll;
   sectionSpy.requested=null;sectionSpy.tab=n.tab;linkApplied=location.hash;
   // 2.50.0: the rank is the reader's current choice, not part of the page being returned to. Back used to switch it
   // back to whatever rank that page was first opened under.
   if(n.bracket!==S.bracket){rankKept=true;navigationRestore={...navigationRestore,companion:{...n,bracket:S.bracket}};}
  }else linkApplied='';
  render();
 }finally{historyApplying=false;}
 if(rankKept){rankKept=false;recordNavigation(true);}
});
let rankKept=false;
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#plan=')&&location.hash!==linkApplied){render();}});
window.addEventListener('offline',()=>redrawForEvidence());window.addEventListener('online',()=>redrawForEvidence());
companionMedia.addEventListener('change',()=>render());
setTimeout(()=>{if(companionMedia.matches&&!companionPrefs.installSeen&&APP_CONFIG.mode==='static'&&!matchMedia('(display-mode:standalone)').matches){let el=document.createElement('aside');el.className='install-hint';el.innerHTML='<span>Add this companion to your home screen.</span><button id="companion-install">How to install</button><button aria-label="Dismiss installation hint">Dismiss</button>';el.lastElementChild.onclick=()=>{companionPrefs.installSeen=true;saveCompanionPrefs();el.remove();};$('#main').after(el);}},1200);
