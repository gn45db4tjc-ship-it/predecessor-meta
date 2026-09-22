/* Skill-point presentation. A calculated allocation is never a reviewed order. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SkillGuide=api;})(globalThis,function(){
 'use strict';
 const KEYS={Primary:'Q',Secondary:'E',Alternate:'RMB',Ultimate:'R'};
 const BASIC=['Primary','Secondary','Alternate'];
 // Baseline allocation shape found in the stored 18-level source sequences.
 // The priority substitution below is a calculation, not a fresh strategic review.
 const TEMPLATE=[0,1,2,0,0,'R',0,1,0,1,'R',1,1,2,2,'R',2,2];
 function validOrder(order){
  if(!Array.isArray(order)||order.length!==18||order.some(k=>!KEYS[k]))return false;
  const counts={Primary:0,Secondary:0,Alternate:0,Ultimate:0};
  return order.every((k,i)=>{counts[k]++;return k==='Ultimate'?counts[k]<=3&&i+1>=[6,11,16][counts[k]-1]:counts[k]<=5&&counts[k]<=Math.ceil((i+1)/2);})&&BASIC.every(k=>counts[k]===5)&&counts.Ultimate===3;
 }
 function validPriority(p){return Array.isArray(p)&&p.length===3&&new Set(p).size===3&&p.every(k=>BASIC.includes(k));}
 function make(bundle,plan,{variantIndex=null}={}){
  const hero=bundle.heroes?.[plan.slug],stats=hero?.roles?.[plan.role],review=plan.skill_order_review;
  const result={kind:'unavailable',label:'Skill order unavailable',order:[],points:[],notes:[],priority:plan.skill_priority||[],source:null};
  const abilityMap=Object.fromEntries((hero?.abilities||[]).map(a=>[a.key,a]));
  if(Object.values(KEYS).some(k=>!abilityMap[k]))return {...result,reason:'One or more ability names are missing. No button mapping is guessed.'};
  const supportingText=review?.source_abilities;
  const reviewedEvidence=review&&typeof review.reason==='string'&&review.reason.trim()&&Array.isArray(review.sources)&&review.sources.some(s=>/^https:\/\//.test(s.url||''))&&supportingText&&Object.values(KEYS).every(k=>typeof supportingText[k]==='string'&&supportingText[k]&&(abilityMap[k].text||abilityMap[k].description)===supportingText[k]);
  if(plan.kind==='reviewed'&&reviewedEvidence&&review.patch===plan.patch&&Number.isFinite(Date.parse(review.reviewed_at))&&Date.parse(review.reviewed_at)<=Date.now()&&validOrder(review.order)){
   Object.assign(result,{kind:'reviewed',label:'Reviewed level-by-level order',order:[...review.order],source:{reviewed_at:review.reviewed_at,patch:review.patch},reason:review.reason||'Reviewed for this hero, role and loadout.'});
  }else{
   const builds=stats?.builds||[];
   const variant=variantIndex!=null?builds[variantIndex]:builds.filter(b=>b.perk===plan.augment&&b.eternal===plan.eternal).sort((a,b)=>(b.playedGames??-1)-(a.playedGames??-1))[0];
   const matching=variant&&variant.perk===plan.augment&&variant.eternal===plan.eternal;
   const other=plan.slug==='revenant'&&!matching?builds.filter(b=>validOrder(b.popular_skill_order?.skillOrder)).sort((a,b)=>(b.popular_skill_order.playedGames??-1)-(a.popular_skill_order.playedGames??-1))[0]:null;
   const sequence=matching?variant.popular_skill_order:other?.popular_skill_order;
   if(validOrder(sequence?.skillOrder))Object.assign(result,{kind:'observed',label:other?'Observed alternative order · different loadout':'Observed skill order · Statz',order:[...sequence.skillOrder],source:{url:stats.url,fetched_at:stats.fetched_at,patch:bundle.patch,wr:sequence.winRate,played:sequence.playedGames},reason:other?`This source order belongs to ${other.perk} / ${other.eternal}, not the chosen loadout. It is provided for inspection because Revenant's starting rank makes a generic opening unsafe to assume. It is not a reviewed recommendation for the chosen loadout.`:'Source sequence for this augment and Eternal. Popularity and win rate do not establish the optimal order; the exact match window is unconfirmed.'});
   else{
    const priority=validPriority(plan.skill_priority)?plan.skill_priority:plan.review?.skill_priority;
    if(validPriority(priority))Object.assign(result,{kind:'calculated',label:'Calculated starting order · needs review',order:TEMPLATE.map(k=>k==='R'?'Ultimate':priority[k]),priority,source:{reviewed_at:plan.reviewed_at||plan.review?.reviewed_at,patch:plan.patch||plan.review?.patch},reason:'Learn one of each basic ability in priority order, then focus the first, second and third priority; take the ultimate at levels 6, 11 and 16. This expands the saved priority into an example allocation, not a separately reviewed skill plan.'});
    else result.reason='No valid three-ability priority or complete source sequence is available.';
   }
  }
  if(result.kind==='calculated'&&plan.slug==='revenant'){
   // Official notes describe a starting Hellfire Rounds rank; a generic opening
   // could spend a point unnecessarily. Require a source or explicit reviewed order.
   result.kind='unavailable';result.label='Revenant skill order needs review';result.order=[];result.reason='Revenant starts with a rank in Hellfire Rounds. A generic three-skill opening is not substituted for a verified order.';
  }
  if(plan.review&&!plan.review.active||plan.kind!=='reviewed'&&result.kind==='calculated')result.notes.push('The supporting reviewed plan is not active. Treat this as provisional or previous guidance, not current reviewed advice.');
  if((plan.blessings||[]).includes('Early Bloom'))result.notes.push('Early Bloom affects level timing. Follow your actual displayed hero level; this is not a minute-by-minute schedule.');
  result.points=result.order.map((k,i)=>({level:i+1,token:k,key:KEYS[k],name:abilityMap[KEYS[k]].display_name||abilityMap[KEYS[k]].name||KEYS[k],text:abilityMap[KEYS[k]].text||abilityMap[KEYS[k]].description||''}));
  return result;
 }
 return {KEYS,validOrder,validPriority,make};
});
