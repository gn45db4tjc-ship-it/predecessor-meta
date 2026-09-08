(()=>{
 const checks=[],assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();};
 const close=()=>{if(document.querySelector('#detail').open)click('#close-detail');};
 close();
 for(const r of B.guidance.sequence_review.abilities){
  const role=B.guidance.builds.find(p=>p.slug===r.slug).role;
  click('[data-route="meta"]');click('[data-meta-role="'+role+'"]');click('[data-hero="'+r.slug+'"]');click('[data-hero-tab="kit"]');
  const article=[...document.querySelectorAll('#main article')].find(a=>a.querySelector('.eyebrow')?.textContent===r.key);
  const disclosure=article?.querySelector('.sequence-evidence');
  if(!disclosure)throw Error('Timing panel unavailable '+r.slug+' '+r.key);
  disclosure.querySelector('summary').click();
  assert(disclosure.innerText.includes(r.note)&&disclosure.querySelector('a')?.href===r.source,'Timing and source '+r.slug+' '+r.key);
 }
 click('[data-route="meta"]');click('[data-meta-role="jungle"]');click('[data-hero="steel"]');click('[data-hero-tab="pairings"]');
 click('[data-pair="steel|gideon|jungle|midlane"]');
 let text=document.querySelector('#detail-body').innerText;
 assert(text.includes('4 counted points'),'Steel/Gideon counted catch');
 assert(text.includes('1.5s stun')&&text.includes('2.75s'),'Actual setup and channel timing visible');
 assert(text.includes('not a win probability')&&!text.includes('/ 10'),'Calculated points have an explicit separate meaning');
 const ability=document.querySelector('#detail [data-support-ability="steel|R"]');ability.focus();ability.click();
 assert(document.querySelector('#detail-title').innerText.includes('Shield Slam'),'Named evidence button opens actual ability');
 close();
 click('[data-pair="steel|murdock|jungle|carry"]');text=document.querySelector('#detail-body').innerText;
 assert(text.includes('Alternative · not added'),'Shared-action alternative stays inspectable');
 assert(text.includes('Directional source observations')||text.includes('No eligible observed pair sample'),'Observed evidence remains separate');
 close();
 const leading=document.querySelector('.partner');assert(leading.innerText.includes('kit interaction points')||leading.innerText.includes('Calculated kit fit'),'Hero cards expose the sorting evidence');
 assert(document.documentElement.scrollWidth<=innerWidth,'Pairing page has no horizontal overflow');
 click('[data-pair="steel|gideon|jungle|midlane"]');
 return {passed:checks.length,checks,viewport:[innerWidth,innerHeight]};
})()
