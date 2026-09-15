/* Companion presentation. Inlined into local, exported and public HTML. No fetching here. */
const companionMedia=matchMedia('(max-width:700px)');
const matchKey='predecessor-match-v2',prefsKey='predecessor-companion-v1';
const copyValue=v=>JSON.parse(JSON.stringify(v));
let companionPrefs={recent:[],large:false,installSeen:false};
try{Object.assign(companionPrefs,JSON.parse(localStorage.getItem(prefsKey)||'{}'));}catch{}
if(!Array.isArray(companionPrefs.recent))companionPrefs.recent=[];
let wizard={step:1,role:S.role||'jungle',hero:null,enemy:null,query:''},undoAction=null,undoTimer=null,historyApplying=false,linkApplied='',companionError='';
S.liveContexts={};S.liveVariant=null;
try{const m=JSON.parse(sessionStorage.getItem(matchKey)||'{}');if(m.v===2&&m.contexts&&typeof m.contexts==='object'&&!Array.isArray(m.contexts))S.liveContexts=m.contexts;if(m.wizard&&roleOrder.includes(m.wizard.role)&&[1,2,3].includes(m.wizard.step))wizard={...wizard,...m.wizard};}catch{}
function saveCompanionPrefs(){try{localStorage.setItem(prefsKey,JSON.stringify(companionPrefs));}catch{toast('Preferences could not be saved on this device.');}}
function saveMatchSession(){try{sessionStorage.setItem(matchKey,JSON.stringify({v:2,contexts:S.liveContexts,wizard}));}catch{ /* Usable in memory when storage is unavailable. */ }}
function contextFor(p){const c=S.liveContexts[p.slug+'|'+p.role];return c&&typeof c==='object'?c:{owned:[],state:'even',priority:''};}
function coachEnemies(p){return S.enemies.filter(e=>e.slug!==p.slug).concat(wizard.hero===p.slug&&wizard.enemy&&!S.enemies.some(e=>e.role===p.role||e.slug===wizard.enemy)?[{slug:wizard.enemy,role:p.role}]:[]);}
function adviceFor(p){const enemies=coachEnemies(p),ctx={...contextFor(p)};if(ctx.primaryThreat&&!enemies.some(e=>e.slug===ctx.primaryThreat))delete ctx.primaryThreat;return E.adaptBuild(p,S.locks.filter(a=>a.slug!==p.slug).concat(p),enemies,ctx);}
function freshnessHTML(){
 const rows=[['Mechanics',B?.sources?.pred_game_data||B?.sources?.omeda_heroes],['Statistics',B?.sources?.statz_hero_pages]];
 const dated=rows.map(([label,s])=>label+': '+date(s?.fetched_at)+(s?.status==='retained'?' · retained':''));
 const stale=rows.some(([,s])=>!Number.isFinite(Date.parse(s?.fetched_at))||Date.now()-Date.parse(s.fetched_at)>30*3600000||s?.status==='retained');
 return `<p class="coach-date ${stale||!navigator.onLine||connectionLost?'warning':''}">${!navigator.onLine||connectionLost?'Connection unavailable · saved data. ':stale?'Older or incomplete source data. ':''}${esc(B?.bracket?.label||'Bracket unavailable')} · ${esc(dated.join(' · '))}</p>`;
}
function coachHTML(p,{compact=false}={}){
 let a;try{a=adviceFor(p);}catch(e){return `<section class="panel coach"><h2>Recommendation unavailable</h2><p>${esc(e.message)}</p><button data-route="data">Inspect sources</button></section>`;}
 const enemies=coachEnemies(p),key=p.slug+'|'+p.role,attr=`data-coach-key="${esc(key)}"`;
 const controls=`<div class="coach-controls"><label>My hero is<select ${attr} data-coach-field="state">${options([['ahead','Ahead'],['even','Even'],['behind','Behind']],a.state)}</select></label><label>Primary threat<select ${attr} data-coach-field="primaryThreat">${options(enemies.map(e=>[e.slug,name(e.slug)+' · '+labels[e.role]]),a.primaryThreat||'','No primary threat')}</select></label><label>Urgent need<select ${attr} data-coach-field="priority">${options(E.itemNeeds.filter(n=>!n.manual).map(n=>[n.id,n.label]),a.priority,'Normal timing')}</select></label></div>`;
 const info=`<p class="muted">Judge your hero’s farm and power curve. Enemy equipment is unknown until you choose a need.</p>`;
 const next=a.available?(a.nextPurchase?`<h2>Next: ${esc(a.nextPurchase.name)}</h2>${badge(a.nextPurchase.kind==='core'||a.nextPurchase.kind==='baseline'?'Reviewed':'Calculated',a.nextPurchase.kind==='core'?'reviewed':'calculated')}`:'<h2>Six completed items owned</h2><p>No purchase or sale suggested.</p>'):`<h2>Recommendation unavailable</h2><p>${esc(a.unavailableReason)}</p>`;
 return `<section class="panel coach" aria-label="Build Coach"><div class="coach-next">${next}</div>${controls}${compact?'':info}${freshnessHTML()}${a.available?`<p class="coach-reason">${esc(a.explanations[0])}</p><ol class="build-path coach-path">${a.slots.map((s,i)=>`<li><span class="item-position">${i+1} · ${esc(s.label)}</span>${itemButton(s.name)}</li>`).join('')}</ol>`:'<button data-route="data">Inspect sources & accuracy</button>'}<details><summary>Advanced details · why this path</summary><div class="detail-content">${info}<p>Reviewed for ${esc(a.evidence.reviewed.patch||'unverified')} · ${esc(date(a.evidence.reviewed.date))}. Editorial reference remains Gold+; observations use ${esc(B.bracket?.label)}.</p>${a.explanations.slice(1).map(t=>`<p>${esc(t)}</p>`).join('')}${a.changes.map(c=>`<p><strong>Position ${c.position}: ${esc(c.item)}</strong><br>${esc(c.reason)}</p>`).join('')}${a.timing.map(t=>`<p>${esc(t)}</p>`).join('')}${a.contingency?`<p>Alternative for ${esc(a.contingency.need)}: ${itemButton(a.contingency.name)}<br>${esc(a.contingency.reason)}</p>`:''}<p>Reviewed baseline: ${esc(a.baseline.join(' → ')||'Unavailable')}</p>${a.itemEvidence.issues.map(t=>note(esc(t),true)).join('')}${Object.values(a.itemEvidence.pool).filter(r=>a.slots.some(s=>normalizeName(s.name)===normalizeName(r.name))).map(r=>`<p>${esc(r.name)} · ${pct(r.wr)} · ${games(r.played)}<br>${esc(r.label||r.source)} · ${esc(date(r.fetched_at))} · ${r.supports_current_fit?'Eligible bracket evidence':'Inspection only; no influence'}</p>`).join('')}<p>${esc(a.note)}</p></div></details></section>`;
}
function companionChrome(){
 document.documentElement.classList.toggle('large-text',!!companionPrefs.large);
 let nav=$('#mobile-navigation');if(!nav){nav=document.createElement('nav');nav.id='mobile-navigation';nav.setAttribute('aria-label','Phone navigation');document.body.append(nav);}
 nav.innerHTML=[['meta','Heroes'],['builds','Builds'],['draft','Draft'],['live','Live'],['more','More']].map(([r,label])=>`<button data-route="${r}" ${S.route===r||r==='meta'&&S.route==='hero'||r==='more'&&['planner','library','guidance','changes','data'].includes(S.route)?'aria-current="page"':''}>${label}</button>`).join('');
 let status=$('#offline-status');if(!status){status=document.createElement('div');status.id='offline-status';status.setAttribute('role','status');$('.workspace').prepend(status);}status.textContent=navigator.onLine?'':'Offline · using saved data. Reconnect to check updates.';status.hidden=navigator.onLine;
 if(B)applyCompanionLink();
 let dock=$('#coach-dock');if(!dock){dock=document.createElement('aside');dock.id='coach-dock';document.body.append(dock);}
 const p=S.route==='hero'?{slug:S.hero,role:S.heroRole}:S.route==='live'?S.locks.find(x=>x.slug===S.me):null;
 dock.hidden=!companionMedia.matches||!B||!p;
 if(!dock.hidden){try{const a=adviceFor(p);dock.innerHTML=`<span>${a.available?`Next: <strong>${esc(a.nextPurchase?.name||'Build complete')}</strong>`:'Recommendation unavailable'}</span><button data-edit-situation="${esc(p.slug+'|'+p.role)}">Situation</button>`;}catch{dock.hidden=true;}}

}
function disabledHero(slug,side,role){const own=side==='allies'?S.locks:S.enemies,other=side==='allies'?S.enemies:S.locks;return S.bans.includes(slug)?'Banned':own.some(p=>p.slug===slug&&p.role!==role)||other.some(p=>p.slug===slug)?'Already picked':side==='allies'&&!E.roles(slug).includes(role)?'Role unavailable':'';}
function guidedHome(){
 if(wizard.hero&&(!E.heroes[wizard.hero]||!E.roles(wizard.hero).includes(wizard.role))){wizard.hero=null;wizard.step=2;companionError='That hero/role is unavailable in this bundle. Choose another hero.';}
 const progress=`<ol class="wizard-progress" aria-label="Hero lookup progress">${['Role','Hero','Opponent'].map((t,i)=>`<li ${wizard.step===i+1?'aria-current="step"':''}>${i+1}. ${t}</li>`).join('')}</ol>`;
 let content='';
 if(wizard.step===1)content=`<h2>Choose your role</h2><div class="role-choices">${roleOrder.map(r=>`<button data-wizard-role="${r}" aria-pressed="${wizard.role===r}">${labels[r]}</button>`).join('')}</div><button class="primary" data-wizard-next="2">Continue</button>`;
 if(wizard.step===2){const heroes=Object.keys(E.heroes).filter(s=>E.roles(s).includes(wizard.role)&&name(s).toLowerCase().includes(wizard.query.toLowerCase())).sort((a,b)=>name(a).localeCompare(name(b)));content=`<h2>Choose your ${labels[wizard.role].toLowerCase()}</h2><label>Find a hero<input id="wizard-search" type="search" autocomplete="off" value="${esc(wizard.query)}"></label><div class="hero-choices">${heroes.map(s=>`<button data-wizard-hero="${s}" aria-pressed="${wizard.hero===s}">${art(s,'tiny')}<span>${esc(name(s))}${!E.performance({slug:s,role:wizard.role})?'<small>No role sample</small>':''}</span></button>`).join('')||'<p>No heroes match. Clear the search or choose a different role.</p>'}</div><button data-wizard-next="1">Back</button><button class="primary" data-wizard-next="3" ${!wizard.hero?'disabled aria-describedby="wizard-help"':''}>Continue</button>${!wizard.hero?'<p id="wizard-help">Choose a hero to continue.</p>':''}`;}
 if(wizard.step===3)content=`<h2>Who are you facing?</h2><label>Opposing hero<select id="wizard-enemy">${options(Object.keys(E.heroes).filter(s=>s!==wizard.hero).sort((a,b)=>name(a).localeCompare(name(b))).map(s=>[s,name(s)]),wizard.enemy||'','Unknown / not selected')}</select></label><p>Optional: same-role opponent. Add other enemies later in Live.</p><div class="flex"><button data-wizard-next="2">Back</button><button data-wizard-skip="true">Skip opponent</button><button class="primary" data-wizard-show="true">Show my build</button></div>`;
 const recent=companionPrefs.recent.filter(p=>E.heroes[p.slug]&&E.roles(p.slug).includes(p.role)).slice(0,5);
 return head('Quick reference','Find your next answer','Role, hero, optional opponent.')+progress+(companionError?note(esc(companionError),true):'')+`<section class="panel wizard">${content}</section>${recent.length?`<details><summary>Recent heroes</summary><div class="detail-content">${recent.map(p=>`<button data-hero="${p.slug}" data-role="${p.role}">${esc(name(p.slug))} · ${labels[p.role]}</button>`).join('')}</div></details>`:''}<details><summary>Browse the full tier list</summary><div class="detail-content">${metaView()}</div></details>`;
}
function mobileHero(){
 const p={slug:S.hero,role:S.heroRole};if(!E.heroes[p.slug])return guidedHome();
 const blocked=disabledHero(p.slug,'allies',p.role)||(S.locks.some(x=>x.role===p.role&&x.slug!==p.slug)?'This allied role is filled':'');
 const perf=E.performance(p),enemies=coachEnemies(p),threat=enemies.find(e=>e.role===p.role)||enemies[0],strategy=threat?E.heroStrategy(threat.slug):null;
 return `<button data-route="meta">Change hero</button><div class="hero-header">${art(p.slug)}<div><h1>${esc(name(p.slug))}</h1><label>Role<select id="mobile-hero-role">${options(E.roles(p.slug).map(r=>[r,labels[r]]),p.role)}</select></label></div></div><div class="flex"><button id="share-hero">Share hero</button><button data-start-live="true" ${blocked?'disabled aria-describedby="start-live-reason"':''}>Use in Live game</button></div>${blocked?`<p id="start-live-reason">${esc(blocked)}. Clear the conflicting choice in Draft first.</p>`:''}<p>${metaTierButton(p.slug,p.role)} · ${perf?pct(perf.wr)+' · '+games(perf.played):'Role statistics unavailable'}</p>${coachHTML(p,{compact:true})}${threat?`<aside class="note"><strong>Facing ${esc(name(threat.slug))}</strong><p>${esc(strategy?.active?strategy.counterplay:'Reviewed counterplay unavailable. Open Counters for dated evidence.')}</p></aside>`:''}<details><summary>Advanced details · builds, partners, counters & kit</summary><div class="detail-content">${heroView().replace('<h1>','<h2>').replace('</h1>','</h2>')}</div></details>`;
}
function liveMobile(){
 const me=S.locks.find(p=>p.slug===S.me)||null;
 if(!me)return head('Live game','Choose who you play','Add your hero first; the rest of the lineup is optional.')+`<button class="primary" data-live-lookup="true">Choose my hero</button>${S.locks.length?`<label>Or use a locked ally<select id="me-hero">${options(S.locks.map(p=>[p.slug,name(p.slug)+' · '+labels[p.role]]),'','Choose ally')}</select></label>`:''}`;
 const ctx=contextFor(me),owned=Array.isArray(ctx.owned)?ctx.owned:[],all=Object.values(B.items||{}).filter(i=>i.completed_item&&i.available_current_patch!==false&&!owned.includes(i.name)).sort((a,b)=>a.name.localeCompare(b.name));
 return head('Live game',name(me.slug)+' · '+labels[me.role],'Your next completed item and the reason to buy it.')+`<div class="live-actions"><button data-new-match="true">New match</button><button data-live-lookup="true">Change my hero</button></div>${coachHTML(me,{compact:true})}<section class="panel"><h2>Completed items you own</h2><label>Add owned item<select id="live-owned-add" ${owned.length>=6?'disabled aria-describedby="inventory-limit"':''}>${options(all.map(i=>[i.name,i.name]),'','Choose a completed item')}</select></label>${owned.length>=6?'<p id="inventory-limit">All six slots are filled. Remove an incorrect entry to add another.</p>':''}<div class="flex">${owned.map((n,i)=>`<button data-owned-remove="${i}" aria-label="Remove ${esc(n)}">${esc(n)} ×</button>`).join('')||'<p>No completed items entered.</p>'}</div><button id="live-context-clear">Clear inventory & game state</button></section><h2>Lane opponent</h2>${fullSlotRows('enemies',me.role)}<details><summary>Add allies · ${Math.max(0,S.locks.length-1)} selected</summary><div class="detail-content">${fullSlotRows('allies',null,me.role)}</div></details><details><summary>Add enemies · ${S.enemies.filter(e=>e.role!==me.role).length} other roles</summary><div class="detail-content">${fullSlotRows('enemies',null,me.role)}</div></details>`;
}
function moreView(){return head('All tools','More','Planning, evidence and preferences.')+`<div class="more-grid">${[['planner','Compositions'],['library','Items & loadouts'],['guidance','Reviewed guide'],['changes','Changes'],['data','Sources & accuracy']].map(([r,t])=>`<button data-route="${r}">${t}</button>`).join('')}<button id="companion-install">Install / offline help</button><button id="companion-theme">Switch to ${document.documentElement.dataset.theme==='light'?'dark':'light'} theme</button><button id="share-plan">Share draft plan</button><button id="import-plan">Open draft plan</button><button id="export">Export snapshot</button></div><section class="panel"><h2>Reading preferences</h2><label><input id="large-text" type="checkbox" ${companionPrefs.large?'checked':''}> Large text</label><p>Phone text scaling and reduced motion settings are respected.</p><button data-new-match="true">New match</button><p>Keeps planning picks and preferences; resets inventory and live judgments.</p></section>`;}
function renderCompanion(){
 if(!B){if(companionMedia.matches){$('#main').innerHTML=latestStatus.errors?.length?`<h1>Data unavailable</h1><p>${esc(latestStatus.errors[0].detail)}</p><button id="retry-companion">Retry update</button><p>Choose another rank above to inspect available data.</p>`:`<h1>Loading hero data</h1><p role="status">Your selections are safe. Opening ${esc(S.bracket)}…</p><div class="loading-skeleton" aria-hidden="true"></div>`;return true;}return false;}
 if(S.route==='more'){$('#main').innerHTML=moreView();return true;}
 if(!companionMedia.matches)return false;
 if(S.route==='meta'){$('#main').innerHTML=guidedHome();return true;}
 if(S.route==='hero'){$('#main').innerHTML=mobileHero();return true;}
 if(S.route==='live'){$('#main').innerHTML=liveMobile();return true;}
 return false;
}
// Guard the same role controls on both layouts; invalid options explain the conflict.
function fullSlotRows(side,onlyRole=null,exceptRole=null){const picks=side==='allies'?S.locks:S.enemies;return `<div class="slots">${roleOrder.filter(r=>(!onlyRole||r===onlyRole)&&r!==exceptRole).map(r=>{const current=picks.find(p=>p.role===r);return `<div class="slot"><label>${labels[r]}<select data-slot="${side}" data-slot-role="${r}" aria-describedby="${side}-${r}-help"><option value="">Open slot</option>${Object.keys(E.heroes).sort((a,b)=>name(a).localeCompare(name(b))).map(s=>{const reason=disabledHero(s,side,r);return `<option value="${s}" ${current?.slug===s?'selected':''} ${reason?'disabled':''}>${esc(name(s))}${reason?' — '+esc(reason):''}</option>`;}).join('')}</select></label><small id="${side}-${r}-help">Picked, banned or unsupported-role choices are disabled.</small>${current?`<div class="slot-art">${art(current.slug,'tiny')}${esc(name(current.slug))}</div>`:''}</div>`;}).join('')}</div>`;}
slotRows=function(side){if(!companionMedia.matches)return fullSlotRows(side);const role=S.locks.find(p=>p.slug===S.me)?.role||S.role;return fullSlotRows(side,role)+`<details><summary>Add ${side==='allies'?'allies':'enemies'} · other roles</summary><div class="detail-content">${fullSlotRows(side,null,role)}</div></details>`;};
const originalChangeRoute=changeRoute,originalOpenHero=openHero;
const originalDetail=detail;let dialogReturn=null,dialogSituation=null;
detail=function(title,body){dialogReturn=document.activeElement;dialogSituation=dialogReturn?.dataset?.editSituation;originalDetail(title,body);};
$('#detail').addEventListener('close',()=>{if(dialogReturn?.isConnected)dialogReturn.focus();else if(dialogSituation)document.querySelector('[data-edit-situation]')?.focus();else $('#main').focus({preventScroll:true});});
changeRoute=function(route){originalChangeRoute(route);recordNavigation();};
openHero=function(slug,role){if(!E.heroes[slug]){companionError='That hero is unavailable. Choose another.';changeRoute('meta');return;}originalOpenHero(slug,role);companionPrefs.recent=[{slug,role:S.heroRole},...companionPrefs.recent.filter(p=>p.slug!==slug||p.role!==S.heroRole)].slice(0,5);saveCompanionPrefs();recordNavigation(true);};
function navigationState(){return {route:S.route,hero:S.hero,role:S.heroRole,tab:S.heroTab,bracket:S.bracket,wizard:copyValue(wizard)};}
function recordNavigation(replace=false){if(historyApplying||location.protocol==='file:')return;const n=navigationState();const url=new URL(location.href);if(n.route==='hero'&&n.hero)url.hash='hero='+encodeURIComponent(n.hero)+'&role='+n.role+'&bracket='+n.bracket+'&tab='+n.tab;else url.hash='view='+n.route;if(history.state?.companion&&JSON.stringify(history.state.companion)===JSON.stringify(n))return;history[replace?'replaceState':'pushState']({companion:n},'',url);linkApplied=url.hash;}
function applyCompanionLink(){
 const hash=location.hash;if(!hash||hash.startsWith('#plan=')||hash===linkApplied)return;linkApplied=hash;
 try{const q=new URLSearchParams(hash.slice(1));if(q.has('hero')){
   const allowed=['hero','role','bracket','tab'];if([...q.keys()].some(k=>!allowed.includes(k))||[...q.keys()].length!==new Set(q.keys()).size)throw Error('The hero link has unsupported fields.');
   const hero=q.get('hero'),role=q.get('role'),bracket=q.get('bracket'),tab=q.get('tab')||'builds';
   if(!E.heroes[hero])throw Error('The linked hero is unavailable. Choose a hero.');
   if(!roleOrder.includes(role)||!E.roles(hero).includes(role)){wizard={...wizard,hero,step:1};throw Error('Choose a supported role for the linked hero.');}
   if(!['bronze','silver','gold','platinum','diamond','paragon'].includes(bracket)||!['builds','pairings','counters','kit'].includes(tab))throw Error('The linked rank or section is invalid.');
   if(bracket!==S.bracket){linkApplied='';queueMicrotask(()=>{const select=$('#bracket');select.value=bracket;select.dispatchEvent(new Event('change',{bubbles:true}));});return;}
   S.hero=hero;S.heroRole=role;S.heroTab=tab;S.route='hero';wizard={...wizard,hero,role,step:3};
 }else if(q.has('view')){const r=q.get('view');if(![...navs.map(x=>x[0]),'more'].includes(r))throw Error('This section is unavailable.');S.route=r;}
 }catch(e){companionError=e.message;S.route='meta';wizard.step=wizard.hero?1:2;}
}
function undoSnapshot(){return copyValue({locks:S.locks,enemies:S.enemies,bans:S.bans,me:S.me,liveVariant:S.liveVariant,contexts:S.liveContexts,wizard});}
function showUndo(before,label){clearTimeout(undoTimer);undoAction=before;let el=$('#undo-banner');if(!el){el=document.createElement('div');el.id='undo-banner';el.setAttribute('role','status');document.body.append(el);el.addEventListener('focusin',()=>clearTimeout(undoTimer));el.addEventListener('mouseenter',()=>clearTimeout(undoTimer));el.addEventListener('mouseleave',expireUndo);el.addEventListener('focusout',expireUndo);}el.hidden=false;el.innerHTML=`<span>${esc(label)}</span><button id="undo-action">Undo</button>`;expireUndo();}
function expireUndo(){clearTimeout(undoTimer);undoTimer=setTimeout(()=>{if($('#undo-banner')?.contains(document.activeElement))return;undoAction=null;if($('#undo-banner'))$('#undo-banner').hidden=true;},8000);}
function installHelp(){companionPrefs.installSeen=true;saveCompanionPrefs();document.querySelector('.install-hint')?.remove();detail('Install on your phone','<p><strong>iPhone / iPad:</strong> open this website in Safari, tap Share, then Add to Home Screen.</p><p><strong>Android:</strong> open in Chrome, use its menu and choose Install app or Add to Home screen.</p><p>Open a rank online once to save it on this device. Offline views retain their original dates. Images may be unavailable offline.</p>');}
async function shareHero(){const url=new URL(APP_CONFIG.mode==='local'||location.protocol==='file:'?'https://gn45db4tjc-ship-it.github.io/predecessor-meta/':location.href);url.search='';url.hash='hero='+encodeURIComponent(S.hero)+'&role='+S.heroRole+'&bracket='+S.bracket+'&tab='+S.heroTab;try{if(navigator.share){await navigator.share({title:name(S.hero)+' build',url:url.href});return;}}catch(e){if(e.name==='AbortError')return;}try{await navigator.clipboard.writeText(url.href);toast('Hero link copied.');}catch{detail('Share hero',`<label>Copy this link<input readonly value="${esc(url.href)}"></label><p>Contains only hero, role, bracket and section.</p>`);}}
document.addEventListener('click',async event=>{
 const el=event.target.closest('button');if(!el)return;const d=el.dataset;
 if(d.ownedRemove!==undefined||['live-context-clear','clear-locks','clear-enemies'].includes(el.id)||d.unban){const before=undoSnapshot();setTimeout(()=>showUndo(before,'Selection cleared.'),0);}
 const handled=d.wizardRole||d.wizardNext||d.wizardHero||d.wizardShow||d.wizardSkip||d.liveLookup||d.startLive||d.newMatch||d.editSituation||['undo-action','companion-install','companion-theme','share-hero','live-context-clear','retry-companion'].includes(el.id);
 if(!handled)return;event.preventDefault();event.stopImmediatePropagation();
 try{
 if(el.id==='retry-companion'){$('#refresh').click();return;}
 if(d.editSituation){const [slug,role]=d.editSituation.split('|');const wrapper=document.createElement('div');wrapper.innerHTML=coachHTML({slug,role});detail('Change your situation',wrapper.querySelector('.coach-controls').outerHTML+'<p>Changes apply immediately. Close to return to your place.</p>');return;}
 if(el.id==='live-context-clear'){S.liveContexts[liveContextKey()]={owned:[],state:'even',priority:''};}
 else if(d.wizardRole){wizard.role=d.wizardRole;wizard.hero=null;wizard.query='';}
 else if(d.wizardNext){wizard.step=Number(d.wizardNext);companionError='';}
 else if(d.wizardHero){wizard.hero=d.wizardHero;wizard.enemy=null;}
 else if(d.wizardShow||d.wizardSkip){if(d.wizardSkip)wizard.enemy=null;S.role=wizard.role;openHero(wizard.hero,wizard.role);S.heroTab='builds';recordNavigation(true);}
 else if(d.liveLookup){wizard.step=1;S.route='meta';}
 else if(d.startLive){const reason=disabledHero(S.hero,'allies',S.heroRole);if(reason)throw Error(reason+'. Clear the conflicting pick or ban in Draft first.');const occupied=S.locks.find(p=>p.role===S.heroRole&&p.slug!==S.hero);if(occupied)throw Error('This role belongs to '+name(occupied.slug)+'. Clear it in Draft first.');setPick('allies',S.heroRole,S.hero);S.me=S.hero;if(wizard.hero===S.hero&&wizard.enemy&&!S.enemies.some(e=>e.role===S.heroRole)&&!disabledHero(wizard.enemy,'enemies',S.heroRole))setPick('enemies',S.heroRole,wizard.enemy);S.route='live';}
 else if(d.newMatch){const before=undoSnapshot();S.liveContexts={};S.liveVariant=null;wizard.enemy=null;showUndo(before,'New match: inventory and live judgments reset. Planning picks kept.');}
 else if(el.id==='undo-action'&&undoAction){const before=undoAction;S.locks=before.locks;S.enemies=before.enemies;S.bans=before.bans;S.me=before.me;S.liveVariant=before.liveVariant;S.liveContexts=before.contexts;wizard=before.wizard;undoAction=null;clearTimeout(undoTimer);$('#undo-banner').hidden=true;}
 else if(el.id==='companion-install'){installHelp();return;}
 else if(el.id==='companion-theme'){$('#theme-toggle').click();}
 else if(el.id==='share-hero'){await shareHero();return;}
 save();render();recordNavigation();$('#main').focus({preventScroll:true});
 }catch(e){companionError=e.message;toast(e.message);}
},true);
document.addEventListener('change',event=>{
 const el=event.target,d=el.dataset;
 if(d.slot&&el.value){const why=disabledHero(el.value,d.slot,d.slotRole);if(why){event.stopImmediatePropagation();toast(why+'. Clear the existing selection first.');render();return;}}
 if(d.slot&&!el.value){const before=undoSnapshot();setTimeout(()=>showUndo(before,'Pick removed.'),0);}
 if(d.coachField){event.stopImmediatePropagation();const [slug,role]=d.coachKey.split('|'),p={slug,role};if(!E.heroes[slug]||!E.roles(slug).includes(role))return;const val=d.coachField==='primaryThreat'?(el.value||null):el.value;S.liveContexts[d.coachKey]={...contextFor(p),[d.coachField]:val};const modal=$('#detail').open;save();render();if(!modal)document.querySelector(`[data-coach-key="${d.coachKey}"][data-coach-field="${d.coachField}"]`)?.focus();}
 else if(el.id==='wizard-enemy'){wizard.enemy=el.value||null;saveMatchSession();}
 else if(el.id==='mobile-hero-role'){S.heroRole=el.value;render();recordNavigation(true);$('#mobile-hero-role')?.focus();}
 else if(el.id==='large-text'){companionPrefs.large=el.checked;saveCompanionPrefs();companionChrome();}
 else if(el.id==='hero-role')setTimeout(()=>recordNavigation(true),0);
},true);
document.addEventListener('input',event=>{if(event.target.id==='wizard-search'){wizard.query=event.target.value;render();$('#wizard-search')?.focus();}});
document.addEventListener('click',event=>{if(event.target.closest('[data-hero-tab]')){recordNavigation(true);if(companionMedia.matches){const d=$('#main > details');if(d)d.open=true;}}});
window.addEventListener('popstate',event=>{historyApplying=true;if(event.state?.companion){const n=event.state.companion;S.route=n.route;S.hero=n.hero;S.heroRole=n.role;S.heroTab=n.tab;wizard=n.wizard||wizard;}linkApplied='';render();historyApplying=false;});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#plan=')){linkApplied='';render();}});
window.addEventListener('offline',()=>{render();});window.addEventListener('online',()=>{render();});
companionMedia.addEventListener('change',()=>render());
setTimeout(()=>{if(companionMedia.matches&&!companionPrefs.installSeen&&APP_CONFIG.mode==='static'&&!matchMedia('(display-mode:standalone)').matches){let el=document.createElement('aside');el.className='install-hint';el.innerHTML='<span>Add this companion to your home screen.</span><button id="companion-install">How to install</button><button aria-label="Dismiss installation hint">Dismiss</button>';el.lastElementChild.onclick=()=>{companionPrefs.installSeen=true;saveCompanionPrefs();el.remove();};$('#main').after(el);}},1200);
