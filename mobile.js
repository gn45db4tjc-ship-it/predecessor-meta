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
function freshnessHTML(p){
 const perf=p?E.performance(p):null,mech=B?.sources?.pred_game_data||B?.sources?.omeda_heroes,words={current:'current',aging:'aging',stale:'saved',retained:'retained',unavailable:'unavailable'};
 const sample=perf?(perf.retained?'retained':E.sourceCurrency({status:'ok',fetched_at:perf.fetched_at}).state):null,mechanics=mech?.status==='retained'?'retained':E.sourceCurrency(mech).state;
 const offline=!navigator.onLine||connectionLost,role=(labels[p?.role]||p?.role||'role').toLowerCase();
 const sampleText=perf?perf.source+' '+role+' sample '+(words[sample]||sample):p?roleSampleText(p.slug,p.role):'Role sample unavailable';
 const summary=(offline?'Offline · saved data · ':'')+sampleText+' · Mechanics '+(words[mechanics]||mechanics);
 return `<details class="coach-date ${offline||!perf||sample!=='current'||mechanics!=='current'?'warning':''}" data-keep="coach-evidence"><summary>${esc(summary)}</summary><div class="detail-content"><p>${esc(B?.bracket?.label||'Bracket unavailable')}${p?' · '+esc(name(p.slug))+' · '+esc(labels[p.role]||p.role):''}</p><p>${perf?'Role sample: '+esc(perf.source)+' · '+games(perf.played)+' · fetched '+esc(date(perf.fetched_at))+(perf.retained?' · retained from an earlier collection':''):esc(sampleText)+'. No role win rate is shown or estimated for this plan.'}</p><p>Mechanics fetched ${esc(date(mech?.fetched_at))}${mech?.status==='retained'?' · retained from an earlier collection':''}</p><p class="muted">Site-wide update health is on Sources &amp; accuracy; each section below shows its own date.</p></div></details>`;
}
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
function sampleFootnote(slots){
 var n=(slots||[]).filter(function(s){return s.measured&&!s.measured.supports_current_fit;}).length;
 if(!n)return '';
 return '<p class="muted coach-note">'+n+' of these positions carry an observation that is inspection only. Each states its own reason; the category beside each part is what the recommendation rests on.</p>';
}
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
function loadoutSampleHTML(ev,label){
 var s=ev&&ev.parts?ev.parts[label]:null;
 if(!ev||!ev.variant)return '<small class="muted">No source variant matches the recommended augment and Eternal, so there is no observation for this part.</small>';
 if(!s)return '<small class="muted">No observation for this choice in that variant.</small>';
 if(s.none)return '<small class="muted">'+esc(s.none)+'</small>';
 return '<small class="muted">Win rate '+pct(s.wr)+' over '+games(s.played)+' · '+esc(s.scope)+' · collected '+esc(dayDate(ev.fetched_at))+'</small>';
}
/* The categories engine.js actually produces for a build part. A part is never reduced
   to "observed or substituted": a reviewed core, a calculated starting selection, a
   source playstyle the reader chose, an item merely brought forward and an item actually
   replaced are five different claims. */
function loadoutPartHTML(label,name,kind,plan,ev){
 if(!name)return '<div class="loadout-absent"><small>'+esc(label)+'</small><p class="muted">Unavailable in this source.</p></div>';
 var c=buildCategory(plan,null);
 return '<div><small>'+esc(label)+'</small>'+itemButton(name,kind)+badge(c.text,c.type)+loadoutSampleHTML(ev,label)+'</div>';
}
/* The crest path, stated rather than implied: base, mid form, final upgrade, with the
   recommendation marked where it sits. A recommended FINAL upgrade does not evolve again, so
   its siblings are shown as alternatives to it, not as next steps. Every stage shows its own
   sample or says it has none. */
function crestRowSample(x,ev,what){
 if(!hasSample(x))return '<small class="muted">'+esc(what)+' has no sample of its own in that variant.</small>';
 return '<small class="muted">Win rate '+pct(x.winRate)+' over '+games(x.playedGames)+' · '+esc(what)+' · collected '+esc(dayDate(ev.fetched_at))+'</small>';
}
function crestEvolutionHTML(ev,planCrest){
 if(!ev||!ev.variant)return '<div class="loadout-absent"><small>Crest path</small><p class="muted">No source variant matches the recommended augment and Eternal, so no crest rows apply.</p></div>';
 if(!ev.crest)return '<div class="loadout-absent"><small>Crest path</small><p class="muted">That variant recommends a different crest, so its rows do not describe '+esc(planCrest||'this crest')+'. Nothing is estimated in their place.</p></div>';
 var cf=ev.crest,fam=cf.family,base=crestName(fam),mid=fam.midCrest||null,ups=fam.upgrades||[];
 var mark=function(stage,label){return cf.stage===stage?'<strong>'+esc(label)+' (recommended'+(stage==='upgrade'?', final':'')+')</strong>':esc(label);};
 var path='<div class="loadout-context"><small>Crest path</small><p class="crest-path">'
  +mark('base',base)+(mid?' \u2192 '+mark('mid',mid):'')
  +' \u2192 '+(cf.stage==='upgrade'?mark('upgrade',crestName(cf.choice)):'one final upgrade')+'</p>'
  +crestRowSample(fam,ev,'the base crest, '+base)
  +(mid?'<small class="muted">The mid form, '+esc(mid)+', has no separate sample in this source.</small>':'')+'</div>';
 if(cf.stage==='upgrade'){
  var siblings=ups.filter(function(u){return nk(crestName(u))!==nk(crestName(cf.choice));});
  if(!siblings.length)return path+'<div class="loadout-absent"><small>Other final upgrades</small><p class="muted">No other final upgrade of '+esc(base)+' in this source.</p></div>';
  return path+siblings.map(function(u){
   return '<div><small>Other final upgrade</small>'+itemButton(crestName(u),'items')+badge('Observed alternative','observed')+
    crestRowSample(u,ev,'an alternative to '+crestName(cf.choice)+', not a further step')+'</div>';
  }).join('');
 }
 if(!ups.length)return path+'<div class="loadout-absent"><small>Evolves into</small><p class="muted">No final-upgrade rows in this source for '+esc(base)+'. Nothing is estimated in their place.</p></div>';
 return path+ups.map(function(u){
  return '<div><small>Evolves into</small>'+itemButton(crestName(u),'items')+badge('Observed choice','observed')+
   crestRowSample(u,ev,'a final upgrade of '+base)+'</div>';
 }).join('');
}
function coachHTML(p,{compact=false}={}){
 let a;try{a=adviceFor(p);}catch(e){return `<section class="panel coach"><h2>Recommendation unavailable</h2><p>${esc(e.message)}</p><button data-route="data">Inspect sources</button></section>`;}
 const enemies=coachEnemies(p),key=p.slug+'|'+p.role,attr=`data-coach-key="${esc(key)}"`;
 const controls=`<div class="coach-controls"><label>My hero is<select ${attr} data-coach-field="state">${options([['ahead','Ahead'],['even','Even'],['behind','Behind']],a.state)}</select></label><label>Primary threat<select ${attr} data-coach-field="primaryThreat">${options(enemies.map(e=>[e.slug,name(e.slug)+' · '+labels[e.role]]),a.primaryThreat||'','No primary threat')}</select></label><label>Urgent need<select ${attr} data-coach-field="priority">${options(E.itemNeeds.filter(n=>!n.manual).map(n=>[n.id,n.label]),a.priority,'Normal timing')}</select></label></div>`;
 const info=`<p class="muted">Judge your hero’s farm and power curve. Enemy equipment is unknown until you choose a need.</p>`;
 const next=a.available?(a.nextPurchase?`<h2>Next: ${esc(a.nextPurchase.name)}</h2>${(function(c){return badge(c.text,c.type);})(buildCategory(a.plan,a.nextPurchase))}${supportingSample(a.nextPurchase.measured,a.slots.indexOf(a.nextPurchase)+1||null)}`:'<h2>Six completed items owned</h2><p>No purchase or sale suggested.</p>'):`<h2>${E.buildReview(p.slug,p.role)?.active?'Match-specific advice pending':'Recommendation unavailable'}</h2><p>${esc(a.unavailableReason)}</p>`;
 return `<section class="panel coach" aria-label="Build Coach"><div class="coach-next">${next}</div>${controls}${compact?'':info}${freshnessHTML(p)}${a.available?`<p class="coach-reason">${esc(a.explanations[0])}</p><ol class="build-path coach-path">${a.slots.map((s,i)=>`<li><span class="item-position">${i+1} · ${esc(s.label)}</span>${itemButton(s.name)}${(function(c){return badge(c.text,c.type);})(buildCategory(a.plan,s))}${supportingSample(s.measured,i+1)}</li>`).join('')}</ol>${sampleFootnote(a.slots)}`:'<button data-route="data">Inspect sources & accuracy</button>'}<details><summary>Advanced details · why this path</summary><div class="detail-content">${info}<p>Reviewed for ${esc(a.evidence.reviewed.patch||'unverified')} · ${esc(date(a.evidence.reviewed.date))}. Editorial reference remains Gold+; observations use ${esc(B.bracket?.label)}.</p>${a.explanations.slice(1).map(t=>`<p>${esc(t)}</p>`).join('')}${a.changes.map(c=>`<p><strong>Position ${c.position}: ${esc(c.item)}</strong><br>${esc(c.reason)}</p>`).join('')}${a.timing.map(t=>`<p>${esc(t)}</p>`).join('')}${a.contingency?`<p>Alternative for ${esc(a.contingency.need)}: ${itemButton(a.contingency.name)}<br>${esc(a.contingency.reason)}</p>`:''}<p>Reviewed baseline: ${esc(a.baseline.join(' → ')||'Unavailable')}</p>${a.itemEvidence.issues.map(t=>note(esc(t),true)).join('')}${Object.values(a.itemEvidence.pool).filter(r=>a.slots.some(s=>normalizeName(s.name)===normalizeName(r.name))).map(r=>`<p>${esc(r.name)} · ${pct(r.wr)} · ${games(r.played)}<br>${esc(r.label||r.source)} · ${esc(date(r.fetched_at))} · ${r.supports_current_fit?'Eligible bracket evidence':'Inspection only; no influence'}</p>`).join('')}<p>${esc(a.note)}</p></div></details></section>`;
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
 // Rec 2: the full summary belongs to Meta; elsewhere it is a compact chip in the rank row.
 const compactContext=companionMedia.matches&&S.route!=='meta',tools=document.querySelector('.topbar .tools');document.body.classList.toggle('compact-context',compactContext);
 if(compactContext&&tools&&limits.parentElement!==tools)tools.append(limits);else if(!compactContext&&limits.previousElementSibling!==status)status.after(limits);
 let dock=$('#coach-dock');if(!dock){dock=document.createElement('aside');dock.id='coach-dock';document.body.append(dock);}
 if(nav&&dock.nextElementSibling!==nav)document.body.insertBefore(dock,nav);
 const p=S.route==='live'?S.locks.find(x=>x.slug===S.me):null;
 dock.hidden=!companionMedia.matches||!B||!p;
 if(!dock.hidden){try{const a=adviceFor(p);dock.innerHTML=`<span>${a.available?`Next: <strong>${esc(a.nextPurchase?.name||'Build complete')}</strong>`:'Recommendation unavailable'}</span><button data-edit-situation="${esc(p.slug+'|'+p.role)}">Situation</button>`;}catch{dock.hidden=true;}}

}
function disabledHero(slug,side,role){const own=side==='allies'?S.locks:S.enemies,other=side==='allies'?S.enemies:S.locks;return S.bans.includes(slug)?'Banned':own.some(p=>p.slug===slug&&p.role!==role)||other.some(p=>p.slug===slug)?'Already picked':side==='allies'&&!E.roles(slug).includes(role)?'Role unavailable':'';}
function displayedRoleText(perf){return savedTag(perf.fetched_at,perf.retained)+pct(perf.wr)+' · '+games(perf.played)+' · '+esc(perf.source)+' '+esc(perf.patch||'')+' · '+esc(date(perf.fetched_at))+(perf.inspection_only?' · Previous dataset; not current-patch evidence':'');}
function heroTile(p,{favorite=false}={}){const perf=E.displayPerformance(p),review=E.metaReview(p.slug,p.role),ready=!!E.buildReview(p.slug,p.role)?.active;return `<article class="mobile-hero-card"><div class="meta-hero-identity">${heroButton(p.slug,p.role).replace('</button>',(ready?'<span class="chip tag reviewed ready-chip">Build ready</span>':'')+'</button>')}</div><div class="mobile-stat">${perf?`${perf.inspection_only?'':S.bracket==='gold'&&review?tier(review.tier):tier(perf.tier)} <strong>${pct(perf.wr)}</strong><small>${games(perf.played)}${perf.played<100?' · small sample':''}${perf.inspection_only?' · previous dataset':''}</small>`:`<small>${esc(noStatsText(p.role,p.slug))}</small>`}</div>${favorite?`<button class="favorite-button" data-favorite="${p.slug}|${p.role}" aria-label="Remove ${esc(name(p.slug))} from favorites">★</button>`:''}</article>`;}
function strategyReviewDue(){return !!B&&E.strategyReviewDue().due;}
function mobileStatusHTML(){const core=latestStatus.health?.core_statistics||{},source=B?.sources?.statz_hero_pages||{},when=core.updated_at||source.fetched_at,state={current:'Current',aging:'Aging',stale:'Stale',retained:'Saved',unavailable:'Unavailable'}[E.sourceCurrency({...source,fetched_at:when}).state],verification=(()=>{try{return E.evidenceState().verification.state;}catch{return 'verified';}})(),pendingCheck=verification==='verified'&&(()=>{try{return E.performancePolicy().label==='Verification required';}catch{return false;}})(),paused=!!B&&(verification!=='verified'||pendingCheck),newContent=/content changed after this collection/i.test(B?.recommendation_context?.reason||''),label=paused?'Paused':E.displayPerformancePolicy().inspection_only?'Previous data':state;return `<button class="mobile-health ${paused?'stale':state.toLowerCase()}" data-route="data"><strong>${esc(label)}</strong><span>${APP_CONFIG.mode==='export'?'Snapshot':local||shared?'App refresh':'Site refresh'} · Statz fetched ${esc(relativeTime(when))}${source.status==='retained'?' · retained':''}${E.statzGap?.()?' · '+E.statzGap().failed+(E.statzGap().failed===1?' hero page failed':' hero pages failed'):''} · Statz dataset ${esc(B?.patch||'unknown')} · ${paused?(newContent?'New official content · recommendations paused':pendingCheck?(/live verification failed/i.test(B?.guidance?.status||'')?'Live check failed · recommendations paused':'Live check pending · recommendations paused'):'Patch check failed · recommendations paused'):'Game patch '+esc(B?.official?.status==='verified'?B.official.live?.version:'unverified')}${(()=>{try{const b=E.evidenceState().builds;return b?' · Builds '+b.ready+'/'+b.total+' ready':'';}catch{return '';}})()}${strategyReviewDue()?' · Strategy review due':''}</span></button>`;}
function relativeTime(value){const ms=Date.now()-Date.parse(value);if(!Number.isFinite(ms))return 'unavailable';if(ms<-300000)return 'at a time ahead of this device\'s clock';const hours=Math.max(0,Math.floor(ms/3600000));return hours<1?'less than 1h ago':hours<24?hours+'h ago':Math.floor(hours/24)+'d ago';}
function roleListOrder(role){
 const chosen=['reviewed','wr','name'].includes(companionPrefs.metaOrder)?companionPrefs.metaOrder:'reviewed',all=roleHeroes(role).all;
 const byName=(a,b)=>name(a.slug).localeCompare(name(b.slug));
 if(chosen==='name')return all.sort(byName);
 if(E.displayPerformancePolicy().inspection_only)return chosen==='wr'?all.sort((a,b)=>(E.displayPerformance(b)?.wr??-1)-(E.displayPerformance(a)?.wr??-1)||byName(a,b)):all.sort(byName);
 const sampled=all.filter(r=>r.perf?.played>=100),rest=all.filter(r=>!(r.perf?.played>=100)).sort(byName);
 const activeReview=chosen==='reviewed'&&S.bracket==='gold'&&E.metaReviewSummary(role)?.active;
 sampled.sort((a,b)=>{if(activeReview){const tiers={S:0,A:1,B:2,C:3,D:4},ar=E.metaReview(a.slug,role),br=E.metaReview(b.slug,role),gap=(ar?.active?tiers[ar.tier]??9:9)-(br?.active?tiers[br.tier]??9:9);if(gap)return gap;}return b.perf.wr-a.perf.wr||b.perf.played-a.perf.played||byName(a,b);});
 return sampled.concat(rest);
}
function savedHeroShortcuts(favorites,recent){
 const seen=new Set(favorites.map(p=>p.slug+'|'+p.role));
 const recentOnly=recent.filter(p=>!seen.has(p.slug+'|'+p.role));
 if(!favorites.length&&!recentOnly.length)return '';
 const shortcut=p=>`<button data-hero="${esc(p.slug)}" data-role="${esc(p.role)}">${esc(name(p.slug))}<small>${esc(labels[p.role])}</small></button>`;
 return `<details class="saved-heroes" data-keep="saved-heroes"><summary>Your heroes · ${favorites.length} ${favorites.length===1?'favorite':'favorites'} · ${recentOnly.length} recent</summary>${favorites.length?`<section id="mobile-favorites"><h2>Favorites</h2><div class="saved-hero-list">${favorites.map(p=>`<div>${shortcut(p)}<button class="favorite-button" data-favorite="${esc(p.slug+'|'+p.role)}" aria-label="Remove ${esc(name(p.slug))} ${esc(labels[p.role])} from favorites">★</button></div>`).join('')}</div></section>`:''}${recentOnly.length?`<section id="mobile-recent"><h2>Recent</h2><div class="saved-hero-list">${recentOnly.map(p=>`<div>${shortcut(p)}</div>`).join('')}</div></section>`:''}</details>`;
}
function guidedHome(){
 const role=roleOrder.includes(S.role)?S.role:'jungle',query=String(companionPrefs.homeQuery||'').toLowerCase(),everyone=roleHeroes(role),rows=roleListOrder(role).filter(r=>name(r.slug).toLowerCase().includes(query));
 const order=companionPrefs.metaOrder||'reviewed',tiers=S.bracket==='gold'?E.metaReviewSummary(role):null,tiersLead=!!tiers?.active,policy=E.performancePolicy(),savedStats=policy.saved?' · saved statistics, fetched '+date(policy.fetched_at):'';
 const failedStats=everyone.rest.filter(r=>!r.perf&&statsReason(r.slug,role)==='failed').length;
 const favorites=companionPrefs.favorites.map(v=>{const [slug,r]=v.split('|');return {slug,role:r};}).filter(p=>E.heroes[p.slug]&&E.roles(p.slug).includes(p.role));
 const recent=companionPrefs.recent.filter(p=>E.heroes[p.slug]&&E.roles(p.slug).includes(p.role)).slice(0,5);
 const changes=(B.changes?.vs_previous_run?.changes||[]).filter(c=>c.role===role&&c.matches_from>=100&&c.matches_to>=100&&Math.abs(c.wr_delta)>=.005).sort((a,b)=>Math.abs(b.wr_delta)-Math.abs(a.wr_delta)).slice(0,3);
 const ordering=order==='name'?'Alphabetical order':tiersLead&&order==='reviewed'?'Reviewed tier, then role performance':'Role performance in '+(B.bracket?.label||'selected rank');
 const fallback=E.displayPerformancePolicy(),displayed=everyone.all.filter(r=>E.displayPerformance(r)).length;
 const sortOptions=fallback.inspection_only?[['name','Hero name'],['wr','Previous win %']]:[['reviewed','Reviewed tier'],['wr','Observed win rate'],['name','Hero name']];
 const displayedOrder=fallback.inspection_only&&order==='reviewed'?'name':order;
 const availability=fallback.inspection_only?'Current-patch statistics are '+(policy.label==='Verification required'?'paused':'unavailable')+'. '+displayed+' heroes have previous Statz '+fallback.patch+' samples below; fetched '+date(fallback.fetched_at)+'. They do not rank current recommendations.':!policy.source?'Role statistics are '+(policy.label==='Verification required'?'paused':'unavailable')+': '+(policy.note||'')+' Heroes remain available without numbers.':failedStats===everyone.all.length?'Statistics for all '+failedStats+' '+labels[role].toLowerCase()+' heroes failed to load in this collection. Heroes remain available without numbers.':!everyone.sampled.length?'No '+labels[role].toLowerCase()+' hero has 100 or more games in '+(B.bracket?.label||'this rank')+' yet. Smaller samples remain visible below.':everyone.sampled.length===1?'Only 1 '+labels[role].toLowerCase()+' hero has 100 or more games in '+(B.bracket?.label||'this rank')+'.':everyone.sampled.length+' heroes meet the 100-game eligibility threshold.';
 const lead=fallback.inspection_only?(policy.label==='Verification required'?'Editorial tiers are paused. ':'')+'Previous role statistics remain available while sources catch up. '+(order==='wr'?'Ordered by previous-dataset win rate.':'Alphabetical order; current rankings are unavailable.'):!policy.source?(S.bracket==='gold'?'Editorial tiers are paused for this role'+(tiers?.reason?' ('+tiers.reason.toLowerCase()+')':'')+'. ':'')+availability:order==='name'?'Heroes are listed alphabetically; measured rates and reviewed tiers remain separate.':tiersLead&&order==='reviewed'?'Reviewed tier guidance leads; role samples keep their source dates.':S.bracket==='gold'?'Editorial tiers '+(tiersLead?'are available separately':'are paused for this role'+(tiers?.reason?' ('+tiers.reason.toLowerCase()+')':''))+'. '+(everyone.sampled.length?'Heroes are ordered by role performance.':availability):'Selected-rank statistics lead; Gold+ editorial guidance remains separate.';
 const compact=!companionPrefs.fullDetails;
 const overview=fallback.inspection_only?'Previous statistics · not a current ranking':!policy.source?'Role statistics '+(policy.label==='Verification required'?'paused':'unavailable'):policy.saved?'Saved statistics · check source dates':'Statistics & sample eligibility';
 const listStatus=`<p id="meta-order-status">${esc(availability)} ${policy.source?esc(ordering+savedStats)+'. ':''}The 100-game line is eligibility, not confidence.${order==='name'?'':' Smaller or missing samples follow the eligible rows.'}</p>`;
 return (compact?'':mobileStatusHTML())+(companionError?note(esc(companionError),true):'')+head('Meta · '+esc(B.bracket?.label||''),labels[role]+' at a glance',compact?'Choose a hero. Build for your match.':esc(lead))+
 `<div class="role-choices compact tab-strip tab-strip--segmented" role="tablist" aria-label="Role">${roleOrder.map(r=>`<button role="tab" data-mobile-role="${r}" aria-selected="${role===r}">${labels[r]}</button>`).join('')}</div><div class="meta-list-controls"><label class="mobile-search"><span>Find a ${esc(labels[role].toLowerCase())}</span><input id="mobile-hero-search" type="search" autocomplete="off" placeholder="Hero name" value="${esc(companionPrefs.homeQuery)}"></label><label>Order by<select id="mobile-meta-order">${options(sortOptions,displayedOrder)}</select></label></div>`+
 savedHeroShortcuts(favorites,recent)+
 `<section id="mobile-role-list">${compact?`<details class="meta-context" data-keep="meta-context"><summary>${esc(overview)}</summary><div class="detail-content">${mobileStatusHTML()}<p>${esc(lead)}</p>${listStatus}</div></details>`:''}<div class="section-title"><h2>${compact?'Heroes':'All '+esc(labels[role].toLowerCase())+' heroes'}</h2><small>Showing ${rows.length} of ${everyone.all.length}</small></div>${compact?'':listStatus}<div class="mobile-card-list" id="mobile-all-list">${rows.map(r=>heroTile({slug:r.slug,role})).join('')||empty('No hero matches this role and search.')}</div></section>`+
 `<section id="mobile-changes"><div class="section-title"><h2>What changed</h2><button class="quiet" data-route="changes">All changes</button></div>${changes.length?`<div class="mobile-card-list">${changes.map(c=>`<article class="mobile-change">${heroButton(c.slug,c.role,true)}<strong class="${c.wr_delta>0?'positive':'negative'}">${pp(c.wr_delta)}</strong><small>${num(c.matches_from,0)} → ${num(c.matches_to,0)} games</small></article>`).join('')}</div>`:empty('No qualifying win-rate movement in the available same-rank comparison.')}</section>`;
}
function mobileHero(){
 const p={slug:S.hero,role:S.heroRole};if(!E.heroes[p.slug])return guidedHome();if(!['builds','pairings','counters','kit'].includes(S.heroTab))S.heroTab='builds';
 const why=pickBlock(p.slug,p.role),mine=S.me===p.slug&&S.locks.some(x=>x.slug===p.slug&&x.role===p.role),blocked=mine?'':why,perf=E.displayPerformance(p),fav=companionPrefs.favorites.includes(p.slug+'|'+p.role);
 const full=heroView(),node=document.createElement('div');node.innerHTML=full.slice(full.indexOf('<nav class="toolbar hero-jump"'));node.querySelector('.coach')?.remove();/* the phone keeps its Build Coach on the Live route, and Build is now always present */const body=node.innerHTML;
 return `<button class="text-button" data-route="meta">← Meta</button>${mobileStatusHTML()}<div class="hero-header mobile-hero-head">${art(p.slug,'large')}<div><h1>${esc(name(p.slug))}</h1><label>Role<select id="mobile-hero-role">${options(E.roles(p.slug).map(r=>[r,labels[r]]),p.role)}</select></label></div><p class="mobile-hero-status">${metaTierButton(p.slug,p.role)}<span>${perf?displayedRoleText(perf):esc(roleSampleText(p.slug,p.role))}</span></p></div><div class="hero-actions"><button id="favorite-hero" aria-pressed="${fav}">${fav?'★ Favorited':'☆ Favorite'}</button><button id="share-hero">Share</button><button data-start-live="true" ${blocked?'disabled aria-describedby="start-live-reason"':''}>${mine?'Open Live':'Use in Live'}</button></div>${blocked?`<p id="start-live-reason">${esc(blocked)}. Choose another hero or role.</p>`:''}${body}`;
}
function liveMobileDetails(){
 const me=S.locks.find(p=>p.slug===S.me)||null;
 if(!me)return mobileStatusHTML()+head('Live game','Choose who you play','Add your hero first; the rest of the lineup is optional.')+`<button class="primary" data-live-lookup="true">Choose my hero</button>${S.locks.length?`<label>Or use a locked ally<select id="me-hero">${options(S.locks.map(p=>[p.slug,name(p.slug)+' · '+labels[p.role]]),'','Choose ally')}</select></label>`:''}`;
 const ctx=contextFor(me),owned=Array.isArray(ctx.owned)?ctx.owned:[],all=Object.values(B.items||{}).filter(i=>i.completed_item&&i.available_current_patch!==false&&!owned.includes(i.name)).sort((a,b)=>a.name.localeCompare(b.name));
 return mobileStatusHTML()+head('Live game',name(me.slug)+' · '+labels[me.role],'Your next completed item and the reason to buy it.')+`<div class="live-actions"><button data-new-match="true">New match</button><button data-live-lookup="true">Change my hero</button></div>${coachHTML(me,{compact:true})}<section class="panel"><h2>Completed items you own</h2><label>Add owned item<select id="live-owned-add" ${owned.length>=6?'disabled aria-describedby="inventory-limit"':''}>${options(all.map(i=>[i.name,i.name]),'','Choose an item')}</select></label>${owned.length>=6?'<p id="inventory-limit">All six slots are filled. Remove an incorrect entry to add another.</p>':''}<div class="flex">${owned.map((n,i)=>`<button data-owned-remove="${i}" aria-label="Remove ${esc(n)}">${esc(n)} ×</button>`).join('')||'<p>No completed items entered.</p>'}</div><button id="live-context-clear">Clear inventory & game state</button></section><h2>Lane opponent</h2>${fullSlotRows('enemies',me.role)}<details><summary>Add allies · ${Math.max(0,S.locks.length-1)} selected</summary><div class="detail-content">${fullSlotRows('allies',null,me.role)}</div></details><details><summary>Add enemies · ${S.enemies.filter(e=>e.role!==me.role).length} other roles</summary><div class="detail-content">${fullSlotRows('enemies',null,me.role)}</div></details>`;
}
function situationHTML(p){const node=document.createElement('div');node.innerHTML=liveMobileDetails();const controls=node.querySelector('.coach-controls')?.outerHTML||'';const coach=node.querySelector('.coach');const parts=[];let next=coach?.nextElementSibling;while(next){parts.push(next.outerHTML);next=next.nextElementSibling;}return controls+parts.join('');}
function mobileBuilds(){const rows=Object.keys(E.heroes).filter(slug=>E.roles(slug).includes(S.role)&&name(slug).toLowerCase().includes(S.query.toLowerCase())).sort((a,b)=>name(a).localeCompare(name(b)));return head('Builds · '+esc(B.bracket?.label||''),'Reviewed starting plans','Choose a role, then open one compact plan. Source variants remain on the hero page.')+metaToolbarHTML()+maintenanceHTML()+`<div class="mobile-build-list">${rows.map(slug=>{const plan=E.plannedBuild(slug,S.role),perf=E.displayPerformance({slug,role:S.role});return `<details class="panel mobile-build-row" data-keep="build-${slug}"><summary>${art(slug,'tiny')}<span><strong>${esc(name(slug))}</strong><small>${perf?displayedRoleText(perf):'Role sample unavailable'}</small></span><span>${plan.kind==='reviewed'?badge('Reviewed','reviewed'):badge('Provisional','warning')}</span></summary><div class="detail-content">${plannedBuildHTML(plan,true)}<button data-hero-builds="${slug}" data-role="${S.role}">Open full build</button></div></details>`;}).join('')}</div>${!rows.length?empty('No heroes match this role and search.'):''}`;}
function moreView(){return head('All tools','More','Planning, evidence and preferences.')+`<div class="more-grid">${[['library','Items & loadouts'],['guidance','Reviewed guide'],['changes','Changes'],['data','Sources & accuracy']].map(([r,t])=>`<button data-route="${r}">${t}</button>`).join('')}<button id="download-review-packet">Download strategy review packet</button><button id="companion-install">Install / offline help</button><button id="companion-theme">Switch to ${document.documentElement.dataset.theme==='light'?'dark':'light'} theme</button><button id="share-plan">Share draft plan</button><button id="import-plan">Open draft plan</button><button id="more-export" ${B?'':'disabled'}>Export snapshot</button></div><section class="panel"><h2>Reading preferences</h2><label><input id="large-text" type="checkbox" ${companionPrefs.large?'checked':''}> Large text</label><p>Phone text scaling and reduced motion settings are respected.</p><button data-new-match="true">New match</button><p>Keeps planning picks and preferences; resets inventory and live judgments.</p></section>`;}
function downloadReviewPacket(){const packet=E.reviewPacket({revision:typeof revision==='string'?revision:null,cohorts:typeof publishedCohorts==='object'?publishedCohorts:null,toolVersion:APP_CONFIG.tool_version});const blob=new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Predecessor-strategy-review-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
// ---- Phase H: browse every hero of a role, compact limitations, Live hero replacement with preview and Undo. ----
let metaShowAll=false;
function metaOrder(role){return (a,b)=>{if(S.bracket==='gold'){const order={S:0,A:1,B:2,C:3},ar=E.metaReview(a.slug,role),br=E.metaReview(b.slug,role),d=(order[ar?.tier]??9)-(order[br?.tier]??9);if(d)return d;}return (b.perf.wr??-1)-(a.perf.wr??-1)||(b.perf.played??0)-(a.perf.played??0);};}
// Every hero that plays the role: sampled heroes (100+ games) in Meta order, then the rest by sample size. Nothing is estimated.
// Why a hero shows no numbers: statistics paused for the whole page, or no sample for this rank and role.
function statsReason(slug,role){let policy={};try{policy=E.performancePolicy();}catch{}if(!policy.source)return policy.label==='Verification required'?'paused':'unavailable';if(policy.source==='pred'){const roles=B?.scoped_statistics?.roles;if(roles&&(!roles[role]||roles[role].status==='failed'))return 'failed';}if(policy.source==='statz'&&['failed','patch_conflict'].includes(B?.heroes?.[slug]?.roles?.[role]?.status))return 'failed';return 'none';}
// The same reason, naming the source the ranking actually uses (for the coach and the hero header).
function roleSampleText(slug,role){if(E.displayPerformancePolicy().inspection_only)return noStatsText(role,slug);let policy={};try{policy=E.performancePolicy();}catch{}const source=policy.source==='pred'?'Pred.gg':'Statz',r=(labels[role]||role).toLowerCase();return {paused:'Role statistics paused',unavailable:'Role statistics unavailable',failed:source+' '+r+' statistics failed to load',none:'No '+source+' '+(B?.bracket?.label||'rank')+' '+r+' sample'}[statsReason(slug,role)];}
function noStatsText(role,slug){if(E.displayPerformancePolicy().inspection_only)return 'No previous Statz '+(B.patch||'')+' '+(labels[role]||role).toLowerCase()+' sample';return {paused:'Statistics paused',unavailable:'Role statistics unavailable',failed:'Statistics failed to load',none:'No '+(B?.bracket?.label||'rank')+' '+(labels[role]||role).toLowerCase()+' sample'}[statsReason(slug,role)];}
function roleHeroes(role){const all=Object.keys(E.heroes).filter(slug=>E.roles(slug).includes(role)).map(slug=>({slug,role,perf:E.performance({slug,role})}));const sampled=all.filter(r=>r.perf?.played>=100).sort(metaOrder(role)),rest=all.filter(r=>!(r.perf?.played>=100)).sort((a,b)=>(b.perf?.played??-1)-(a.perf?.played??-1)||name(a.slug).localeCompare(name(b.slug)));return {sampled,rest,all:sampled.concat(rest)};}
function limitationItems(){let ev=null;try{ev=E.evidenceState();}catch{}const items=(ev?.limitations||[]).map(detail=>({source:'Evidence',detail,severity:ev.verification.state==='verified'?'warning':'error'})),seen=new Set(items.map(i=>i.source+'|'+i.detail));for(const e of errors()){const key=e.source+'|'+e.detail;if(!seen.has(key)){seen.add(key);items.push(e);}}return items;}
function limitsDialogHTML(){return `<p>Each source keeps its own date. Nothing is estimated when a source is missing.</p><ul class="limits-list">${limitationItems().map(i=>`<li><strong>${esc(i.source)}</strong> ${esc(i.detail)}</li>`).join('')}</ul><button data-limits-sources="true">Open Sources &amp; accuracy</button>`;}
// Why a hero cannot be your Live hero in this role ('' when it can). An ally holding the role can be replaced.
function pickBlock(slug,role){if(!E.heroes[slug]||!E.roles(slug).includes(role))return 'Role unavailable';if(S.bans.includes(slug))return 'Banned';if(S.enemies.some(p=>p.slug===slug))return 'Picked by the enemy team';const ally=S.locks.find(p=>p.slug===slug);if(slug===S.me&&ally?.role===role)return 'Your current hero';if(ally&&ally.role!==role&&slug!==S.me)return 'On your team as '+labels[ally.role];return '';}
function liveSwap(slug,role){const me=S.locks.find(p=>p.slug===S.me)||null;return {me,occupant:S.locks.find(p=>p.role===role&&p.slug!==slug&&p.slug!==me?.slug)||null};}
function livePickerHTML(role){const me=S.locks.find(p=>p.slug===S.me)||null;return `<p>${me?'Replacing '+esc(name(me.slug))+' · '+esc(labels[me.role])+'. ':''}${S.route==='live'?'You stay in Live; your':'Your'} draft is not opened.</p><div class="role-choices compact tab-strip tab-strip--segmented" role="tablist" aria-label="Role">${roleOrder.map(r=>`<button role="tab" data-picker-role="${r}" aria-selected="${r===role}">${labels[r]}</button>`).join('')}</div><div class="picker-list">${roleHeroes(role).all.map(r=>{const why=pickBlock(r.slug,role),id='pick-why-'+r.slug;return `<button class="picker-hero" data-pick-live="${esc(r.slug+'|'+role)}" ${why?`disabled aria-describedby="${id}"`:''}>${art(r.slug,'tiny')}<span><strong>${esc(name(r.slug))}</strong><small ${why?`id="${id}"`:''}>${why?esc(why):r.perf?pct(r.perf.wr)+' · '+games(r.perf.played)+(r.perf.played<100?' · small sample':''):esc(noStatsText(role,r.slug))}</small></span></button>`;}).join('')}</div>${me?`<button data-close-detail="true">Keep ${esc(name(me.slug))}</button>`:''}`;}
function showLivePicker(role,open=false){const title=S.locks.some(p=>p.slug===S.me)?'Change your Live hero':'Choose your hero';if(open||!$('#detail').open)detail(title,livePickerHTML(role));else{$('#detail-title').textContent=title;$('#detail-body').innerHTML=livePickerHTML(role);}$('#detail-body [role=tab][aria-selected="true"]')?.focus();}
function liveConfirmHTML(slug,role){const {me,occupant}=liveSwap(slug,role);return `<div class="swap"><div><small>Now</small><strong>${me?esc(name(me.slug)):'No hero'}</strong><small>${me?esc(labels[me.role]):'Live'}</small></div><span aria-hidden="true">→</span><div><small>New</small><strong>${esc(name(slug))}</strong><small>${esc(labels[role])}</small></div></div>${occupant?note(`<strong>${esc(labels[role])} is already taken on your team.</strong> ${esc(name(occupant.slug))} holds ${esc(labels[role])}. Confirming puts ${esc(name(slug))} in that slot and removes ${esc(name(occupant.slug))} from your lineup. You can undo this.`,true):''}${me&&me.slug!==slug?`<p>${esc(name(me.slug))} leaves your lineup. Items you entered stay with ${esc(name(me.slug))}; your match situation carries over.</p>`:''}<div class="live-actions"><button class="primary" data-confirm-live="${esc(slug+'|'+role)}">Use ${esc(name(slug))}</button><button data-picker-role="${esc(role)}">Choose another</button></div>`;}
function useInLive(slug,role){const why=pickBlock(slug,role);if(why)throw Error(why+'. Choose another hero.');const {me,occupant}=liveSwap(slug,role),before=undoSnapshot(),carried=me?contextFor(me).state:null,key=slug+'|'+role;S.locks=S.locks.filter(p=>p.slug!==me?.slug&&p.role!==role&&p.slug!==slug).concat({slug,role});S.me=slug;S.liveVariant=null;if(carried&&!S.liveContexts[key])S.liveContexts[key]={owned:[],state:carried,priority:''};saveMatchSession();S.route='live';return {before,replaced:!!(me||occupant),label:name(slug)+' is now your Live hero'+(me&&me.slug!==slug?' (was '+name(me.slug)+')':'')+(occupant?'; '+name(occupant.slug)+' left '+labels[role]:'')+'.'};}
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
function fullSlotRows(side,onlyRole=null,exceptRole=null){const picks=side==='allies'?S.locks:S.enemies;return `<div class="slots">${roleOrder.filter(r=>(!onlyRole||r===onlyRole)&&r!==exceptRole).map(r=>{const current=picks.find(p=>p.role===r);return `<div class="slot"><label>${labels[r]}<select data-slot="${side}" data-slot-role="${r}" aria-describedby="${side}-${r}-help"><option value="">Open slot</option>${Object.keys(E.heroes).sort((a,b)=>name(a).localeCompare(name(b))).map(s=>{const reason=disabledHero(s,side,r);return `<option value="${s}" ${current?.slug===s?'selected':''} ${reason?'disabled':''}>${esc(name(s))}${reason?' — '+esc(reason):''}</option>`;}).join('')}</select></label><small id="${side}-${r}-help">Picked, banned or unsupported-role choices are disabled.</small>${current?`<div class="slot-art">${art(current.slug,'tiny')}${esc(name(current.slug))}</div>`:''}</div>`;}).join('')}</div>`;}
slotRows=function(side){const picks=side==='allies'?S.locks:S.enemies;return `<details class="lineup" data-lineup="${side}" data-keep="lineup-${side}"><summary>${side==='allies'?'Allies':'Enemies'} · ${picks.length} of ${side==='allies'&&S.route==='planner'?S.size:5} selected</summary>${fullSlotRows(side)}</details>`;};
let rosterExpanded=false,planOptionsExpanded=false;
function capturePlanDisclosures(){const roster=$('[data-roster-picks]'),options=$('[data-keep="plan-search-options"]');if(roster)rosterExpanded=roster.open;if(options)planOptionsExpanded=options.open;}
function planRosterHTML(){
 const me=S.locks.find(p=>p.slug===S.me);
 return `<aside class="plan-roster" aria-label="Shared lineup"><div class="roster-top"><div><strong>Your lineup</strong><small>${S.locks.length} allies · ${S.enemies.length} enemies · ${S.bans.length} bans${me?' · You: '+esc(name(me.slug)):''}</small></div><button data-edit-roster="true">Edit lineup</button></div><details data-roster-picks ${rosterExpanded?'open':''}><summary>View picks & bans</summary><div class="roster-teams">${[['Allies',S.locks],['Enemies',S.enemies]].map(([label,picks])=>`<div><strong>${label}</strong>${roleOrder.map(role=>{const p=picks.find(p=>p.role===role);return `<p><span>${labels[role]}</span> ${p?esc(name(p.slug)):'Open'}</p>`;}).join('')}</div>`).join('')}</div><p>Bans: ${S.bans.map(s=>esc(name(s))).join(', ')||'None'}</p><small>Shared across all three stages. Only your hero is required for Live.</small></details></aside>`;
}
function rosterEditorHTML(){
 const taken=new Set([...S.locks,...S.enemies].map(p=>p.slug));
 return `<p>Changes apply immediately to Compose, Draft and Live. Each pick keeps its role.</p>${['allies','enemies'].map(side=>`<section><h2>${side==='allies'?'Allies':'Enemies'}</h2><div class="roster-editor-grid">${roleOrder.map(role=>{const p=(side==='allies'?S.locks:S.enemies).find(p=>p.role===role),protectedMe=side==='allies'&&p?.slug===S.me;return `<label>${labels[role]}<select data-plan-side="${side}" data-plan-role="${role}" ${protectedMe?'disabled':''}>${options([['','Open slot'],...Object.keys(E.heroes).filter(slug=>slug===p?.slug||!disabledHero(slug,side,role)).sort((a,b)=>name(a).localeCompare(name(b))).map(slug=>[slug,name(slug)])],p?.slug||'')}</select>${protectedMe?'<small>Your Live hero. Change them from Live.</small>':''}</label>`;}).join('')}</div></section>`).join('')}<section><h2>Bans</h2><label>Ban a hero<select data-plan-ban>${options(Object.keys(E.heroes).filter(s=>!taken.has(s)&&!S.bans.includes(s)).sort((a,b)=>name(a).localeCompare(name(b))).map(s=>[s,name(s)]),'','Choose hero')}</select></label><div class="selection-chips">${S.bans.map(s=>`<button data-plan-unban="${s}">Remove ban: ${esc(name(s))}</button>`).join('')}</div></section><button data-close-detail="true">Done</button>`;
}
function refreshRosterEditor(selector){if($('#detail').open){$('#detail-body').innerHTML=rosterEditorHTML();$('#detail-body').querySelector(selector||'[data-plan-ban]')?.focus();}}
document.addEventListener('toggle',event=>{if(event.target.matches?.('[data-roster-picks]'))rosterExpanded=event.target.open;if(event.target.matches?.('[data-keep="plan-search-options"]'))planOptionsExpanded=event.target.open;},true);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-edit-roster],[data-plan-unban]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(button.hasAttribute('data-edit-roster')){detail('Edit shared lineup',rosterEditorHTML());dialogReturn=button;return;}
 const before=undoSnapshot();S.bans=S.bans.filter(s=>s!==button.dataset.planUnban);save();render();refreshRosterEditor();showUndo(before,'Ban removed.');
},true);
document.addEventListener('change',event=>{
 const el=event.target;if(!el.matches('[data-plan-side],[data-plan-ban]'))return;
 event.stopImmediatePropagation();const before=undoSnapshot();
 try{if(el.dataset.planSide){const selector=`[data-plan-side="${el.dataset.planSide}"][data-plan-role="${el.dataset.planRole}"]`;if(setPick(el.dataset.planSide,el.dataset.planRole,el.value))showUndo(before,'Lineup updated.');refreshRosterEditor(selector);}else if(el.value){banHero(el.value);refreshRosterEditor();showUndo(before,'Hero banned.');}}
 catch(e){toast(e.message);refreshRosterEditor();}
},true);
const originalChangeRoute=changeRoute,originalOpenHero=openHero;
const originalDetail=detail;let dialogReturn=null,dialogSituation=null;
detail=function(title,body,refresh){if(!document.querySelector('#detail')?.open){dialogReturn=document.activeElement;dialogSituation=dialogReturn?.dataset?.editSituation;}originalDetail(title,body,refresh);};
$('#detail').addEventListener('close',()=>{if(dialogReturn?.isConnected)dialogReturn.focus();else if(dialogReturn?.hasAttribute('data-edit-roster'))document.querySelector('[data-edit-roster]')?.focus();else if(dialogSituation)document.querySelector('[data-edit-situation]')?.focus();else $('#main').focus({preventScroll:true});});
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
changeRoute=function(route){
 saveNavigationPosition();navigationRestore=null;navigationTransition=true;
 // Suppress an old URL during the draw; the new URL is committed after the draw.
 linkApplied=location.hash;
 try{originalChangeRoute(destinationRoute(route));}finally{navigationTransition=false;}
 recordNavigation();
};
openHero=function(slug,role){
 if(!E.heroes[slug]){companionError='That hero is unavailable. Choose another.';changeRoute('meta');return;}
 saveNavigationPosition();originalOpenHero(slug,role);
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
 }catch(e){companionError=e.message;S.route='meta';}
}
function afterDestinationRender(){
 const main=$('#main');if(!main||!B)return;
 const sections=destinationSections();if(sections)main.insertAdjacentHTML('afterbegin',sections);
 if(destinationFor(S.route)==='plan'){
  const nav=main.querySelector('.destination-sections');
  if(nav)nav.insertAdjacentHTML('afterend',planRosterHTML());else main.insertAdjacentHTML('afterbegin',planRosterHTML());
  if(S.route==='live'&&!main.querySelector('[data-live-lookup]'))main.querySelector('.page-head')?.insertAdjacentHTML('afterend',`<button data-live-lookup="true">${S.locks.some(p=>p.slug===S.me)?'Change my hero':'Choose my hero'}</button>`);
  // The action follows the size choices; full slot editors and methodology remain available below it.
  if(S.route==='planner'){
   const generate=main.querySelector('#generate')?.closest('.toolbar'),size=main.querySelector('[data-size]')?.closest('.toolbar');
   if(generate&&size)size.after(generate);
   const optionsGroup=main.querySelector('#comp-role')?.closest('.toolbar-group');
   if(optionsGroup&&generate){const disclosure=document.createElement('details');disclosure.dataset.keep='plan-search-options';disclosure.open=planOptionsExpanded;disclosure.innerHTML='<summary>Search options · roles, ordering & samples</summary><div class="detail-content toolbar"></div>';disclosure.lastElementChild.append(optionsGroup);generate.after(disclosure);}
  }
 }
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
function undoSnapshot(){return copyValue({locks:S.locks,enemies:S.enemies,bans:S.bans,me:S.me,liveVariant:S.liveVariant,contexts:S.liveContexts});}
function showUndo(before,label){clearTimeout(undoTimer);undoAction=before;let el=$('#undo-banner');if(!el){el=document.createElement('div');el.id='undo-banner';el.setAttribute('role','status');document.body.append(el);el.addEventListener('focusin',()=>clearTimeout(undoTimer));el.addEventListener('mouseenter',()=>clearTimeout(undoTimer));el.addEventListener('mouseleave',expireUndo);el.addEventListener('focusout',expireUndo);}el.hidden=false;el.innerHTML=`<span>${esc(label)}</span><button id="undo-action">Undo</button>`;expireUndo();}
function expireUndo(){clearTimeout(undoTimer);undoTimer=setTimeout(()=>{if($('#undo-banner')?.contains(document.activeElement))return;undoAction=null;if($('#undo-banner'))$('#undo-banner').hidden=true;},8000);}
function installHelp(){companionPrefs.installSeen=true;saveCompanionPrefs();document.querySelector('.install-hint')?.remove();detail('Install on your phone','<p><strong>iPhone / iPad:</strong> open this website in Safari, tap Share, then Add to Home Screen.</p><p><strong>Android:</strong> open in Chrome, use its menu and choose Install app or Add to Home screen.</p><p>Open a rank online once to save it on this device. Offline views retain their original dates. Images may be unavailable offline.</p>');}
async function shareHero(){const url=new URL(APP_CONFIG.mode==='local'||location.protocol==='file:'?'https://gn45db4tjc-ship-it.github.io/predecessor-meta/':location.href);url.search='';url.hash='hero='+encodeURIComponent(S.hero)+'&role='+S.heroRole+'&bracket='+S.bracket+'&tab='+S.heroTab;try{if(navigator.share){await navigator.share({title:name(S.hero)+' build',url:url.href});return;}}catch(e){if(e.name==='AbortError')return;}try{await navigator.clipboard.writeText(url.href);toast('Hero link copied.');}catch{detail('Share hero',`<label>Copy this link<input readonly value="${esc(url.href)}"></label><p>Contains only hero, role, bracket and section.</p>`);}}
document.addEventListener('click',async event=>{
 const el=event.target.closest('button');if(!el)return;const d=el.dataset;
 if(d.ownedRemove!==undefined||['live-context-clear','clear-locks','clear-enemies'].includes(el.id)||d.unban){const before=undoSnapshot();setTimeout(()=>showUndo(before,'Selection cleared.'),0);}
 const handled=d.mobileRole||d.favorite||d.liveLookup||d.startLive||d.newMatch||d.editSituation||d.pickerRole||d.pickLive||d.confirmLive||d.closeDetail||d.limitsSources||['mobile-all-heroes','mobile-limits','menu-toggle','undo-action','companion-install','companion-theme','share-hero','favorite-hero','download-review-packet','live-context-clear','retry-companion'].includes(el.id);
 if(!handled)return;event.preventDefault();event.stopImmediatePropagation();
 try{
 if(el.id==='menu-toggle'){changeRoute('more');return;}
 if(el.id==='retry-companion'){$('#refresh').click();return;}
 if(el.id==='download-review-packet'){downloadReviewPacket();return;}
 if(d.editSituation){const [slug,role]=d.editSituation.split('|');detail('Your game situation',situationHTML({slug,role}));return;}
 if(el.id==='mobile-all-heroes'){metaShowAll=!metaShowAll;render();$('#mobile-all-heroes')?.focus();return;}
 if(el.id==='mobile-limits'){detail('Source limitations',limitsDialogHTML());return;}
 if(d.limitsSources){dialogReturn=null;dialogSituation=null;$('#detail').close();changeRoute('data');$('#main').focus({preventScroll:true});return;}
 if(d.closeDetail){$('#detail').close();return;}
 if(d.liveLookup){const me=S.locks.find(p=>p.slug===S.me);showLivePicker(me?.role||(roleOrder.includes(S.role)?S.role:'jungle'),true);return;}
 if(d.pickerRole){showLivePicker(d.pickerRole);return;}
 if(d.pickLive){const [slug,role]=d.pickLive.split('|');$('#detail-title').textContent=S.locks.some(p=>p.slug===S.me)?'Replace your Live hero?':'Use in Live?';$('#detail-body').innerHTML=liveConfirmHTML(slug,role);$('#detail-body [data-confirm-live]')?.focus();return;}
 if(d.confirmLive){const [slug,role]=d.confirmLive.split('|'),result=useInLive(slug,role);if($('#detail').open)$('#detail').close();save();render();recordNavigation();$('#main').focus({preventScroll:true});if(result.replaced)showUndo(result.before,result.label);else toast(result.label);return;}
 if(el.id==='live-context-clear'){S.liveContexts[liveContextKey()]={owned:[],state:'even',priority:''};}
 else if(d.mobileRole){S.role=d.mobileRole;companionPrefs.homeQuery='';metaShowAll=false;saveCompanionPrefs();}
 else if(d.favorite){companionPrefs.favorites=companionPrefs.favorites.filter(v=>v!==d.favorite);saveCompanionPrefs();}
 else if(el.id==='favorite-hero'){const key=S.hero+'|'+S.heroRole;companionPrefs.favorites=companionPrefs.favorites.includes(key)?companionPrefs.favorites.filter(v=>v!==key):[key,...companionPrefs.favorites].slice(0,20);saveCompanionPrefs();}
 else if(d.startLive){matchSetMe(S.hero);S.locks=[{slug:S.hero,role:E.roles(S.hero).includes(S.heroRole)?S.heroRole:E.roles(S.hero)[0]}];save();S.route='match';}
 else if(d.newMatch){const before=undoSnapshot();S.liveContexts={};S.liveVariant=null;showUndo(before,'New match: inventory and live judgments reset. Planning picks kept.');}
 else if(el.id==='undo-action'&&undoAction){const before=undoAction;S.locks=before.locks;S.enemies=before.enemies;S.bans=before.bans;S.me=before.me;S.liveVariant=before.liveVariant;S.liveContexts=before.contexts;undoAction=null;clearTimeout(undoTimer);$('#undo-banner').hidden=true;}
 else if(el.id==='companion-install'){installHelp();return;}
 else if(el.id==='companion-theme'){$('#theme-toggle').click();}
 else if(el.id==='share-hero'){await shareHero();return;}
 save();render();recordNavigation();$('#main').focus({preventScroll:true});
 }catch(e){companionError=e.message;toast(e.message);}
},true);
document.addEventListener('change',event=>{
 const el=event.target,d=el.dataset;
 if(el.id==='bracket'&&linkedBracketPending!==el.value){saveNavigationPosition();navigationRestore=null;navigationRankChange=el.value;linkApplied=location.hash;}
 if(d.slot&&el.value){const why=disabledHero(el.value,d.slot,d.slotRole);if(why){event.stopImmediatePropagation();toast(why+'. Clear the existing selection first.');render();return;}}
 if(d.slot&&!el.value){const before=undoSnapshot();setTimeout(()=>showUndo(before,'Pick removed.'),0);}
 if(d.coachField){event.stopImmediatePropagation();const [slug,role]=d.coachKey.split('|'),p={slug,role};if(!E.heroes[slug]||!E.roles(slug).includes(role))return;const val=d.coachField==='primaryThreat'?(el.value||null):el.value;S.liveContexts[d.coachKey]={...contextFor(p),[d.coachField]:val};const modal=$('#detail').open;save();render();if(!modal)document.querySelector(`[data-coach-key="${d.coachKey}"][data-coach-field="${d.coachField}"]`)?.focus();}
 else if(el.id==='mobile-meta-order'){companionPrefs.metaOrder=el.value;saveCompanionPrefs();render();$('#mobile-meta-order')?.focus();}
 else if(el.id==='mobile-hero-role'){S.heroRole=el.value;render();recordNavigation(true);$('#mobile-hero-role')?.focus();}
 else if(el.id==='large-text'){companionPrefs.large=el.checked;saveCompanionPrefs();companionChrome();}
 else if(el.id==='hero-role')setTimeout(()=>recordNavigation(true),0);
},true);
document.addEventListener('input',event=>{if(event.target.id==='mobile-hero-search'){const pos=event.target.selectionStart;companionPrefs.homeQuery=event.target.value;saveCompanionPrefs();render();const input=$('#mobile-hero-search');input?.focus();input?.setSelectionRange(pos,pos);}});
document.addEventListener('click',event=>{if(event.target.closest('[data-meta-role]'))recordNavigation(true);if(event.target.closest('[data-hero-tab]')){recordNavigation(true);if(companionMedia.matches){const d=$('#main > details');if(d)d.open=true;}}});
window.addEventListener('popstate',event=>{
 historyApplying=true;navigationRestore=event.state?.companion?event.state:null;
 try{
  if(navigationRestore){const n=navigationRestore.companion;
   S.route=n.route;S.hero=n.hero;S.heroRole=n.role;S.heroTab=n.tab;
   if(roleOrder.includes(n.metaRole))S.role=n.metaRole;
   for(const k of ['query','sort','direction','full'])if(n[k]!==undefined)S[k]=n[k];
   if(n.homeQuery!==undefined)companionPrefs.homeQuery=n.homeQuery;if(n.showAll!==undefined)metaShowAll=n.showAll;
   sectionSpy.requested=null;sectionSpy.tab=n.tab;linkApplied=location.hash;
   if(n.bracket!==S.bracket)requestLinkedBracket(n.bracket);
  }else linkApplied='';
  render();
 }finally{historyApplying=false;}
});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#plan=')&&location.hash!==linkApplied){render();}});
window.addEventListener('offline',()=>redrawForEvidence());window.addEventListener('online',()=>redrawForEvidence());
companionMedia.addEventListener('change',()=>render());
function refreshSituation(event){if(!$('#detail')?.open||$('#detail-title').textContent!=='Your game situation')return;if(!event.target.closest('#detail-body'))return;const id=event.target.id,key=event.target.dataset.coachField;setTimeout(()=>{const me=S.locks.find(p=>p.slug===S.me);if(!me)return;$('#detail-body').innerHTML=situationHTML(me);(id?$('#detail-body #'+id):key?$('#detail-body [data-coach-field="'+key+'"]'):null)?.focus();},0);}
document.addEventListener('change',refreshSituation,true);
document.addEventListener('click',event=>{if(event.target.closest('[data-owned-remove],#live-context-clear'))refreshSituation(event);},true);
setTimeout(()=>{if(companionMedia.matches&&!companionPrefs.installSeen&&APP_CONFIG.mode==='static'&&!matchMedia('(display-mode:standalone)').matches){let el=document.createElement('aside');el.className='install-hint';el.innerHTML='<span>Add this companion to your home screen.</span><button id="companion-install">How to install</button><button aria-label="Dismiss installation hint">Dismiss</button>';el.lastElementChild.onclick=()=>{companionPrefs.installSeen=true;saveCompanionPrefs();el.remove();};$('#main').after(el);}},1200);
