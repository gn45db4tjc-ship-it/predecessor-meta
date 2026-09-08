// Isolated QA only; all mutations use actual page controls.
(()=>{
 const checks=[],assert=(v,t)=>{if(!v)throw Error(t);checks.push(t);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const select=(s,v)=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 if(document.querySelector('#detail').open)click('#close-detail');
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');click('[data-route="draft"]');while(document.querySelector('[data-unban]'))document.querySelector('[data-unban]').click();
 for(const [slug,r] of Object.entries(B.guidance.strategic_review.heroes)){
  const role=B.guidance.builds.find(p=>p.slug===slug).role;
  click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');click('[data-hero="'+slug+'"]');click('[data-hero-tab="counters"]');
  const panel=document.querySelector('.strategic-profile');assert(panel?.innerText.includes(r.counterplay)&&panel.innerText.includes(r.pick_when),'Reviewed counterplay '+slug);
  assert(panel.querySelector('a')?.href===r.source,'Exact kit source '+slug);
 }
 for(const p of B.guidance.strategic_review.build_adaptations){
  click('[data-route="meta"]');click('[data-meta-role="'+p.role+'"]');click('[data-hero="'+p.slug+'"]');click('[data-hero-tab="builds"]');
  const d=document.querySelector('.reviewed-adaptations');d.querySelector('summary').click();assert(d.innerText.includes(p.reason)&&d.querySelector('[data-catalog]'),'Conditional build decision '+p.slug+' '+p.item);
 }
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');
 select('[data-slot="allies"][data-slot-role="jungle"]','serath');select('#me-hero','serath');
 assert(document.querySelector('#main').textContent.includes('Weald'),'Live uses revised Serath Eternal');
 select('[data-slot="enemies"][data-slot-role="midlane"]','gideon');
 const enemy=[...document.querySelectorAll('#main summary')].find(s=>s.textContent==='Reviewed enemy counterplay');enemy.click();assert(enemy.parentElement.innerText.includes('Save an interrupt for Black Hole'),'Live exposes actual enemy counterplay');
 click('#clear-locks');click('#clear-enemies');
 for(let i=0;i<B.guidance.compositions.length;i++){
  click('[data-route="planner"]');click('#clear-locks');click('[data-route="guidance"]');
  const button=document.querySelector('[data-guided-comp="'+i+'"]');assert(button&&!button.disabled,'Reviewed composition available '+i);button.click();
  const selected=[...document.querySelectorAll('[data-slot="allies"]')].filter(s=>s.value).map(s=>s.value+'|'+s.dataset.slotRole).sort();
  const expected=B.guidance.compositions[i].picks.map(p=>p.slug+'|'+p.role).sort();assert(JSON.stringify(selected)===JSON.stringify(expected),'Composition locks correct roles '+i);
 }
 click('#clear-locks');select('[data-slot="allies"][data-slot-role="jungle"]','steel');click('[data-size="2"]');
 const templates=[...document.querySelectorAll('.guided-options .reviewed-composition')];assert(templates.length===1&&templates[0].innerText.includes('Direct catch'),'Templates respect Steel Jungle lock and duo size');
 click('[data-route="draft"]');select('[data-slot="enemies"][data-slot-role="jungle"]','serath');select('#candidate-role','carry');
 const response=document.querySelector('.reviewed-counter');assert(response?.innerText.includes('Drongo')&&response.innerText.includes('Silence is short'),'Draft exposes qualified role-specific response reasoning');
 response.querySelector('[data-pick]').click();assert(document.querySelector('[data-slot="allies"][data-slot-role="carry"]').value==='drongo','Response button locks correct role');
 click('[data-route="planner"]');assert(!document.querySelector('.guided-options [data-guided-comp]'),'No template silently drops the extra lock');
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');click('[data-route="guidance"]');
 assert(document.querySelectorAll('.reviewed-composition').length===12,'All authored compositions visible');
 assert(!document.querySelector('#main').innerText.includes('could not render'),'No render failure');
 assert(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
 return {passed:checks.length,checks,viewport:[innerWidth,innerHeight]};
})()
