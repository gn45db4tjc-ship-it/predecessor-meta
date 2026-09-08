(()=>{
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing control '+s);e.click();};
 if(document.querySelector('#detail').open)click('#close-detail');
 click('[data-route="meta"]');click('[data-meta-role="support"]');click('[data-hero="muriel"]');
 assert(document.querySelector('h1').textContent==='Muriel','Muriel hero opens');
 click('[data-hero-tab="kit"]');
 const card=name=>[...document.querySelectorAll('#main article')].find(e=>e.querySelector('h3')?.textContent===name);
 const serenity=card('Serenity'),sentinel=card('Sentinel');
 assert(serenity.innerText.includes('charges Serenity for 1.1s'),'Visible charge is 1.1 seconds');
 assert(!serenity.innerText.includes('charges Serenity for 1.4s'),'Wrong charge absent');
 assert(serenity.innerText.includes('Projectile radius: 85'),'Actual projectile radius shown');
 assert(serenity.innerText.includes('Projectile speed: 3900'),'Actual projectile speed shown');
 assert(sentinel.innerText.includes('25/35/45% at Muriel levels 1/7/13'),'Readable Sentinel tiers');
 assert(sentinel.innerText.includes("affected ally's level 1"),'Sentinel recipient specified');
 assert(sentinel.innerText.includes('20.5% at level 18'),'Sentinel maximum explained');
 assert(!sentinel.innerText.includes('25/25/25'),'Malformed raw progression stays collapsed');
 assert(document.documentElement.scrollWidth<=innerWidth,'Kit has no horizontal overflow');
 assert([...document.querySelectorAll('#main article .pre')].every(e=>e.scrollWidth<=e.clientWidth+1),'Long numeric progressions wrap inside their cards');
 assert(document.querySelector('.sidebar-foot').textContent.includes('v'+(APP_CONFIG.tool_version||B.tool_version)),'Visible app version is current');
 click('[data-hero-tab="builds"]');
 assert(document.querySelector('#main').innerText.includes('Reviewed'),'Reviewed Muriel build preserved');
 click('[data-hero-tab="kit"]');card('Serenity').scrollIntoView({block:'center'});
 return {passed:checks.length,checks,viewport:[innerWidth,innerHeight]};
})()
