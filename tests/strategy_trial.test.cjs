'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const K=require('../skill_guide.js');
const packet=JSON.parse(fs.readFileSync(path.join(__dirname,'../reviewed_guidance.json'),'utf8'));
const trial=JSON.parse(fs.readFileSync(path.join(__dirname,'../strategy-reviews/2026-09-22-trial/ledger.json'),'utf8'));
function fixture(entry){
 const plan=structuredClone(packet.guidance.builds.find(p=>p.slug===entry.slug&&p.role===entry.role));
 const text=plan.skill_order_review?.source_abilities||plan.source_preconditions.abilities;
 const bundle={patch:'1.16',heroes:{[plan.slug]:{abilities:Object.entries(text).map(([key,text])=>({key,text,display_name:key})),roles:{[plan.role]:{status:'unavailable'}}}}};
 return {plan:{...plan,kind:'reviewed'},bundle};
}
test('five-plan trial stays separate from a full strategy review and preserves all six source scopes',()=>{
 assert.equal(trial.plans.length,5);assert.equal(packet.patch,'1.16.4');assert.match(packet.reviewed_at,/^2026-09-14/);
 assert.equal(trial.recurrence,'None authorized by this trial');
 for(const p of trial.plans){
  assert.equal(new Set(p.brackets.map(b=>b.bracket)).size,6);
  for(const b of p.brackets){assert.equal(b.dataset_label,'1.16');assert.equal(b.pred_status,'failed');if(b.role_status!=='ok')assert.equal(b.observed_role,null);}
  assert.ok(p.sources.every(s=>s.fetched_at&&s.url.startsWith('https://')));
 }
});
test('all four authored schedules pass the real skill-guide path with legal ranks and contextual reasons',()=>{
 for(const entry of trial.plans.filter(p=>p.level_order)){
  const {bundle,plan}=fixture(entry),result=K.make(bundle,plan);
  assert.equal(result.kind,'reviewed',entry.slug);assert.ok(K.validOrder(result.order));assert.equal(result.points.length,18);
  assert.deepEqual(result.points.filter(p=>p.token==='Ultimate').map(p=>p.level),[6,11,16]);
  assert.ok(result.reason.length>250);assert.equal(result.source.patch,'1.17');
 }
});
test('changed mechanics, future dates or an inactive build cannot promote a skill schedule',()=>{
 const entry=trial.plans.find(p=>p.slug==='gideon');
 for(const mutate of [x=>x.bundle.heroes.gideon.abilities.find(a=>a.key==='E').text='Changed portal mechanics',x=>x.plan.skill_order_review.reviewed_at='2099-01-01',x=>x.plan.kind='provisional']){
  const x=fixture(entry);mutate(x);assert.notEqual(K.make(x.bundle,x.plan).kind,'reviewed');
 }
});
test('Gideon safety opening differs from the generic priority expansion; Muriel remains unresolved',()=>{
 const g=trial.plans.find(p=>p.slug==='gideon'),m=trial.plans.find(p=>p.slug==='muriel');
 const {bundle,plan}=fixture(g);assert.equal(K.make(bundle,plan).points[1].key,'E');
 assert.equal(plan.skill_priority[1],'Alternate');
 assert.equal(m.skill_verdict,'unresolved');assert.equal(m.level_order,null);assert.ok(!m.proposed.skill_order_review);
 assert.match(m.skill_reason,/Serenity-first, not Alacrity-first/);
});
test('Serath has one stated default and Greystone purchases dedicated armor before a third damage item',()=>{
 const s=packet.guidance.builds.find(p=>p.slug==='serath'&&p.role==='jungle');
 assert.equal(s.eternal,'Thraex');assert.doesNotMatch(s.rune_note,/Weald is the default|current Pred.gg Jungle observations/);
 assert.match(s.rune_note,/proc-type damage/);
 const g=packet.guidance.builds.find(p=>p.slug==='greystone'&&p.role==='jungle');
 assert.equal(g.core[2],"Giant's Ring");assert.equal(g.finish[0],'Basilisk');
 assert.deepEqual(g.item_notes.map(n=>n.item),g.core.concat(g.finish));
 assert.match(g.item_notes[2].reason,/stasis/);
});
