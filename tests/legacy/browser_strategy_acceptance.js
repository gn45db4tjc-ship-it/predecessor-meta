// Isolated QA only: changes picks and opens details using real DOM controls.
(async()=>{
 const results=[],assert=(v,s)=>{if(!v)throw Error(s);results.push(s);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const select=(s,v)=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 if(document.querySelector('#detail').open)click('#close-detail');
 click('[data-route="meta"]');click('[data-meta-role="support"]');click('[data-hero="dekker"]');click('[data-hero-tab="builds"]');
 const why=[...document.querySelectorAll('#main summary')].find(e=>e.innerText.startsWith('Why these six items'));assert(why,'Reviewed item-reasons control');why.focus();why.click();
 const body=why.parentElement;assert(body.querySelectorAll('[data-support-ability]').length>=6,'Item reasons link to actual abilities');
 assert(body.innerText.includes('Dynamo')&&body.innerText.includes('Timewarp'),'Reviewed sequence explained');
 const link=body.querySelector('[data-support-ability]');link.focus();link.click();assert(document.querySelector('#detail').open,'Ability evidence opens by click');assert(document.querySelector('#detail-body').innerText.length>100,'Ability description is readable');click('#close-detail');
 assert(document.activeElement===link,'Modal close restores evidence-link focus');
 const full=[...document.querySelectorAll('#main summary')].find(e=>e.innerText==='Full setup, execution and sources');assert(full,'Full setup remains available');full.click();
 assert(document.querySelector('#main').innerText.includes('Blessings'),'Blessing setup still present');
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');
 select('[data-slot="allies"][data-slot-role="midlane"]','gideon');select('#me-hero','gideon');select('[data-slot="enemies"][data-slot-role="jungle"]','ikra');
 const profile=[...document.querySelectorAll('#main summary')].find(e=>e.innerText.startsWith('Enemy profile & item needs'));profile.click();
 assert(document.querySelector('#main').innerText.includes('Possible sustain depends'),'Conditional Eternal sustain disclosed');
 assert(![...document.querySelectorAll('#main summary')].some(e=>e.innerText.startsWith('Anti-heal')),'No automatic anti-heal for an unknown Eternal');
 select('[data-slot="enemies"][data-slot-role="support"]','narbash');
 [...document.querySelectorAll('#main summary')].find(e=>e.innerText.startsWith('Enemy profile & item needs')).click();
 assert([...document.querySelectorAll('#main summary')].some(e=>e.innerText.startsWith('Anti-heal')),'Actual ally healer creates an anti-heal need');
 select('#live-priority','anti_heal');assert(document.querySelector('#live-priority').value==='anti_heal','Actual-game priority remains usable');
 click('[data-route="builds"]');
 assert(!document.querySelector('#main').innerText.includes('could not render'),'No rendering failure');assert(document.documentElement.scrollWidth<=innerWidth+2,'No horizontal page overflow');
 return {passed:results.length,checks:results,viewport:[innerWidth,innerHeight]};
})()
