// Isolated QA instance only; verify rendered default-augment context and real dialogs.
(async()=>{
 const checks=[],assert=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const select=(s,v)=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 const summary=s=>[...document.querySelectorAll('#main summary')].find(e=>e.textContent.startsWith(s));
 if(document.querySelector('#detail').open)click('#close-detail');let count=0;
 for(const role of ['jungle','support','carry','midlane','offlane']){
  click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');
  const heroes=[...new Set([...document.querySelectorAll('#main [data-hero]')].map(e=>e.dataset.hero))];
  for(const slug of heroes){
   click('[data-hero="'+slug+'"]');click('[data-hero-tab="pairings"]');
   const pair=document.querySelector('[data-pair]');assert(pair?.dataset.pair.split('|')[2]===role,'Pair keeps '+slug+' '+role);pair.click();
   const text=document.querySelector('#detail-body').innerText;assert(text.includes('Reviewed default augments & execution')&&!text.includes('Needs review'),'Active default review '+slug+' '+role);
   assert(document.querySelector('#detail-body [data-catalog]'),'Augment definition link '+slug+' '+role);click('#close-detail');count++;
   click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');
  }
 }
 assert(count===85,'All 85 selected role loadouts inspected');
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');select('[data-slot="allies"][data-slot-role="carry"]','legion');select('#me-hero','legion');
 const s=summary('Selected augment mechanics');assert(s,'Live selected-augment disclosure');s.focus();s.click();assert(s.parentElement.innerText.includes('removes Rally Point’s healing'),'Removed healing is explained');
 const perk=s.parentElement.querySelector('[data-catalog]');perk.focus();perk.click();assert(document.querySelector('#detail-body').innerText.includes('no longer grants Health Regeneration'),'Original Legion augment inspectable');click('#close-detail');assert(document.activeElement===perk,'Augment close restores focus');
 click('[data-route="planner"]');click('#clear-locks');click('[data-size="5"]');select('[data-slot="allies"][data-slot-role="support"]','adele');select('[data-slot="allies"][data-slot-role="midlane"]','argus');select('[data-slot="allies"][data-slot-role="carry"]','legion');
 summary('Why these coverage checks apply').click();const panel=document.querySelector('.loadout-evidence');assert(panel.innerText.includes('nearest ally')&&panel.innerText.includes('infinite range')&&panel.innerText.includes('removes Rally Point'),'Three distinct default effects shown');
 click('#generate');await new Promise(r=>setTimeout(r,800));assert(document.querySelectorAll('.comp-card').length>0,'Alternatives generate with augmented kits');
 const card=document.querySelector('.comp-card'),plan=[...card.querySelectorAll('summary')].find(e=>e.textContent.startsWith('Fight plan & risks'));plan.click();assert(plan.parentElement.querySelectorAll('.loadout-evidence [data-catalog]').length===5,'Five loadout assumptions inspectable');
 assert(document.documentElement.scrollWidth<=innerWidth+2,'No horizontal page overflow');assert(!document.body.innerText.includes('could not render'),'No rendering failure');assert(!document.body.innerText.includes('Planner save failed'),'No planner-save failure');
 return {passed:checks.length,checks,viewport:[innerWidth,innerHeight]};
})()
