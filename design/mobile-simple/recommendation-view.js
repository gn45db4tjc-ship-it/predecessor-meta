/* Presentation selection only. Never changes source figures or engine rankings. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RecommendationView=api;})(globalThis,function(){
 'use strict';
 function partnerShortlist(ranked,limit=5){
  const unique=ranked.filter((r,i,a)=>r?.slug&&a.findIndex(x=>x.slug===r.slug)===i);
  if(unique.length<=limit)return unique;
  // Keep the engine's first candidate. Diversity can use candidates no more than
  // one kit-fit point below the last candidate in the original top-five window.
  const floor=unique[limit-1]?.fit?.score;
  const eligible=unique.filter((r,i)=>i<limit||Number.isFinite(floor)&&Number.isFinite(r.fit?.score)&&r.fit.score>=floor-1);
  const chosen=[unique[0]],seenRoles=new Set([unique[0].role]);
  for(const r of eligible){if(chosen.length===limit)break;if(!seenRoles.has(r.role)&&!chosen.some(x=>x.slug===r.slug)){chosen.push(r);seenRoles.add(r.role);}}
  for(const r of unique){if(chosen.length===limit)break;if(!chosen.some(x=>x.slug===r.slug))chosen.push(r);}
  // Display in the engine order, even when the selection includes a different role.
  return unique.filter(r=>chosen.some(x=>x.slug===r.slug));
 }
 function counterplay(engine,heroes,slug,role){
  const strategy=engine.heroStrategy(slug);
  const named=engine.counterIdeas(slug,role).filter(r=>r.active&&r.slug!==slug);
  const observed=Object.keys(heroes).filter(s=>s!==slug).flatMap(s=>{
   const row=engine.currentMatchup({slug,role},{slug:s},100);
   // The enemy's role is unknown. An above-50% matchup is not a counter merely
   // because it is the lowest row remaining in a selective source list.
   return row&&Number.isFinite(row.wr)&&row.wr<50&&Number.isFinite(row.played)&&row.played>=100?[{slug:s,...row}]:[];
  }).sort((a,b)=>a.wr-b.wr||b.played-a.played);
  const picks=[];
  for(const r of named){if(picks.length===3)break;if(!picks.some(x=>x.slug===r.slug))picks.push({...r,evidenceKind:'reviewed',observation:observed.find(x=>x.slug===r.slug)||null});}
  for(const r of observed){if(picks.length===3)break;if(!picks.some(x=>x.slug===r.slug))picks.push({...r,evidenceKind:'observed'});}
  const tips=strategy?.counterplay?String(strategy.counterplay).split(/(?<=[.!?])\s+/).filter(Boolean):[];
  // Preserve every word when condensing long advice into at most three entries.
  const points=tips.length<=3?tips:[tips[0],tips[1],tips.slice(2).join(' ')];
  return {picks,strategy,points,available:!!(picks.length||points.length)};
 }
 return {partnerShortlist,counterplay};
});
