// Isolated QA only; all mutations use actual page controls.
(()=>{
 const checks=[],assert=(v,t)=>{if(!v)throw Error(t);checks.push(t);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const select=(s,v)=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 if(document.querySelector('#detail').open)click('#close-detail');
 // The tactical review, its build decisions and its compositions are dated strategy guidance (see evidenceState).
 const strategyCurrent=E.evidenceState().guidance.state==='reviewed'&&B.guidance.strategic_review.patch===B.official?.live?.version,skipped=[];
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');click('[data-route="draft"]');while(document.querySelector('[data-unban]'))document.querySelector('[data-unban]').click();
 for(const [slug,r] of Object.entries(B.guidance.strategic_review.heroes)){
  const role=B.guidance.builds.find(p=>p.slug===slug).role;
  click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');click('[data-hero="'+slug+'"]');click('[data-hero-tab="counters"]');
  // After a patch the dated tactical review stays inspectable only as a labelled fallback until it is reviewed again.
  const panel=document.querySelector('.strategic-profile'),fallback=[...(panel?.querySelectorAll('summary')||[])].find(s=>s.textContent.startsWith('Previous tactical guidance fallback'));
  // A reviewed patch note for the hero (hero_context) supersedes the dated counterplay while it is active.
  const state=E.heroStrategy(slug);
  if(state.patchAddition||state.status==='Reviewed patch implications; no outcome claim'){assert(!fallback&&panel?.innerText.includes(state.summary),'Reviewed patch implications '+slug);continue;}
  if(state.active)assert(!fallback&&panel?.innerText.includes(r.counterplay)&&panel.innerText.includes(r.pick_when),'Reviewed counterplay '+slug);
  else{assert(fallback?.textContent.includes('v'+B.guidance.strategic_review.patch)&&/needs review/i.test(panel.innerText)&&!panel.innerText.includes(r.counterplay),'Counterplay labelled as a dated fallback '+slug);
   fallback.click();assert(panel.innerText.includes(r.counterplay)&&panel.innerText.includes(r.pick_when),'Fallback counterplay inspectable '+slug);}
  assert(panel.querySelector('a')?.href===r.source,'Exact kit source '+slug);
 }
 for(const p of B.guidance.strategic_review.build_adaptations){
  click('[data-route="meta"]');click('[data-meta-role="'+p.role+'"]');click('[data-hero="'+p.slug+'"]');click('[data-hero-tab="builds"]');
  const d=document.querySelector('.reviewed-adaptations');
  // No block when nothing applies, or when no build can be shown ("Build recommendation unavailable") to adapt.
  if(!E.buildAdaptations(p.slug,p.role).length||!E.plannedBuild(p.slug,p.role).items.length){assert(!d,'No build-decision block without a build to adapt '+p.slug+' '+p.item);continue;}
  d.querySelector('summary').click();
  // Each decision has its own trigger (item effects, replaced slot, tactical note); follow that decision, and never
  // allow one to be active without a current strategy review and an active plan.
  const decision=E.buildAdaptations(p.slug,p.role).find(x=>x.item===p.item&&x.reason===p.reason);
  assert(!decision?.active||(strategyCurrent&&E.buildReview(p.slug,p.role)?.active),'Active decision needs current strategy and plan '+p.slug+' '+p.item);
  if(decision?.active)assert(d.innerText.includes(p.reason)&&d.querySelector('[data-catalog]'),'Conditional build decision '+p.slug+' '+p.item);
  else assert(d.innerText.includes('the earlier adaptation needs review')&&!d.innerText.includes(p.reason),'Unreviewed build decision withheld '+p.slug+' '+p.item);
 }
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');
 select('[data-slot="allies"][data-slot-role="jungle"]','serath');select('#me-hero','serath');
 if(E.buildReview('serath','jungle')?.active)assert(document.querySelector('#main').textContent.includes(E.plannedBuild('serath','jungle').eternal),'Live uses the reviewed Serath Eternal');
 else assert(document.querySelector('#main').innerText.includes('The reviewed build is needs review'),'Live withholds the unreviewed Serath plan');
 select('[data-slot="enemies"][data-slot-role="midlane"]','gideon');
 const enemy=[...document.querySelectorAll('#main summary')].find(s=>s.textContent==='Reviewed enemy counterplay');enemy.click();
 const gideon=E.heroStrategy('gideon'),box=enemy.parentElement,dated=[...box.querySelectorAll('summary')].find(s=>s.textContent.startsWith('Previous tactical guidance fallback'));
 if(gideon.status==='Reviewed patch implications; no outcome claim')assert(box.innerText.includes(gideon.summary),'Live exposes reviewed enemy patch implications');
 else{if(!gideon.active){assert(dated,'Live labels dated enemy counterplay');dated.click();}assert(box.innerText.includes('Save an interrupt for Black Hole'),'Live exposes actual enemy counterplay');}
 click('#clear-locks');click('#clear-enemies');
 for(let i=0;i<B.guidance.compositions.length;i++){
  click('[data-route="planner"]');click('#clear-locks');click('[data-route="guidance"]');
  // A composition is offered only while the strategy review and every pick's tactical and build reviews are active.
  const button=document.querySelector('[data-guided-comp="'+i+'"]');
  if(!E.reviewedComposition(i).active){assert(button&&button.disabled,'Unreviewed composition not offered '+i);continue;}
  assert(button&&!button.disabled,'Reviewed composition available '+i);button.click();
  const selected=[...document.querySelectorAll('[data-slot="allies"]')].filter(s=>s.value).map(s=>s.value+'|'+s.dataset.slotRole).sort();
  const expected=B.guidance.compositions[i].picks.map(p=>p.slug+'|'+p.role).sort();assert(JSON.stringify(selected)===JSON.stringify(expected),'Composition locks correct roles '+i);
 }
 click('[data-route="planner"]');click('#clear-locks');select('[data-slot="allies"][data-slot-role="jungle"]','steel');click('[data-size="2"]');
 const templates=[...document.querySelectorAll('.guided-options .reviewed-composition')],guided=E.guidedCompositions([{slug:'steel',role:'jungle'}],{size:2});
 assert(templates.length===guided.length,'Templates follow the active reviewed compositions ('+guided.length+')');
 if(guided.some(c=>c.title==='Direct catch'||JSON.stringify(c).includes('Direct catch')))assert(templates.length===1&&templates[0].innerText.includes('Direct catch'),'Templates respect Steel Jungle lock and duo size');
 else skipped.push('Steel duo "Direct catch" template: not active for this publication');
 click('[data-route="draft"]');select('[data-slot="enemies"][data-slot-role="jungle"]','serath');select('#candidate-role','carry');
 const response=document.querySelector('.reviewed-counter'),drongo=E.counterIdeas('serath','jungle',{role:'carry'}).find(r=>r.slug==='drongo');
 assert(response?.innerText.includes('Drongo'),'Draft shows the role-specific response');
 if(drongo?.active)assert(response.innerText.includes('Silence is short'),'Draft exposes qualified role-specific response reasoning');
 else assert(response.innerText.includes('the earlier response is withheld')&&!response.innerText.includes('Silence is short'),'Draft withholds unreviewed response reasoning');
 if(drongo?.active){response.querySelector('[data-pick]').click();assert(document.querySelector('[data-slot="allies"][data-slot-role="carry"]').value==='drongo','Response button locks correct role');}
 else{assert(!response.querySelector('[data-pick]'),'A withheld response offers no lock button');select('[data-slot="allies"][data-slot-role="carry"]','drongo');}
 click('[data-route="planner"]');assert(!document.querySelector('.guided-options [data-guided-comp]'),'No template silently drops the extra lock');
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');click('[data-route="guidance"]');
 assert(document.querySelectorAll('.reviewed-composition').length===12,'All authored compositions visible');
 assert(!document.querySelector('#main').innerText.includes('could not render'),'No render failure');
 assert(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
 return {passed:checks.length,checks,skipped,viewport:[innerWidth,innerHeight]};
})()
