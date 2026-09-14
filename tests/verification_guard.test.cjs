'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
// Synthetic observations only. This fixture is never included in a public bundle.
function fixture(){
 const ability={key:'R',text:'Synthetic control description',display_name:'Fixture control'};
 const items=Object.fromEntries(['A','B','C','D','E','F'].map(name=>[name.toLowerCase(),{name,completed_item:true,stats:{},effects:[]}]));
 const plan={slug:'example',role:'jungle',patch:'1.16.4',core:['A','B','C'],finish:['D','E','F'],blessings:[],why:'Fixture reasoning'};
 const source={status:'ok',fetched_at:'2026-09-14T12:00:00Z'};
 return {patch:'1.16',bracket:{segment:'gold',label:'Gold+'},items,
  official:{status:'verified',live:{version:'1.16.4'}},sources:{statz_tierlist:source,statz_hero_pages:source},
  heroes:{example:{slug:'example',display_name:'Example',abilities:[ability],capabilities:['hard_cc'],capability_evidence:{hard_cc:[{key:'R',ability:'Fixture control'}]},roles_order:['jungle'],roles:{jungle:{status:'ok',winRate:50,playedGames:200,builds:[{playedGames:200,wonGames:100,winRate:50,core_items:{coreItems:['A','B','C']},items4:[{name:'D',playedGames:150}],items5:[{name:'E',playedGames:140}],items6:[{name:'F',playedGames:120}]}]}}}},
  guidance:{patch:'1.16.4',status:'reviewed for current patch',builds:[plan],
   strategic_review:{patch:'1.16.4',heroes:{example:{source_abilities:{R:ability.text}}}},
   sequence_review:{patch:'1.16.4',abilities:[{slug:'example',key:'R',ability_text:ability.text}]},
   damage_review:{patch:'1.16.4',profiles:{example:{source_abilities:{R:ability.text},primary:['physical'],ability_keys:['R']}}},
   compositions:[{picks:[{slug:'example',role:'jungle'}]}]}};
}
test('verified review activates build, strategy, sequence and damage assessments',()=>{
 const e=Meta.create(fixture());
 assert.equal(e.buildReview('example','jungle').active,true);
 assert.equal(e.heroStrategy('example').active,true);
 assert.equal(e.sequenceReview('example','R').active,true);
 assert.equal(e.damageAssessment('example').active,true);
 assert.equal(e.reviewedComposition(0).active,true);
 assert.equal(e.plannedBuild('example','jungle').kind,'reviewed');
});
for(const status of ['reviewed for saved patch; live check pending','reviewed for saved patch; live verification failed'])test(status+' withholds current advice without destroying evidence',()=>{
 const b=fixture();b.guidance.status=status;const before=JSON.stringify(b),e=Meta.create(b);
 assert.equal(e.buildReview('example','jungle').active,false);
 assert.equal(e.heroStrategy('example').active,false);
 assert.equal(e.sequenceReview('example','R').active,false);
 assert.equal(e.damageAssessment('example').active,false);
 assert.equal(e.reviewedComposition(0).active,false);
 assert.equal(e.performancePolicy().source,null);
 assert.deepEqual(e.plannedBuild('example','jungle').items,[]);
 assert.deepEqual(e.currentItemPool('example','jungle',b.heroes.example.roles.jungle).pool,{});
 assert.equal(e.performance({slug:'example',role:'jungle'},{source:'statz'}).wr,50);
 assert.deepEqual(e.plannedBuild('example','jungle',{forceObserved:true}).items,['A','B','C','D','E','F']);
 assert.deepEqual(e.buildReview('example','jungle').core,['A','B','C']);
 assert.equal(JSON.stringify(b),before);
});
test('failed official check cannot leave a matching-version build active',()=>{
 const b=fixture();b.official.status='failed';const e=Meta.create(b);
 assert.equal(e.buildReview('example','jungle').active,false);
 assert.deepEqual(e.plannedBuild('example','jungle').items,[]);
});
test('public hotfix overlay also withholds editorial and purchase recommendations',()=>{
 const b=fixture();b.recommendation_context={status:'withheld',reason:'Official hotfix changed'};const e=Meta.create(b);
 assert.equal(e.buildReview('example','jungle').active,false);
 assert.equal(e.heroStrategy('example').active,false);
 assert.equal(e.sequenceReview('example','R').active,false);
 assert.equal(e.reviewedComposition(0).active,false);
 assert.deepEqual(e.currentItemPool('example','jungle',{}).pool,{});
});
test('fresh observed builds remain available when only authored advice needs review',()=>{
 const b=fixture();b.guidance.status='needs review';const e=Meta.create(b);
 assert.equal(e.buildReview('example','jungle').active,false);
 assert.equal(e.performancePolicy().source,'statz');
 assert.deepEqual(e.plannedBuild('example','jungle').items,['A','B','C','D','E','F']);
 assert.equal(e.plannedBuild('example','jungle').kind,'provisional');
});
test('retained, undated and prior-patch variants cannot become automatic starting builds',()=>{
 for(const change of [b=>b.sources.statz_hero_pages={status:'retained'},b=>b.sources.statz_hero_pages={status:'ok'},b=>b.patch='1.15']){
  const b=fixture();b.guidance.status='needs review';change(b);const e=Meta.create(b);
  assert.deepEqual(e.plannedBuild('example','jungle').items,[]);
  assert.equal(e.buildSummary('example','jungle').build.winRate,50);
 }
});
test('successful verification restores recommendations through a new bundle',()=>{
 const saved=fixture();saved.guidance.status='reviewed for saved patch; live verification failed';
 assert.equal(Meta.create(saved).buildReview('example','jungle').active,false);
 assert.equal(Meta.create(fixture()).buildReview('example','jungle').active,true);
 assert.match(saved.guidance.status,/failed/);
});
