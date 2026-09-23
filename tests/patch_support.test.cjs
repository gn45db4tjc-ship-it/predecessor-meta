'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),data=require('../patch-1.17.json'),packet=require('../reviewed_guidance.json');
const M=require('../engine'),K=require('../skill_guide');
function bundle(){
 const heroes=structuredClone(data.heroes),plan=structuredClone(data.plans[0]);
 for(const row of [...data.hero_context.valmont.counters,...data.hero_context.valmont.partners])for(const [slug,texts] of Object.entries(row.source_abilities))if(!heroes[slug])heroes[slug]={display_name:slug,abilities:Object.entries(texts).map(([key,text])=>({key,text})),roles_order:[row.role],roles:{[row.role]:{status:'unavailable'}}};
 heroes.valmont.patch_context={...structuredClone(data.hero_context.valmont),active:true};
 const items=Object.fromEntries(Object.entries(plan.source_preconditions.items).map(([name,v])=>[name,{name,...v}]));
 const perks=Object.fromEntries(Object.entries(plan.source_preconditions.perks).map(([display_name,description])=>[display_name,{display_name,description}]));
 const review={...structuredClone(packet.guidance.build_patch_review),loadout_definitions:{...packet.guidance.build_patch_review.loadout_definitions,...data.definitions}};
 return {patch:'1.16',heroes,items,perks,pairs:{},patch_support:{active:true},official:{status:'verified',live:{version:'1.17'},articles:Object.entries(data.article_fingerprints).map(([version,fingerprint])=>({version,fingerprint,status:'live'}))},guidance:{patch:'1.16.4',status:'needs review',build_patch_review:review,builds:[plan]}};
}
test('Valmont starter and legal skill schedule need no invented observed outcome',()=>{
 const b=bundle(),e=M.create(b),p=e.plannedBuild('valmont','midlane');assert.equal(p.kind,'reviewed');assert.equal(p.items.length,6);
 assert.equal(e.performance({slug:'valmont',role:'midlane'}),null);assert.equal(e.pair('valmont','steel'),null);
 const k=K.make(b,p);assert.equal(k.kind,'reviewed');assert.equal(k.points.length,18);assert.ok(K.validOrder(k.order));
 // 2.32: a current-patch Bronze+ sample now exists; the caution states it and still claims no Gold+ sample.
 assert.match(p.caution,/433 1\.17 Bronze\+ games, with no Gold\+ sample/);assert.match(p.rune_note,/20-second cooldown/);
});
test('three conditional responses respect bans, filled roles, changed evidence and do not fabricate samples',()=>{
 const b=bundle(),e=M.create(b);const rows=e.counterIdeas('valmont','midlane');assert.equal(rows.length,3);assert(rows.every(r=>r.active&&!r.observation));
 assert(!e.counterIdeas('valmont','midlane',{bans:['steel']}).some(r=>r.slug==='steel'));
 assert(!e.counterIdeas('valmont','midlane',{allies:[{slug:'muriel',role:'support'}]}).some(r=>r.role==='support'));
 b.heroes.steel.abilities[0].text='changed';assert.equal(M.create(b).counterIdeas('valmont').find(r=>r.slug==='steel').active,false);
});
test('same-version hotfix, failed verification and changed loadout withhold launch recommendations',()=>{
 for(const change of [b=>b.official.articles[0].fingerprint='changed',b=>b.official.status='failed',b=>b.perks['Sanguine Banquet'].description='unknown mechanics']){
  const b=bundle();change(b);assert.equal(M.create(b).buildReview('valmont','midlane').active,false);
 }
});
test('ambiguous Muriel and exceptional Wukong rules never receive a generic point schedule',()=>{
 for(const slug of ['muriel','wukong']){
  const b=bundle();b.heroes[slug]={abilities:b.heroes.valmont.abilities,patch_context:data.hero_context[slug]};
  const p={...data.plans[0],slug,kind:'reviewed'};assert.equal(K.make(b,p).points.length,0);
 }
});
