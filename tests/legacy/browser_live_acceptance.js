// Isolated QA app only. Changes test picks and inventory through the actual controls.
(async()=>{
 const results=[],assert=(v,s)=>{if(!v)throw Error(s);results.push(s);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const select=(s,v)=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 const text=()=>document.querySelector('#main').innerText;
 click('[data-route="live"]');click('#clear-locks');click('#clear-enemies');
 select('[data-slot="allies"][data-slot-role="jungle"]','steel');select('#me-hero','steel');
 select('[data-slot="enemies"][data-slot-role="support"]','narbash');select('#live-priority','anti_heal');
 select('#live-owned-add','Fire Blossom');
 assert(document.querySelector('[data-owned-remove="0"]').innerText.includes('Fire Blossom'),'Entered item is visible');
 assert(text().includes('Next completed purchase: Tainted Charm'),'Early anti-heal is the next completed purchase');
 for(const label of ['Enemy profile & item needs','Anti-heal']){const summary=[...document.querySelectorAll('#main summary')].find(e=>e.innerText.startsWith(label));assert(summary,'Item explanation control '+label);summary.click();}
 assert(text().includes('Reactive only'),'Reactive condition is displayed');
 select('#live-owned-add','Dynamo');assert(document.activeElement.id==='live-owned-add','Keyboard focus restored after inventory change');click('[data-owned-remove="1"]');
 const path=()=>[...document.querySelectorAll('.build-path')].at(-1);
 assert(path().children.length===6,'Six final slots');
 assert(path().children[0].innerText.includes('Owned'),'Owned opening item stays locked');
 select('[data-slot="allies"][data-slot-role="carry"]','murdock');select('#me-hero','murdock');
 assert(document.querySelectorAll('[data-owned-remove]').length===0,'Other hero has separate inventory');
 assert(document.querySelector('#live-priority').value==='','Other hero has separate priority');
 select('#me-hero','steel');assert(document.querySelector('#live-priority').value==='anti_heal','Returning restores hero priority');
 select('[data-slot="allies"][data-slot-role="jungle"]','');select('[data-slot="allies"][data-slot-role="offlane"]','steel');select('#me-hero','steel');
 assert(document.querySelectorAll('[data-owned-remove]').length===0,'Same hero in another role has separate inventory');
 assert(text().includes('Trade, clear, then convert a catch'),'Steel Offlane review displayed');
 [...document.querySelectorAll('#main summary')].find(e=>e.innerText==='Full setup, execution and sources').click();
 assert(text().includes('Cannibalism'),'Offlane blessing shown');
 select('[data-slot="allies"][data-slot-role="offlane"]','');select('[data-slot="allies"][data-slot-role="jungle"]','steel');select('#me-hero','steel');
 assert(document.querySelector('#live-priority').value==='anti_heal','Jungle context survives role switch');
 for(const n of ['Dynamo','Flux Matrix','Tainted Guard',"Giant's Ring",'Stonewall'])select('#live-owned-add',n);
 assert(document.querySelector('#live-owned-add').disabled,'Six owned items disable additional entry');
 assert(text().includes('No additional purchase or automatic sale'),'No seventh item or automatic sale');
 click('[data-owned-remove="5"]');assert(!document.querySelector('#live-owned-add').disabled,'Remove restores item entry');
 click('#live-context-clear');assert(!document.querySelectorAll('[data-owned-remove]').length,'Clear game context');
 assert(document.activeElement.id==='live-priority','Clear restores keyboard focus');
 select('#live-owned-add','Fire Blossom');select('#live-priority','anti_heal');
 // Exercise the actual save queue, then confirm the local server accepted this QA state.
 await new Promise(r=>setTimeout(r,600));
 assert(!document.querySelector('#toast').textContent.includes('Could not save planner'),'Rapid controls produce no save failure');
 if(APP_CONFIG.mode==='shared'){const saved=JSON.parse(localStorage.getItem('predecessor-planner-v2'));assert(saved.liveContexts['steel|jungle']?.owned.includes('Fire Blossom'),'Inventory is saved in this browser');}else{const page=await(await fetch('/')).text();assert(page.includes('steel|jungle')&&page.includes('liveContexts'),'Saved inventory included in reload state');}
 assert(!text().includes('could not render'),'No app rendering failure');
 assert(document.documentElement.scrollWidth<=innerWidth+2,'No page overflow');
 document.querySelector('[aria-label="Current game purchases"]').scrollIntoView();
 return {passed:results.length,checks:results,viewport:[innerWidth,innerHeight]};
})()
