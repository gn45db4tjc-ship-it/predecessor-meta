/* Durable presentation choices. Indices are never stored as build identities. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CompanionState=api;})(globalThis,function(){
 'use strict';
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const nk=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function recipe(plan){return {items:plan.items,augment:plan.augment,eternal:plan.eternal,blessings:plan.blessings,crest:plan.crest,skill_priority:plan.skill_priority};}
 function mechanics(bundle,plan){
  const wanted=new Set([...plan.items,plan.crest,plan.augment,plan.eternal,...plan.blessings].map(nk));
  const catalog={};
  for(const group of ['items','perks'])for(const [key,it] of Object.entries(bundle[group]||{}))if(wanted.has(nk(it.name||it.display_name||key)))catalog[group+':'+key]={name:it.name||it.display_name,stats:it.stats,effects:it.effects,description:it.description,text:it.text,slot:it.slot,eternal:it.eternal,available:it.available_current_patch};
  return canonical({abilities:(bundle.heroes?.[plan.slug]?.abilities||[]).map(a=>({key:a.key,text:a.text,game_text:a.game_text})),catalog});
 }
 function reference(bundle,engine,slug,role,index){
  const rows=bundle.heroes?.[slug]?.roles?.[role]?.builds||[];
  if(!Number.isInteger(index)||index<0||!rows[index])throw Error('That source playstyle is no longer available.');
  const plan=engine.plannedBuild(slug,role,{index,forceObserved:true});
  if(!plan.items.length)throw Error('That playstyle has no valid completed items.');
  return {v:1,slug,role,bracket:bundle.bracket?.segment,patch:bundle.patch,livePatch:bundle.official?.live?.version,publication:bundle.generated_at,recipe:canonical(recipe(plan)),mechanics:mechanics(bundle,plan)};
 }
 function resolve(bundle,engine,ref,slug,role){
  if(!ref)return {status:'default',index:null};
  const invalid=reason=>({status:'invalid',index:null,reason});
  if(ref.v!==1||ref.slug!==slug||ref.role!==role)return invalid('The saved playstyle has no valid hero and role identity. Choose it again.');
  if(ref.bracket!==bundle.bracket?.segment)return invalid('This playstyle was chosen in another rank. Choose a playstyle for this rank; its samples remain separate.');
  if(ref.patch!==bundle.patch||ref.livePatch!==bundle.official?.live?.version)return invalid('The patch changed after this playstyle was chosen. Inspect the new evidence and choose again.');
  const rows=bundle.heroes?.[slug]?.roles?.[role]?.builds||[];
  const matches=rows.flatMap((_,index)=>{const plan=engine.plannedBuild(slug,role,{index,forceObserved:true});return canonical(recipe(plan))===ref.recipe?[{index,plan}]:[];});
  if(matches.length!==1)return invalid(matches.length?'The saved playstyle is ambiguous in this publication. Choose it again.':'The selected build or loadout changed or disappeared. Choose again; no different build was substituted.');
  const match=matches[0];
  if(mechanics(bundle,match.plan)!==ref.mechanics)return invalid('Supporting ability or item mechanics changed. Inspect this playstyle before choosing it again.');
  return {status:'selected',index:match.index,plan:match.plan,revalidated:ref.publication!==bundle.generated_at};
 }
 function blocked(slug,role,{allies=[],enemies=[],bans=[]},engine){return bans.includes(slug)?'Banned':enemies.some(p=>p.slug===slug)?'Enemy pick':allies.some(p=>p.slug===slug||p.role===role)?'Ally or role already locked':!engine.roles(slug).includes(role)?'Role unavailable':'';}
 return {reference,resolve,blocked};
});
