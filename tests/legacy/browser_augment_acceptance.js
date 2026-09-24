// Isolated QA instance only; verify rendered default-augment context and real dialogs.
(async()=>{
 const checks=[],skipped=[],assert=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const select=(s,v)=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 const summary=s=>[...document.querySelectorAll('#main summary')].find(e=>e.textContent.startsWith(s));
 if(document.querySelector('#detail').open)click('#close-detail');let count=0;
 // A default augment is marked reviewed only while its role plan is patch-reviewed and the capability review matches
 // the verified live patch. Otherwise the same context must stay visible and be labelled Needs review.
 // A plan whose augment has no capability review (for example one changed by a later build review) shows no such context.
 const reviewed=(slug,role)=>{const plan=E.buildReview(slug,role);return (B.guidance.capability_reviews||[]).filter(r=>r.slug===slug&&r.augment===plan?.augment).map(r=>!!plan.active&&B.official?.status==='verified'&&r.patch===B.official.live?.version);};
 for(const role of ['jungle','support','carry','midlane','offlane']){
  click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');
  // Planning eligibility exceeds a statistical table's coverage. Inspect every authored role.
  const heroes=[...new Set(B.guidance.builds.filter(p=>p.role===role).map(p=>p.slug))];
  for(const slug of heroes){
   openHero(slug,role);click('[data-hero-tab="pairings"]');
   const pair=document.querySelector('[data-pair]');assert(pair?.dataset.pair.split('|')[2]===role,'Pair keeps '+slug+' '+role);pair.click();
   const text=document.querySelector('#detail-body').innerText,[a,b,ra,rb]=pair.dataset.pair.split('|'),rules=[...reviewed(a,ra),...reviewed(b,rb)];
   if(rules.length){const current=rules.every(Boolean);assert(text.includes('Reviewed default augments & execution')&&text.includes('Needs review')!==current,(current?'Active':'Needs-review')+' default review '+slug+' '+role);
    assert(document.querySelector('#detail-body .loadout-evidence [data-catalog]'),'Augment definition link '+slug+' '+role);}
   else assert(!text.includes('Reviewed default augments & execution'),'No unreviewed augment context '+slug+' '+role);click('#close-detail');count++;
   click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');
  }
 }
 assert(count===B.guidance.builds.length&&count>=93,'Every authored role loadout inspected');
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');select('[data-slot="allies"][data-slot-role="carry"]','legion');select('#me-hero','legion');
 // The Legion, Adele and Argus wording below belongs to their 1.16.4 augment reviews. It applies only while those
 // plans keep the reviewed augment and the reviews are current; otherwise the disclosure must follow the data.
 const legion=reviewed('legion','carry'),s=summary('Selected augment mechanics');
 assert(!!s===(legion.length>0&&!!E.buildReview('legion','carry')?.active),'Live selected-augment disclosure follows the reviewed plan');
 if(s&&E.buildReview('legion','carry').augment==='Press the Advantage'&&legion.every(Boolean)){s.focus();s.click();assert(s.parentElement.innerText.includes('removes Rally Point’s healing'),'Removed healing is explained');
  const perk=s.parentElement.querySelector('[data-catalog]');perk.focus();perk.click();assert(document.querySelector('#detail-body').innerText.includes('no longer grants Health Regeneration'),'Original Legion augment inspectable');click('#close-detail');assert(document.activeElement===perk,'Augment close restores focus');}
 else skipped.push('Legion Press the Advantage wording: plan '+(E.buildReview('legion','carry')?.augment||'none')+(legion.length&&!legion.every(Boolean)?', review not current':''));
 click('[data-route="planner"]');click('#clear-locks');click('[data-size="5"]');select('[data-slot="allies"][data-slot-role="support"]','adele');select('[data-slot="allies"][data-slot-role="midlane"]','argus');select('[data-slot="allies"][data-slot-role="carry"]','legion');
 const lineup=[['adele','support'],['argus','midlane'],['legion','carry']].map(([h,r])=>reviewed(h,r));
 summary('Why these coverage checks apply').click();const panel=document.querySelector('.loadout-evidence');assert(!!panel===lineup.some(r=>r.length),'Default-effect panel follows the reviewed plans');
 if(lineup.every(r=>r.length&&r.every(Boolean))&&E.buildReview('legion','carry').augment==='Press the Advantage')assert(panel.innerText.includes('nearest ally')&&panel.innerText.includes('infinite range')&&panel.innerText.includes('removes Rally Point'),'Three distinct default effects shown');
 else skipped.push('Adele, Argus and Legion 1.16.4 effect wording: a plan changed augment or its review is not current');
 // With no eligible statistics source, sampled fills are withheld; use the real control that allows kit-only fills.
 if(E.evidenceState().statistics.state==='unavailable'&&!document.querySelector('#include-unsampled').checked)click('#include-unsampled');
 click('#generate');
 // Since 2.25 the search runs in a worker; wait for it to finish instead of assuming a fixed 800ms.
 for(let i=0;i<300&&(document.querySelector('#generate')?.disabled||!document.querySelector('.comp-card'));i++)await new Promise(r=>setTimeout(r,100));
 assert(document.querySelectorAll('.comp-card').length>0,'Alternatives generate with augmented kits');
 const card=document.querySelector('.comp-card'),plan=[...card.querySelectorAll('summary')].find(e=>e.textContent.startsWith('Fight plan & risks'));plan.click();
 const assumed=compositions.alternatives[0].picks.reduce((n,p)=>n+reviewed(p.slug,p.role).length,0);
 assert(plan.parentElement.querySelectorAll('.loadout-evidence [data-catalog]').length===assumed,assumed+' loadout assumptions inspectable');
 assert(document.documentElement.scrollWidth<=innerWidth+2,'No horizontal page overflow');assert(!document.body.innerText.includes('could not render'),'No rendering failure');assert(!document.body.innerText.includes('Planner save failed'),'No planner-save failure');
 return {passed:checks.length,checks,skipped,viewport:[innerWidth,innerHeight]};
})()
