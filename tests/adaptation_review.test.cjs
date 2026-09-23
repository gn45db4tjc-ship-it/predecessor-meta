'use strict';
// A dated adaptation review authorizes match adaptation of an active patch-reviewed build without renewing
// the global strategy review. It is bound to the item-need and enemy-kit classifications it checked.
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../engine.js'),{fixture:coach}=require('./build_coach.test.cjs');
const stamp='2026-09-23T19:00:00Z';
// Hand-derived from the synthetic fixture: which completed items each rule selects, and each enemy's base-kit tags.
const reviewed={items:{physical_armor:['Armor'],magical_armor:['Ward'],anti_heal:['Healcut'],tenacity:[],'tank_buster:physical':[],'tank_buster:magical':[],'tank_buster:none':[],anti_shield:['Dart'],spell_shield:[],anti_autos:[],burst_insurance:[]},
 heroes:{healer:['physical','healer'],hero:['physical','frontline','autos'],magic:['magical','burst'],physical:['physical','autos'],shield:['physical','shielder']}};
function fixture(){
 const b=coach();
 b.official={status:'verified',live:{version:'1.17'},articles:[{version:'1.17',status:'live',fingerprint:'live'}]};
 // The global tier/strategy review is overdue; the build review is current.
 b.guidance.patch='1.16.4';b.guidance.status='needs review';
 Object.assign(b.guidance.builds[0],{patch:'1.17',reviewed_at:stamp,eternal:'Eternal',patch_review:{result:'changed',reviewed_at:stamp},
  source_preconditions:{abilities:{Q:'Fixture hero'},items:{},perks:{}}});
 b.guidance.build_patch_review={patch:'1.17',reviewed_at:stamp,article_fingerprints:{'1.17':'live'},loadout_catalog:{eternals:{Eternal:{BLESSING_MINOR_1:[],BLESSING_MINOR_2:[]}}},
  adaptation_review:{patch:'1.17',reviewed_at:stamp,method:'Synthetic classification check',classifications:structuredClone(reviewed)}};
 return b;
}
const me={slug:'hero',role:'jungle'},enemies=[{slug:'physical',role:'carry'},{slug:'magic',role:'midlane'},{slug:'healer',role:'support'},{slug:'shield',role:'offlane'}];
test('an overdue tier review leaves the reviewed build active and does not block a reviewed adaptation',()=>{
 const b=fixture(),e=M.create(b);
 assert.equal(e.buildReview('hero','jungle').active,true);
 const a=e.adaptBuild(me,[],enemies,{state:'even',primaryThreat:'magic'});
 assert.equal(a.available,true,a.unavailableReason);assert.deepEqual(a.slots.slice(0,3).map(s=>s.name),['A','B','C']);
 assert.equal(e.evidenceState().guidance.state,'needs-review');
});
test('the classifications the engine acts on are reported exactly',()=>{
 assert.deepEqual(M.create(fixture()).adaptationClassifications(),reviewed);
});
test('a changed item or kit classification withholds adaptation but keeps the reviewed build',()=>{
 const changes=[b=>b.items.Healcut.effects[0].text='Deal bonus damage.',b=>b.items.A.stats['Physical armor']='40',b=>b.heroes.magic.capabilities.push('hard_cc'),b=>b.heroes.magic.capability_evidence.magical=[],b=>b.items.New={name:'New',completed_item:true,stats:{'Magical armor':'45'},effects:[]}];
 for(const change of changes){
  const b=fixture();change(b);const e=M.create(b),a=e.adaptBuild(me,[],enemies,{state:'even'});
  assert.equal(a.available,false);assert.match(a.unavailableReason,/classif/i);assert.equal(e.buildReview('hero','jungle').active,true);
 }
});
test('the adaptation review is bound to its patch, official article and a real date',()=>{
 const changes=[b=>b.guidance.build_patch_review.adaptation_review.patch='1.16.4',b=>b.guidance.build_patch_review.adaptation_review.reviewed_at='2099-01-01T00:00:00Z',
  b=>delete b.guidance.build_patch_review.adaptation_review,b=>b.official.articles[0].fingerprint='hotfix',b=>b.official.status='failed'];
 for(const change of changes){const b=fixture();change(b);assert.equal(M.create(b).adaptBuild(me,[],enemies,{state:'even'}).available,false);}
});
test('an adaptation review never activates an unresolved or inactive build',()=>{
 const b=fixture();b.guidance.builds[0].patch_review.result='unresolved';
 const a=M.create(b).adaptBuild(me,[],enemies,{state:'even'});assert.equal(a.available,false);assert.deepEqual(a.slots,[]);
});
test('a typed damage wording classifies like the untyped published wording',()=>{
 // Published: "Max Health as Damage"; the current public renderer names the type ("as physical damage").
 const texts=[["Deal 1% of their Max Health as Damage.","Deal 1% of their Max Health as physical damage."],["Deal 6% of Target's Bonus Health as Damage over 3s.","Deal 6% of Target's Bonus Health as magical damage over 3s."],["Deal 5% of Target's Current Health as Damage On-Hit.","Deal 5% of Target's Current Health as physical damage On-Hit."]];
 for(const [published,typed] of texts){
  const a=fixture(),b=fixture();a.items.Rend={name:'Rend',completed_item:true,stats:{},effects:[{name:'Rend',condition:'',text:published}]};b.items.Rend={...structuredClone(a.items.Rend),effects:[{name:'Rend',condition:'',text:typed}]};
  const ca=M.create(a).adaptationClassifications(),cb=M.create(b).adaptationClassifications();
  assert.ok(Object.values(ca.items).some(v=>v.includes('Rend')),published);assert.deepEqual(cb,ca,typed);
 }
});
test('evidence state reports build readiness, adaptation readiness and the overdue tier review separately',()=>{
 const s=M.create(fixture()).evidenceState();
 assert.equal(s.guidance.state,'needs-review');
 assert.deepEqual({patch:s.builds?.patch,ready:s.builds?.ready,total:s.builds?.total,adaptation:s.builds?.adaptation},{patch:'1.17',ready:1,total:1,adaptation:'reviewed'});
 assert.ok(s.limitations.some(t=>/dated advice for patch 1\.16\.4/.test(t)&&/Starting builds were reviewed separately for patch 1\.17/.test(t)));
 const b=fixture();b.items.Healcut.effects[0].text='Deal bonus damage.';assert.equal(M.create(b).evidenceState().builds.adaptation,'withheld');
});
