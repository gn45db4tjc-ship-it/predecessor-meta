'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../engine');
function fixture(){
 const stamp='2026-09-23T19:00:00Z', old=[{name:'Burn',text:'15 Damage'},{name:'',text:'Damage Dealt: [DamageDealt]'}],fresh=[{name:'Burn',text:'15 magical damage'}];
 const plan={slug:'hero',role:'jungle',patch:'1.17',reviewed_at:'2026-09-22T19:00:00Z',core:['One'],finish:['Two'],eternal:'Eternal',blessings:['A','B'],patch_review:{result:'checked and retained',reviewed_at:'2026-09-22T19:00:00Z'},source_preconditions:{items:{One:{effects:old,completed_item:true}},abilities:{Q:'16% scaling'},perks:{Augment:'Old definition'}}};
 const rows=[{kind:'items',subject:'One',key:'effects',expected:old,accepted:fresh},{kind:'abilities',subject:'hero',key:'Q',expected:'16% scaling',accepted:'14% scaling'},{kind:'perks',subject:'Augment',key:'description',expected:'Old definition',accepted:'Reviewed definition'}].map(r=>({...r,reason:'Reviewed exact field, not arbitrary source changes',source:'https://pred.gg/items?version=167',source_fetched_at:stamp}));
 return {heroes:{hero:{roles:{jungle:{status:'unavailable'}},roles_order:['jungle'],abilities:[{key:'Q',text:'14% scaling'}]}},items:{one:{name:'One',effects:structuredClone(fresh),completed_item:true},two:{name:'Two',completed_item:true}},perks:{augment:{display_name:'Augment',description:'Reviewed definition'}},official:{status:'verified',live:{version:'1.17'},articles:[{version:'1.17',status:'live',fingerprint:'live'}]},guidance:{patch:'1.16.4',status:'needs review',builds:[plan],build_patch_review:{patch:'1.17',reviewed_at:stamp,article_fingerprints:{'1.17':'live'},loadout_catalog:{eternals:{Eternal:{BLESSING_MINOR_1:['A'],BLESSING_MINOR_2:['B']}}},source_reconciliation:{patch:'1.17',reviewed_at:stamp,article_fingerprints:{'1.17':'live'},entries:rows}}}};
}
test('exact reviewed source transitions restore builds without rewriting source data or the original review date',()=>{
 const b=fixture(),before=structuredClone(b),r=M.create(b).buildReview('hero','jungle');
 assert.equal(r.active,true);assert.equal(r.reviewed_at,'2026-09-22T19:00:00Z');assert.equal(r.source_reconciliation.entries.length,3);assert.deepEqual(b,before);
});
test('unknown numeric, damage-type, trigger and item changes remain withheld',()=>{
 for(const change of [b=>b.items.one.effects[0].text='16 magical damage',b=>b.items.one.effects[0].text='15 physical damage',b=>b.items.one.effects.push({name:'New trigger',text:'On cast'}),b=>b.heroes.hero.abilities[0].text='18% scaling',b=>b.perks.augment.description='Unknown',b=>b.items.one.completed_item=false]){
  const b=fixture();change(b);assert.equal(M.create(b).buildReview('hero','jungle').active,false);
 }
});
test('reconciliation is bound to its old field, subject, patch, official article, source and real date',()=>{
 const changes=[r=>r.patch='1.18',r=>r.reviewed_at='2099-01-01T00:00:00Z',r=>r.article_fingerprints['1.17']='changed',r=>delete r.article_fingerprints['1.17'],r=>r.entries[0].expected=[],r=>r.entries[0].subject='Another item',r=>r.entries[0].source='',r=>r.entries[0].reason=''];
 for(const change of changes){const b=fixture();change(b.guidance.build_patch_review.source_reconciliation);assert.equal(M.create(b).buildReview('hero','jungle').active,false);}
 const b=fixture();b.official.articles[0].fingerprint='hotfix';assert.equal(M.create(b).buildReview('hero','jungle').active,false);
});
test('a reconciliation never activates an unresolved role or refreshes global strategy',()=>{
 const b=fixture();b.guidance.builds[0].patch_review.result='unresolved';assert.equal(M.create(b).buildReview('hero','jungle').active,false);assert.equal(M.create(b).evidenceState().guidance.state,'needs-review');
});
