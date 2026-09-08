// Run with agent-browser eval against an isolated app profile. Exercises DOM controls.
(async()=>{
 const results=[],assert=(v,s)=>{if(!v)throw Error(s);results.push(s);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing control '+s);e.click();};
 const close=()=>{if(document.querySelector('#detail').open)click('#close-detail');};
 close();click('[data-route="meta"]');
 let total=0;
 for(const role of ['jungle','offlane','midlane','carry','support']){
  click('[data-meta-role="'+role+'"]');
  const rows=[...document.querySelectorAll('[data-meta-decision]')];total+=rows.length;
  assert(rows.length>0,'Reviewed '+role+' table');
  for(const e of rows){e.click();assert(document.querySelector('#detail-body').innerText.includes('Observed evidence stays separate'),'Tier details '+e.dataset.metaDecision);close();}
 }
 assert(total===85,'85 distinct role reviews rendered');
 click('[data-meta-role="jungle"]');click('[data-meta-decision="steel|jungle"]');
 assert(document.querySelector('#detail-body').innerText.includes(B.guidance.meta_review.entries.find(r=>r.slug==='steel'&&r.role==='jungle').evidence.matches.toLocaleString()+' games'),'Dated Steel reference sample');
 click('#detail [data-hero="steel"]');assert(!document.querySelector('#detail').open,'Tier to hero closes modal');
 assert(document.querySelector('h1').textContent==='Steel','Tier to partners opens correct hero');
 click('[data-meta-decision="steel|jungle"]');click('#detail [data-support-ability]');
 assert(document.querySelector('#detail-body').innerText.includes('Officially reviewed fields'),'Ability opens official field provenance');close();
 click('[data-route="meta"]');click('[data-meta-role="jungle"]');click('[data-hero="countess"]');click('[data-hero-tab="kit"]');
 const feast=[...document.querySelectorAll('article')].find(a=>a.querySelector('h3')?.textContent==='Feast');
 assert(feast?.innerText.includes('135/215/285'),'Feast displays official damage');
 assert(feast.innerText.includes('125 / 105 / 85s'),'Feast retains actual cooldown');
 assert(!feast.innerText.includes('deals 125/105/85'),'Malformed raw Feast damage stays collapsed');
 for(const route of [...document.querySelectorAll('#navigation [data-route]')].map(e=>e.dataset.route)){
  click('[data-route="'+route+'"]');
  assert(document.querySelector('#main h1')&&document.querySelector('#main').innerText.length>100,'Route '+route);
  assert(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow '+route);
 }
 click('[data-route="meta"]');click('[data-meta-role="jungle"]');
 return {checks:results.length,results,viewport:[innerWidth,innerHeight]};
})()
